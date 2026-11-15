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

  emitTenantEvent(tenantId: string, event: string, data: unknown): void {
    this.server?.to(`tenant:${tenantId}`).emit(event, data);
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
      return manager.getRepository(ConversationEntity).find({
        where: [
          { status: ConversationStatus.WAITING },
          { status: ConversationStatus.HUMAN },
        ],
        order: { updatedAt: 'DESC' },
      });
    });
  }

  async claimConversation(conversationId: string, user: AuthenticatedUser) {
    return this.rlsTransaction.runWithTenant(user.tenantId, async (manager) => {
      const repo = manager.getRepository(ConversationEntity);
      const conv = await repo.findOne({ where: { id: conversationId } });
      if (!conv) {
        throw new NotFoundException('Conversation not found');
      }
      conv.status = ConversationStatus.HUMAN;
      conv.claimedByUserId = user.userId;
      const saved = await repo.save(conv);
      this.handoffGateway.emitTenantEvent(
        user.tenantId,
        'handoff:claimed',
        saved,
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

      conv.status = ConversationStatus.HUMAN;
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
      conv.status = ConversationStatus.CLOSED;
      const saved = await repo.save(conv);
      this.handoffGateway.emitTenantEvent(
        user.tenantId,
        'handoff:closed',
        saved,
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

