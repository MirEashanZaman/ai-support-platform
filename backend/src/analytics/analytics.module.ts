import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../common/context/tenant-context.service';
import { Roles } from '../common/decorators/roles.decorator';
import { ConversationStatus } from '../common/enums/conversation-status.enum';
import { MessageSender } from '../common/enums/message-sender.enum';
import { Role } from '../common/enums/role.enum';
import {
  ConversationEntity,
  MessageEntity,
  TenantEntity,
  UsageEventEntity,
} from '../database/entities';
import { RlsTransactionService } from '../database/rls-transaction.service';

export interface TopQuestionItem {
  question: string;
  count: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    private readonly tenantContext: TenantContextService,
    private readonly rlsTransaction: RlsTransactionService,
  ) {}

  /**
   * FR-7 Analytics & FR-8 Usage limits:
   * - Total chats, bot-resolved vs. escalated, average response time.
   * - Top questions and monthly quota usage.
   */
  async getSummary() {
    const tenantId = this.tenantContext.requireTenantId();
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });

    return this.rlsTransaction.runWithTenant(tenantId, async (manager) => {
      const convRepo = manager.getRepository(ConversationEntity);
      const msgRepo = manager.getRepository(MessageEntity);
      const usageRepo = manager.getRepository(UsageEventEntity);

      const totalChats = await convRepo.count();
      const escalatedChats = await convRepo.count({
        where: [
          { status: ConversationStatus.WAITING },
          { status: ConversationStatus.HUMAN },
        ],
      });
      const botResolvedChats = Math.max(0, totalChats - escalatedChats);

      const chatUsageEvents = await usageRepo.find({
        where: { type: 'chat_message' },
        order: { createdAt: 'DESC' },
        take: 200,
      });

      const responseTimes = chatUsageEvents
        .map((e) => Number(e.metadata?.responseTimeMs))
        .filter((val) => Number.isFinite(val) && val > 0);

      const averageResponseTimeMs =
        responseTimes.length > 0
          ? Math.round(
              responseTimes.reduce((sum, val) => sum + val, 0) /
                responseTimes.length,
            )
          : 0;

      const customerMessages = await msgRepo.find({
        where: { sender: MessageSender.CUSTOMER },
        order: { createdAt: 'DESC' },
        take: 200,
      });

      const frequencyMap = new Map<
        string,
        { display: string; count: number }
      >();
      for (const msg of customerMessages) {
        const key = msg.content.toLowerCase().replace(/\s+/g, ' ').trim();
        if (!key) continue;
        const existing = frequencyMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          frequencyMap.set(key, { display: msg.content.trim(), count: 1 });
        }
      }

      const topQuestions: TopQuestionItem[] = Array.from(frequencyMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((item) => ({ question: item.display, count: item.count }));

      const monthlyQuotaUsed = await usageRepo.count({
        where: { type: 'chat_message' },
      });

      return {
        totalChats,
        botResolvedChats,
        escalatedChats,
        resolutionRate:
          totalChats > 0
            ? Number(((botResolvedChats / totalChats) * 100).toFixed(1))
            : 100,
        averageResponseTimeMs,
        monthlyQuotaUsed,
        monthlyQuotaLimit: tenant?.monthlyQuota ?? 5000,
        topQuestions,
      };
    });
  }

  /**
   * FR-7 & PRD Section 6 User Story:
   * "As an Owner, I can see which questions the bot could not answer, so I know which documents to add."
   */
  async getUnansweredQuestions() {
    return this.rlsTransaction.runInCurrentTenant(async (manager) => {
      const convRepo = manager.getRepository(ConversationEntity);
      const msgRepo = manager.getRepository(MessageEntity);

      const escalatedConvs = await convRepo.find({
        where: [
          { status: ConversationStatus.WAITING },
          { status: ConversationStatus.HUMAN },
        ],
        order: { updatedAt: 'DESC' },
        take: 50,
      });

      if (escalatedConvs.length === 0) {
        return [];
      }

      const escalatedIds = new Set(escalatedConvs.map((c) => c.id));
      const customerMsgs = await msgRepo.find({
        where: { sender: MessageSender.CUSTOMER },
        order: { createdAt: 'DESC' },
        take: 100,
      });

      return customerMsgs.filter((m) => escalatedIds.has(m.conversationId));
    });
  }

  /**
   * Tech Decisions Section 2:
   * "Audit logs: who did what and when (uploads, deletes, role changes)."
   */
  async getAuditLogs() {
    return this.rlsTransaction.runInCurrentTenant(async (manager) => {
      const events = await manager.getRepository(UsageEventEntity).find({
        order: { createdAt: 'DESC' },
        take: 50,
      });
      return events.filter((e) => e.type.startsWith('audit.'));
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

  @Get('audit-logs')
  @Roles(Role.OWNER)
  async getAuditLogs() {
    return this.analyticsService.getAuditLogs();
  }
}

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
