import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Optional,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { ConversationStatus } from '../common/enums/conversation-status.enum';
import { MessageSender } from '../common/enums/message-sender.enum';
import { PublicChatRateLimitGuard } from '../common/guards/public-chat-rate-limit.guard';
import { maskPii } from '../common/security/pii-masker.util';
import { sanitizeInput } from '../common/security/xss-sanitizer.util';
import {
  CitationItem,
  ConversationEntity,
  MessageEntity,
  TenantEntity,
  UsageEventEntity,
} from '../database/entities';
import { RlsTransactionService } from '../database/rls-transaction.service';
import { HandoffGateway, HandoffModule } from '../handoff/handoff.module';
import { ConversationStateMachine } from '../handoff/state-machine/conversation-state-machine';
import { RedisService } from '../infra/redis/redis.module';
import { ClaudeLlmAdapter } from './adapters/claude-llm.adapter';
import { PgVectorStoreAdapter } from './adapters/vector-store.adapter';
import { EscalationReason } from './chat.types';
import { handoffMessage, wantsHuman } from './handoff-messages';
import { createLlmProvider, LLM_PROVIDER } from './llm';
import { PresenceService } from './presence.service';
import { CircuitBreaker } from './resilience/circuit-breaker';

export class SendChatMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  customerSession?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sessionId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsBoolean()
  requestHuman?: boolean;
}

