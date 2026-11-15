import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { ConversationStatus } from '../common/enums/conversation-status.enum';
import { MessageSender } from '../common/enums/message-sender.enum';
import { Role } from '../common/enums/role.enum';
import { ConversationEntity, MessageEntity } from '../database/entities';
import { RlsTransactionService } from '../database/rls-transaction.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly rlsTransaction: RlsTransactionService) {}

  async getSummary() {
    return this.rlsTransaction.runInCurrentTenant(async (manager) => {
      const convRepo = manager.getRepository(ConversationEntity);
      const totalChats = await convRepo.count();
      const escalatedChats = await convRepo.count({
        where: [
          { status: ConversationStatus.WAITING },
          { status: ConversationStatus.HUMAN },
        ],
      });
      const botResolvedChats = Math.max(0, totalChats - escalatedChats);

      return {
        totalChats,
        botResolvedChats,
        escalatedChats,
        resolutionRate:
          totalChats > 0
            ? Number(((botResolvedChats / totalChats) * 100).toFixed(1))
            : 100,
      };
    });
  }

  async getUnansweredQuestions() {
    return this.rlsTransaction.runInCurrentTenant(async (manager) => {
      const msgRepo = manager.getRepository(MessageEntity);
      return msgRepo.find({
        where: { sender: MessageSender.CUSTOMER },
        order: { createdAt: 'DESC' },
        take: 20,
      });
    });
  }
}

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @Roles(Role.OWNER, Role.AGENT, Role.VIEWER)
  async getSummary() {
    return this.analyticsService.getSummary();
  }

  @Get('unanswered')
  @Roles(Role.OWNER, Role.AGENT, Role.VIEWER)
  async getUnanswered() {
    return this.analyticsService.getUnansweredQuestions();
  }
}

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

