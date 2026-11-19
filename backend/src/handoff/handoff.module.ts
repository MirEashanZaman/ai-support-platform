import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Server, Socket } from 'socket.io';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ConversationStatus } from '../common/enums/conversation-status.enum';
import { MessageSender } from '../common/enums/message-sender.enum';
import { Role } from '../common/enums/role.enum';
import { ConversationEntity, MessageEntity } from '../database/entities';
import { RlsTransactionService } from '../database/rls-transaction.service';
import { ConversationStateMachine } from './state-machine/conversation-state-machine';

export class AgentReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: '*', credentials: true },
})
export class HandoffGateway {
  @WebSocketServer()
  server?: Server;

  @SubscribeMessage('joinTenantInbox')
  handleJoinTenantInbox(
    @MessageBody() payload: { tenantId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (payload?.tenantId) {
      client.join(`tenant:${payload.tenantId}`);
    }
    return { joined: payload?.tenantId };
  }

  @SubscribeMessage('joinCustomerSession')
  handleJoinCustomerSession(
    @MessageBody() payload: { customerSession: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (payload?.customerSession) {
      client.join(`session:${payload.customerSession}`);
    }
    return { joinedSession: payload?.customerSession };
  }

  emitTenantEvent(tenantId: string, event: string, data: unknown): void {
    this.server?.to(`tenant:${tenantId}`).emit(event, data);
  }

  emitCustomerSessionEvent(
    customerSession: string,
    event: string,
    data: unknown,
  ): void {
    this.server?.to(`session:${customerSession}`).emit(event, data);
  }
}

@Injectable()
export class HandoffService {
  constructor(
    private readonly rlsTransaction: RlsTransactionService,
    private readonly handoffGateway: HandoffGateway,
  ) {}

  async getQueue() {
    return this.rlsTransaction.runInCurrentTenant(async (manager) => {
      const convRepo = manager.getRepository(ConversationEntity);
      const msgRepo = manager.getRepository(MessageEntity);

      const conversations = await convRepo.find({
        where: [
          { status: ConversationStatus.WAITING },
          { status: ConversationStatus.HUMAN },
        ],
        order: { updatedAt: 'DESC' },
      });

      const enriched = await Promise.all(
        conversations.map(async (conv) => {
          const messages = await msgRepo.find({
            where: { conversationId: conv.id },
            order: { createdAt: 'ASC' },
          });
          const lastMessage = messages[messages.length - 1] ?? null;
          return {
            ...conv,
            messageCount: messages.length,
            lastMessagePreview: lastMessage?.content?.slice(0, 140) ?? null,
          };
        }),
      );

      return enriched;
    });
  }

  async getConversationTranscript(conversationId: string) {
    return this.rlsTransaction.runInCurrentTenant(async (manager) => {
      const convRepo = manager.getRepository(ConversationEntity);
      const msgRepo = manager.getRepository(MessageEntity);

      const conversation = await convRepo.findOne({
        where: { id: conversationId },
      });
      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      const messages = await msgRepo.find({
        where: { conversationId: conversation.id },
        order: { createdAt: 'ASC' },
      });

      return {
        conversation,
        messages,
      };
    });
  }

  async claimConversation(conversationId: string, user: AuthenticatedUser) {
    return this.rlsTransaction.runWithTenant(user.tenantId, async (manager) => {
      const repo = manager.getRepository(ConversationEntity);
      const conv = await repo.findOne({ where: { id: conversationId } });
      if (!conv) {
        throw new NotFoundException('Conversation not found');
      }

      conv.status = ConversationStateMachine.assertTransition(
        conv.status,
        ConversationStatus.HUMAN,
      );
      conv.claimedByUserId = user.userId;
      const saved = await repo.save(conv);

      this.handoffGateway.emitTenantEvent(
        user.tenantId,
        'handoff:claimed',
        saved,
      );
      this.handoffGateway.emitCustomerSessionEvent(
        saved.customerSession,
        'handoff:claimed',
        {
          conversationId: saved.id,
          status: saved.status,
          claimedByUserId: saved.claimedByUserId,
        },
      );
      return saved;
    });
  }

  async replyToConversation(
    conversationId: string,
    user: AuthenticatedUser,
    dto: AgentReplyDto,
  ) {
    return this.rlsTransaction.runWithTenant(user.tenantId, async (manager) => {
      const convRepo = manager.getRepository(ConversationEntity);
      const msgRepo = manager.getRepository(MessageEntity);

      const conv = await convRepo.findOne({ where: { id: conversationId } });
      if (!conv) {
        throw new NotFoundException('Conversation not found');
      }

      conv.status = ConversationStateMachine.assertTransition(
        conv.status,
        ConversationStatus.HUMAN,
      );
      conv.claimedByUserId = user.userId;
      await convRepo.save(conv);

      const message = await msgRepo.save(
        msgRepo.create({
          tenantId: user.tenantId,
          conversationId: conv.id,
          sender: MessageSender.AGENT,
          content: dto.content.trim(),
          citations: [],
        }),
      );

      this.handoffGateway.emitTenantEvent(
        user.tenantId,
        'handoff:message',
        message,
      );
      this.handoffGateway.emitCustomerSessionEvent(
        conv.customerSession,
        'handoff:message',
        message,
      );
      return message;
    });
  }

  async closeConversation(conversationId: string, user: AuthenticatedUser) {
    return this.rlsTransaction.runWithTenant(user.tenantId, async (manager) => {
      const repo = manager.getRepository(ConversationEntity);
      const conv = await repo.findOne({ where: { id: conversationId } });
      if (!conv) {
        throw new NotFoundException('Conversation not found');
      }

      conv.status = ConversationStateMachine.assertTransition(
        conv.status,
        ConversationStatus.CLOSED,
      );
      const saved = await repo.save(conv);

      this.handoffGateway.emitTenantEvent(
        user.tenantId,
        'handoff:closed',
        saved,
      );
      this.handoffGateway.emitCustomerSessionEvent(
        saved.customerSession,
        'handoff:closed',
        {
          conversationId: saved.id,
          status: saved.status,
        },
      );
      return saved;
    });
  }
}

@Controller('handoff')
export class HandoffController {
  constructor(private readonly handoffService: HandoffService) {}

  @Get('queue')
  @Roles(Role.OWNER, Role.AGENT, Role.VIEWER)
  async getQueue() {
    return this.handoffService.getQueue();
  }

  @Get(':id/messages')
  @Roles(Role.OWNER, Role.AGENT, Role.VIEWER)
  async getTranscript(@Param('id') id: string) {
    return this.handoffService.getConversationTranscript(id);
  }

  @Post(':id/claim')
  @Roles(Role.OWNER, Role.AGENT)
  async claim(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.handoffService.claimConversation(id, user);
  }

  @Post(':id/reply')
  @Roles(Role.OWNER, Role.AGENT)
  async reply(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AgentReplyDto,
  ) {
    return this.handoffService.replyToConversation(id, user, dto);
  }

  @Post(':id/close')
  @Roles(Role.OWNER, Role.AGENT)
  async close(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.handoffService.closeConversation(id, user);
  }
}

@Module({
  controllers: [HandoffController],
  providers: [HandoffService, HandoffGateway],
  exports: [HandoffService, HandoffGateway],
})
export class HandoffModule {}