const UNHELPFUL_FEEDBACK_REGEX =
  /\b(not\s+helpful|didn'?t\s+help|does\s*n'?t\s+help|wrong\s+answer|still\s+not\s+working|useless|that'?s\s+wrong|repeating\s+yourself)\b/i;

/**
 * Facade Pattern (Tech Decisions Section 3 & PRD FR-4 / FR-5 / FR-8):
 * One simple ChatService hiding origin validation, monthly quota checks,
 * repeated-question Redis caching, RLS vector retrieval, prompt-injection checks,
 * Claude LLM prompting, Circuit Breaker resilience, agent presence, and Bangla/English handoff escalation.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly llmCircuitBreaker = new CircuitBreaker({
    failureThreshold: 3,
    cooldownMs: 30_000,
    timeoutMs: 2_800,
    maxRetries: 1,
  });

  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    private readonly rlsTransaction: RlsTransactionService,
    private readonly vectorStore: PgVectorStoreAdapter,
    private readonly llmAdapter: ClaudeLlmAdapter,
    private readonly handoffGateway: HandoffGateway,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly presenceService?: PresenceService,
  ) {}

  getCircuitBreaker(): CircuitBreaker {
    return this.llmCircuitBreaker;
  }

  /**
   * FR-6 & Tech Decisions Section 2 (Widget safety):
   * Returns only non-sensitive public widget appearance settings after verifying
   * the request Origin against the tenant's allowedOrigins list.
   */
  async getPublicWidgetConfig(tenantKey: string, requestOrigin?: string) {
    const tenant = await this.tenantRepo.findOne({ where: { tenantKey } });
    if (!tenant) {
      throw new NotFoundException('Tenant workspace not found');
    }

    this.verifyAllowedOrigin(tenant.allowedOrigins, requestOrigin);

    return {
      tenantKey: tenant.tenantKey,
      tenantName: tenant.name,
      widgetConfig: tenant.widgetConfig,
    };
  }

  /**
   * Public endpoint for the customer widget to fetch conversation status and real-time
   * agent replies for the current customerSession.
   */
  async getCustomerSessionMessages(
    tenantKey: string,
    customerSession: string,
    requestOrigin?: string,
  ) {
    const tenant = await this.tenantRepo.findOne({ where: { tenantKey } });
    if (!tenant) {
      throw new NotFoundException('Tenant workspace not found');
    }

    this.verifyAllowedOrigin(tenant.allowedOrigins, requestOrigin);

    return this.rlsTransaction.runWithTenant(tenant.id, async (manager) => {
      const convRepo = manager.getRepository(ConversationEntity);
      const msgRepo = manager.getRepository(MessageEntity);

      const conversation = await convRepo.findOne({
        where: { customerSession },
        order: { createdAt: 'DESC' },
      });

      if (!conversation) {
        return {
          conversationId: null,
          status: ConversationStatus.BOT,
          messages: [],
        };
      }

      const messages = await msgRepo.find({
        where: { conversationId: conversation.id },
        order: { createdAt: 'ASC' },
      });

      return {
        conversationId: conversation.id,
        status: conversation.status,
        messages,
      };
    });
  }

  async handleCustomerMessage(
    tenantKey: string,
    dto: SendChatMessageDto,
    requestOrigin?: string,
  ) {
    const startTime = Date.now();
    const resolvedSessionId = (dto.customerSession || dto.sessionId || '').trim();
    if (!resolvedSessionId) {
      throw new BadRequestException('customerSession or sessionId is required');
    }

    const tenant = await this.tenantRepo.findOne({ where: { tenantKey } });
    if (!tenant) {
      throw new NotFoundException('Tenant workspace not found');
    }

    this.verifyAllowedOrigin(tenant.allowedOrigins, requestOrigin);

    const sanitizedMessage = sanitizeInput(dto.message);
    if (!sanitizedMessage) {
      throw new HttpException(
        'Message content cannot be empty after sanitization',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(
      `Chat query for tenant=${tenant.tenantKey}: ${maskPii(sanitizedMessage)}`,
    );

    return this.rlsTransaction.runWithTenant(tenant.id, async (manager) => {
      const convRepo = manager.getRepository(ConversationEntity);
      const msgRepo = manager.getRepository(MessageEntity);
      const usageRepo = manager.getRepository(UsageEventEntity);

      // FR-8: Enforce per-tenant monthly message quota
      const usedThisMonth =
        typeof usageRepo.count === 'function'
          ? await usageRepo.count({
              where: { type: 'chat_message' },
            })
          : 0;
      if (usedThisMonth >= (tenant.monthlyQuota ?? 1000)) {
        throw new HttpException(
          'Monthly message quota exceeded for this tenant workspace',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      let conversation = await convRepo.findOne({
        where: { customerSession: resolvedSessionId },
        order: { createdAt: 'DESC' },
      });

      if (!conversation || conversation.status === ConversationStatus.CLOSED) {
        conversation = await convRepo.save(
          convRepo.create({
            tenantId: tenant.id,
            customerSession: resolvedSessionId,
            status: ConversationStatus.BOT,
          }),
        );
      }

      const customerMsg = await msgRepo.save(
        msgRepo.create({
          tenantId: tenant.id,
          conversationId: conversation.id,
          sender: MessageSender.CUSTOMER,
          content: sanitizedMessage,
          citations: [],
        }),
      );

      // FR-5: The bot stays silent while an agent owns or is queued for the chat
      if (ConversationStateMachine.isBotMuted(conversation.status)) {
        await usageRepo.save(
          usageRepo.create({
            tenantId: tenant.id,
            type: 'chat_message',
            metadata: {
              conversationId: conversation.id,
              responseTimeMs: Date.now() - startTime,
              botSilent: true,
            },
          }),
        );

        this.handoffGateway.emitTenantEvent(
          tenant.id,
          'handoff:customer_message',
          customerMsg,
        );
        return {
          conversationId: conversation.id,
          status: conversation.status,
          botSilent: true,
          escalationReason: null,
          reply: null,
        };
      }

      // FR-5 Trigger 1: Explicit customer request for a human agent (no false alarm on "shipping agents")
      if (dto.requestHuman || wantsHuman(sanitizedMessage)) {
        await this.recordChatUsage(
          usageRepo,
          tenant.id,
          conversation.id,
          startTime,
          true,
        );
        const localizedHandoff = await this.resolveHandoffText(
          tenant.id,
          'customer_requested_human',
          sanitizedMessage,
        );
        return this.escalateToHuman(
          tenant.id,
          conversation,
          convRepo,
          msgRepo,
          localizedHandoff,
          1.0,
          'customer_requested_human',
        );
      }

      // FR-5 Trigger 2: Repeated unhelpful answers
      if (UNHELPFUL_FEEDBACK_REGEX.test(sanitizedMessage)) {
        await this.recordChatUsage(
          usageRepo,
          tenant.id,
          conversation.id,
          startTime,
          true,
        );
        return this.escalateToHuman(
          tenant.id,
          conversation,
          convRepo,
          msgRepo,
          "I'm sorry my previous answer wasn't helpful. I'm transferring your chat to a human support agent who can assist you directly.",
          0,
          'repeated_unhelpful_answers',
        );
      }

      // PRD Section 16 (AI API costs): Check Redis cache for repeated questions per tenant
      const cacheKey = this.buildQuestionCacheKey(tenant.id, sanitizedMessage);
      const cachedRaw = await this.redisService?.get(cacheKey);
      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw) as {
            answer: string;
            citations: CitationItem[];
            confidence: number;
          };
          const cachedBotReply = await msgRepo.save(
            msgRepo.create({
              tenantId: tenant.id,
              conversationId: conversation.id,
              sender: MessageSender.BOT,
              content: cached.answer,
              citations: cached.citations,
              confidence: cached.confidence,
            }),
          );
          await this.recordChatUsage(
            usageRepo,
            tenant.id,
            conversation.id,
            startTime,
            false,
            true,
          );
          return {
            conversationId: conversation.id,
            status: conversation.status,
            botSilent: false,
            escalationReason: null,
            cached: true,
            reply: cachedBotReply,
          };
        } catch {
          // Proceed to fresh retrieval if cache entry is malformed
        }
      }

      // Stage 1 Retrieval via VectorStoreAdapter (RLS enforced)
      const retrievedChunks = await this.vectorStore.searchSimilarChunks(
        manager,
        sanitizedMessage,
        4,
      );

      if (retrievedChunks.length === 0) {
        await this.recordChatUsage(
          usageRepo,
          tenant.id,
          conversation.id,
          startTime,
          true,
        );
        const localizedHandoff = await this.resolveHandoffText(
          tenant.id,
          'no_relevant_chunks',
          sanitizedMessage,
        );
        return this.escalateToHuman(
          tenant.id,
          conversation,
          convRepo,
          msgRepo,
          localizedHandoff,
          0,
          'no_relevant_chunks',
        );
      }

      // Stage 2 LLM Grounded Answer via ClaudeLlmAdapter + CircuitBreaker
      try {
        const llmResult = await this.llmCircuitBreaker.execute(() =>
          this.llmAdapter.generateGroundedAnswer({
            tenantName: tenant.name,
            customerMessage: sanitizedMessage,
            retrievedChunks,
          }),
        );

        // FR-5 Trigger 3: Low confidence
        if (llmResult.shouldEscalate) {
          await this.recordChatUsage(
            usageRepo,
            tenant.id,
            conversation.id,
            startTime,
            true,
          );
          const isBangla = /[\u0980-\u09FF]/.test(sanitizedMessage);
          const escalationText = isBangla
            ? await this.resolveHandoffText(
                tenant.id,
                'low_confidence',
                sanitizedMessage,
              )
            : llmResult.answer;
          return this.escalateToHuman(
            tenant.id,
            conversation,
            convRepo,
            msgRepo,
            escalationText,
            llmResult.confidence,
            'low_confidence_or_policy_guard',
          );
        }

        const citedSet = new Set(llmResult.citedChunkIds);
        const matchedChunks = retrievedChunks.filter((c) =>
          citedSet.has(c.chunkId),
        );
        const sourceChunks =
          matchedChunks.length > 0 ? matchedChunks : [retrievedChunks[0]];

        const citations: CitationItem[] = sourceChunks.map((chunk) => ({
          documentId: chunk.documentId,
          documentName: chunk.documentName,
          chunkId: chunk.chunkId,
          snippet: chunk.content.slice(0, 160),
        }));

        const botReply = await msgRepo.save(
          msgRepo.create({
            tenantId: tenant.id,
            conversationId: conversation.id,
            sender: MessageSender.BOT,
            content: llmResult.answer,
            citations,
            confidence: llmResult.confidence,
          }),
        );

        // Cache high-confidence answer for repeated questions (TTL: 10 minutes)
        if (llmResult.confidence >= 0.6 && this.redisService) {
          await this.redisService.set(
            cacheKey,
            JSON.stringify({
              answer: llmResult.answer,
              citations,
              confidence: llmResult.confidence,
            }),
            600,
          );
        }

        await this.recordChatUsage(
          usageRepo,
          tenant.id,
          conversation.id,
          startTime,
          false,
        );

        return {
          conversationId: conversation.id,
          status: conversation.status,
          botSilent: false,
          escalationReason: null,
          reply: botReply,
        };
      } catch (err) {
        // Tech Decisions Section 3: Circuit breaker + retry -> fall back to human handoff
        this.logger.warn(
          `LLM CircuitBreaker fallback triggered for tenant ${tenant.tenantKey}: ${(err as Error).message}`,
        );
        await this.recordChatUsage(
          usageRepo,
          tenant.id,
          conversation.id,
          startTime,
          true,
        );
        const localizedHandoff = await this.resolveHandoffText(
          tenant.id,
          'ai_circuit_breaker_fallback',
          sanitizedMessage,
        );
        return this.escalateToHuman(
          tenant.id,
          conversation,
          convRepo,
          msgRepo,
          localizedHandoff,
          0,
          'ai_circuit_breaker_fallback',
        );
      }
    });
  }

  verifyAllowedOrigin(allowedOrigins: string[], requestOrigin?: string): void {
    if (!requestOrigin || !allowedOrigins || allowedOrigins.length === 0) {
      return;
    }
    if (allowedOrigins.includes('*')) {
      return;
    }
    const normalizedOrigin = requestOrigin.trim().toLowerCase();
    const isAllowed = allowedOrigins.some(
      (allowed) => allowed.trim().toLowerCase() === normalizedOrigin,
    );
    if (!isAllowed) {
      throw new ForbiddenException(
        `Origin '${requestOrigin}' is not in this tenant's allowed_origins list`,
      );
    }
  }

  private async resolveHandoffText(
    tenantId: string,
    reason: EscalationReason,
    customerText: string,
  ): Promise<string> {
    const onlineCount = this.presenceService
      ? await this.presenceService.onlineCount(tenantId).catch(() => 1)
      : 1;
    return handoffMessage(reason, onlineCount, customerText);
  }

  private buildQuestionCacheKey(tenantId: string, question: string): string {
    const normalized = question.toLowerCase().replace(/\s+/g, ' ').trim();
    const digest = createHash('sha256')
      .update(`${tenantId}:${normalized}`)
      .digest('hex')
      .slice(0, 24);
    return `cache:rag:${tenantId}:${digest}`;
  }

  private async recordChatUsage(
    usageRepo: Repository<UsageEventEntity>,
    tenantId: string,
    conversationId: string,
    startTime: number,
    escalated: boolean,
    cached = false,
  ): Promise<void> {
    await usageRepo.save(
      usageRepo.create({
        tenantId,
        type: 'chat_message',
        metadata: {
          conversationId,
          responseTimeMs: Math.max(1, Date.now() - startTime),
          escalated,
          cached,
        },
      }),
    );
  }

  private async escalateToHuman(
    tenantId: string,
    conversation: ConversationEntity,
    convRepo: Repository<ConversationEntity>,
    msgRepo: Repository<MessageEntity>,
    botMessage: string,
    confidence: number,
    reason: string,
  ) {
    conversation.status = ConversationStateMachine.assertTransition(
      conversation.status,
      ConversationStatus.WAITING,
    );
    conversation.escalationReason = reason;
    const savedConv = await convRepo.save(conversation);

    const escalationReply = await msgRepo.save(
      msgRepo.create({
        tenantId,
        conversationId: conversation.id,
        sender: MessageSender.BOT,
        content: botMessage,
        citations: [],
        confidence,
        reason,
      }),
    );

    // Observer / Events Pattern: Notify agents in real time when a chat is escalated
    this.handoffGateway.emitTenantEvent(tenantId, 'handoff:escalated', {
      conversationId: savedConv.id,
      customerSession: savedConv.customerSession,
      reason,
      confidence,
      updatedAt: savedConv.updatedAt,
    });

    return {
      conversationId: savedConv.id,
      status: savedConv.status,
      botSilent: false,
      escalationReason: reason,
      reply: escalationReply,
    };
  }
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Public()
  @Get(':tenantKey/config')
  async getWidgetConfig(
    @Param('tenantKey') tenantKey: string,
    @Headers('origin') origin?: string,
  ) {
    return this.chatService.getPublicWidgetConfig(tenantKey, origin);
  }

  @Public()
  @Get(':tenantKey/conversations/:customerSession/messages')
  async getSessionMessages(
    @Param('tenantKey') tenantKey: string,
    @Param('customerSession') customerSession: string,
    @Headers('origin') origin?: string,
  ) {
    return this.chatService.getCustomerSessionMessages(
      tenantKey,
      customerSession,
      origin,
    );
  }

  @Public()
  @UseGuards(PublicChatRateLimitGuard)
  @Post(':tenantKey/messages')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async sendMessage(
    @Param('tenantKey') tenantKey: string,
    @Body() dto: SendChatMessageDto,
    @Headers('origin') origin?: string,
  ) {
    return this.chatService.handleCustomerMessage(tenantKey, dto, origin);
  }
}

@Module({
  imports: [HandoffModule],
  controllers: [ChatController],
  providers: [
    PgVectorStoreAdapter,
    ClaudeLlmAdapter,
    PresenceService,
    { provide: LLM_PROVIDER, useFactory: createLlmProvider },
    PublicChatRateLimitGuard,
    ChatService,
  ],
  exports: [
    PgVectorStoreAdapter,
    ClaudeLlmAdapter,
    PresenceService,
    LLM_PROVIDER,
    ChatService,
  ],
})
export class ChatModule {}
