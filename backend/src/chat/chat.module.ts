import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { ConversationStatus } from '../common/enums/conversation-status.enum';
import { MessageSender } from '../common/enums/message-sender.enum';
import { maskPii } from '../common/security/pii-masker.util';
import {
  CitationItem,
  ConversationEntity,
  MessageEntity,
  TenantEntity,
  UsageEventEntity,
} from '../database/entities';
import { RlsTransactionService } from '../database/rls-transaction.service';
import { HandoffGateway, HandoffModule } from '../handoff/handoff.module';
import { ClaudeLlmAdapter } from './adapters/claude-llm.adapter';
import { PgVectorStoreAdapter } from './adapters/vector-store.adapter';
import { CircuitBreaker } from './resilience/circuit-breaker';

export class SendChatMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  customerSession: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;
}

/**
 * Facade Pattern (Tech Decisions Section 3 & PRD FR-4):
 * One simple ChatService hiding origin validation, RLS vector retrieval,
 * prompt-injection checks, Claude LLM prompting, Circuit Breaker resilience,
 * confidence scoring, and automatic human handoff escalation.
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

  async handleCustomerMessage(
    tenantKey: string,
    dto: SendChatMessageDto,
    requestOrigin?: string,
  ) {
    const tenant = await this.tenantRepo.findOne({ where: { tenantKey } });
    if (!tenant) {
      throw new NotFoundException('Tenant workspace not found');
    }

    this.verifyAllowedOrigin(tenant.allowedOrigins, requestOrigin);

    const sanitizedMessage = dto.message.trim();
    this.logger.log(
      `Chat query for tenant=${tenant.tenantKey}: ${maskPii(sanitizedMessage)}`,
    );

    return this.rlsTransaction.runWithTenant(tenant.id, async (manager) => {
      const convRepo = manager.getRepository(ConversationEntity);
      const msgRepo = manager.getRepository(MessageEntity);
      const usageRepo = manager.getRepository(UsageEventEntity);

      let conversation = await convRepo.findOne({
        where: { customerSession: dto.customerSession },
        order: { createdAt: 'DESC' },
      });

      if (!conversation || conversation.status === ConversationStatus.CLOSED) {
        conversation = await convRepo.save(
          convRepo.create({
            tenantId: tenant.id,
            customerSession: dto.customerSession,
            status: ConversationStatus.BOT,
          }),
        );
      }

      await msgRepo.save(
        msgRepo.create({
          tenantId: tenant.id,
          conversationId: conversation.id,
          sender: MessageSender.CUSTOMER,
          content: sanitizedMessage,
          citations: [],
        }),
      );

      await usageRepo.save(
        usageRepo.create({
          tenantId: tenant.id,
          type: 'chat_message',
          metadata: { conversationId: conversation.id },
        }),
      );

      // FR-5: The bot stays silent while an agent owns or is queued for the chat
      if (
        conversation.status === ConversationStatus.HUMAN ||
        conversation.status === ConversationStatus.WAITING
      ) {
        return {
          conversationId: conversation.id,
          status: conversation.status,
          botSilent: true,
          escalationReason: null,
          reply: null,
        };
      }

      // Trigger 1: Explicit customer request for a human agent (FR-5)
      const explicitHumanRequest =
        /\b(talk\s+to\s+(a\s+)?human|human\s+agent|live\s+agent|real\s+person|speak\s+to\s+someone|representative)\b/i.test(
          sanitizedMessage,
        );

      if (explicitHumanRequest) {
        return this.escalateToHuman(
          tenant.id,
          conversation,
          convRepo,
          msgRepo,
          "I'm connecting you with a human support agent right away.",
          1.0,
          'customer_requested_human',
        );
      }

      // Stage 1 Retrieval via VectorStoreAdapter (RLS enforced)
      const retrievedChunks = await this.vectorStore.searchSimilarChunks(
        manager,
        sanitizedMessage,
        4,
      );

      if (retrievedChunks.length === 0) {
        return this.escalateToHuman(
          tenant.id,
          conversation,
          convRepo,
          msgRepo,
          "I do not know the answer from our current documents. Would you like me to connect you with a human support agent?",
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

        if (llmResult.shouldEscalate) {
          return this.escalateToHuman(
            tenant.id,
            conversation,
            convRepo,
            msgRepo,
            llmResult.answer,
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
        return this.escalateToHuman(
          tenant.id,
          conversation,
          convRepo,
          msgRepo,
          "Our AI assistant is temporarily busy, so I'm transferring your chat to a live human support agent.",
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

  private async escalateToHuman(
    tenantId: string,
    conversation: ConversationEntity,
    convRepo: Repository<ConversationEntity>,
    msgRepo: Repository<MessageEntity>,
    botMessage: string,
    confidence: number,
    reason: string,
  ) {
    conversation.status = ConversationStatus.WAITING;
    const savedConv = await convRepo.save(conversation);

    const escalationReply = await msgRepo.save(
      msgRepo.create({
        tenantId,
        conversationId: conversation.id,
        sender: MessageSender.BOT,
        content: botMessage,
        citations: [],
        confidence,
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
  @Post(':tenantKey/messages')
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
  providers: [PgVectorStoreAdapter, ClaudeLlmAdapter, ChatService],
  exports: [PgVectorStoreAdapter, ClaudeLlmAdapter, ChatService],
})
export class ChatModule {}
