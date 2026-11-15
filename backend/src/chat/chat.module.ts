import {
  Body,
  Controller,
  Injectable,
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
import {
  ConversationEntity,
  MessageEntity,
  TenantEntity,
  UsageEventEntity,
} from '../database/entities';
import { RlsTransactionService } from '../database/rls-transaction.service';
import { EmbeddingsService } from '../infra/embeddings/embeddings.module';

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

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    private readonly rlsTransaction: RlsTransactionService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  async handleCustomerMessage(tenantKey: string, dto: SendChatMessageDto) {
    const tenant = await this.tenantRepo.findOne({ where: { tenantKey } });
    if (!tenant) {
      throw new NotFoundException('Tenant workspace not found');
    }

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
          content: dto.message.trim(),
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

      //FR-5: The bot stays silent while an agent owns or is queued for the chat
      if (
        conversation.status === ConversationStatus.HUMAN ||
        conversation.status === ConversationStatus.WAITING
      ) {
        return {
          conversationId: conversation.id,
          status: conversation.status,
          botSilent: true,
          reply: null,
        };
      }

      const queryVector = await this.embeddingsService.embedText(dto.message);
      const vectorLiteral =
        this.embeddingsService.toPgVectorLiteral(queryVector);

      const retrievedChunks: Array<{
        id: string;
        document_id: string;
        document_name: string;
        content: string;
        similarity: number;
      }> = await manager.query(
        `SELECT c.id, c.document_id, d.name AS document_name, c.content,
                1 - (c.embedding <=> $1::vector) AS similarity
         FROM "chunks" c
         INNER JOIN "documents" d ON d.id = c.document_id
         ORDER BY c.embedding <=> $1::vector ASC
         LIMIT 3`,
        [vectorLiteral],
      );

      const topSimilarity = retrievedChunks[0]?.similarity ?? 0;
      const asksForHuman = /\b(human|agent|person|representative)\b/i.test(
        dto.message,
      );

      if (asksForHuman || retrievedChunks.length === 0 || topSimilarity < 0.15) {
        conversation.status = ConversationStatus.WAITING;
        await convRepo.save(conversation);

        const escalationReply = await msgRepo.save(
          msgRepo.create({
            tenantId: tenant.id,
            conversationId: conversation.id,
            sender: MessageSender.BOT,
            content:
              "I'm not completely sure from our documents. I'm connecting you with a human support agent right away.",
            citations: [],
            confidence: Number(topSimilarity.toFixed(3)),
          }),
        );

        return {
          conversationId: conversation.id,
          status: conversation.status,
          botSilent: false,
          reply: escalationReply,
        };
      }

      const citations = retrievedChunks.map((chunk) => ({
        documentId: chunk.document_id,
        documentName: chunk.document_name,
        chunkId: chunk.id,
        snippet: chunk.content.slice(0, 160),
      }));

      const botReply = await msgRepo.save(
        msgRepo.create({
          tenantId: tenant.id,
          conversationId: conversation.id,
          sender: MessageSender.BOT,
          content: retrievedChunks[0].content,
          citations,
          confidence: Number(topSimilarity.toFixed(3)),
        }),
      );

      return {
        conversationId: conversation.id,
        status: conversation.status,
        botSilent: false,
        reply: botReply,
      };
    });
  }
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Public()
  @Post(':tenantKey/messages')
  async sendMessage(
    @Param('tenantKey') tenantKey: string,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chatService.handleCustomerMessage(tenantKey, dto);
  }
}

@Module({
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}

