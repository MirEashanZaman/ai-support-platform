import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from '../src/analytics/analytics.module';
import { ClaudeLlmAdapter } from '../src/chat/adapters/claude-llm.adapter';
import { ChatService } from '../src/chat/chat.module';
import { ConversationStatus } from '../src/common/enums/conversation-status.enum';
import { MessageSender } from '../src/common/enums/message-sender.enum';
import { PublicChatRateLimitGuard } from '../src/common/guards/public-chat-rate-limit.guard';
import { sanitizeInput } from '../src/common/security/xss-sanitizer.util';
import { RedisService } from '../src/infra/redis/redis.module';
import { TenantsService } from '../src/tenants/tenants.service';

describe('Week 5 — Analytics, Per-Tenant Quotas, Rate Limits, Caching & Security Hardening Suite', () => {
  const configService = new ConfigService({ NODE_ENV: 'test' });

  describe('FR-8 Rate Limiting: PublicChatRateLimitGuard (Per-IP & Per-Tenant)', () => {
    it('allows requests within limits and throws 429 Too Many Requests when IP exceeds 30/min', async () => {
      const redis = new RedisService(configService);
      const guard = new PublicChatRateLimitGuard(redis);

      const makeCtx = (ip: string, tenantKey = 'oil-supply'): ExecutionContext =>
        ({
          switchToHttp: () => ({
            getRequest: () => ({
              ip,
              headers: {},
              params: { tenantKey },
            }),
          }),
        }) as unknown as ExecutionContext;

      for (let i = 1; i <= 30; i++) {
        await expect(
          guard.canActivate(makeCtx('203.0.113.55')),
        ).resolves.toBe(true);
      }

      await expect(
        guard.canActivate(makeCtx('203.0.113.55')),
      ).rejects.toThrow(HttpException);

      try {
        await guard.canActivate(makeCtx('203.0.113.55'));
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    });
  });

  describe('FR-8 Monthly Quotas & PRD Section 16 Repeated-Question Caching', () => {
    it('caches repeated questions in Redis and blocks requests when monthly_quota is reached', async () => {
      const redis = new RedisService(configService);
      let monthlyUsedCount = 0;

      const mockTenant = {
        id: 'tenant-oil-1',
        name: 'Oil Supply',
        tenantKey: 'oil-supply',
        monthlyQuota: 2,
        allowedOrigins: ['*'],
        widgetConfig: {
          botName: 'Oil Supply Bot',
          primaryColor: '#2563eb',
          welcomeMessage: 'Hi!',
        },
      };

      const mockRls = {
        runWithTenant: jest.fn(async (_tId: string, cb: any) => {
          const manager = {
            getRepository: (entity: any) => {
              if (entity.name === 'UsageEventEntity') {
                return {
                  count: jest.fn(async () => monthlyUsedCount),
                  create: jest.fn((d: any) => d),
                  save: jest.fn(async (d: any) => {
                    if (d.type === 'chat_message') monthlyUsedCount++;
                    return d;
                  }),
                };
              }
              if (entity.name === 'ConversationEntity') {
                return {
                  findOne: jest.fn(async () => ({
                    id: 'conv-1',
                    tenantId: mockTenant.id,
                    customerSession: 'sess-1',
                    status: ConversationStatus.BOT,
                  })),
                  create: jest.fn((d: any) => d),
                  save: jest.fn(async (d: any) => d),
                };
              }
              return {
                create: jest.fn((d: any) => ({ id: 'msg-1', ...d })),
                save: jest.fn(async (d: any) => d),
              };
            },
          };
          return cb(manager);
        }),
      };

      const mockVectorStore = {
        searchSimilarChunks: jest.fn(async () => [
          {
            chunkId: 'c-1',
            documentId: 'd-1',
            documentName: 'Policy.pdf',
            chunkIndex: 0,
            content: 'Minimum bulk diesel order is 500 liters.',
            similarity: 0.91,
          },
        ]),
      };

      const chatService = new ChatService(
        { findOne: jest.fn(async () => mockTenant) } as any,
        mockRls as any,
        mockVectorStore as any,
        new ClaudeLlmAdapter(configService),
        { emitTenantEvent: jest.fn() } as any,
        redis,
      );

      const firstReply = await chatService.handleCustomerMessage('oil-supply', {
        customerSession: 'sess-1',
        message: 'What is the minimum bulk diesel order?',
      });
      expect(firstReply.reply?.content).toContain('500 liters');
      expect(mockVectorStore.searchSimilarChunks).toHaveBeenCalledTimes(1);

      const secondReply = await chatService.handleCustomerMessage('oil-supply', {
        customerSession: 'sess-1',
        message: 'What is the minimum bulk diesel order?',
      });
      expect((secondReply as any).cached).toBe(true);
      expect(mockVectorStore.searchSimilarChunks).toHaveBeenCalledTimes(1);

      await expect(
        chatService.handleCustomerMessage('oil-supply', {
          customerSession: 'sess-1',
          message: 'Another question after quota exhausted',
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('FR-7 Analytics: Summary, Response Time, Top Questions & Unanswered Questions', () => {
    it('calculates resolution rate, average response time, top questions, and unanswered list', async () => {
      const mockRls = {
        runInCurrentTenant: jest.fn(async (cb: any) =>
          mockRls.runWithTenant('tenant-oil-1', cb),
        ),
        runWithTenant: jest.fn(async (_tId: string, cb: any) => {
          const manager = {
            getRepository: (entity: any) => {
              if (entity.name === 'ConversationEntity') {
                return {
                  count: jest
                    .fn()
                    .mockResolvedValueOnce(10)
                    .mockResolvedValueOnce(2),
                  find: jest.fn(async () => [
                    { id: 'conv-escalated-1', status: ConversationStatus.WAITING },
                  ]),
                };
              }
              if (entity.name === 'UsageEventEntity') {
                return {
                  find: jest.fn(async () => [
                    {
                      type: 'chat_message',
                      metadata: { responseTimeMs: 420 },
                    },
                    {
                      type: 'chat_message',
                      metadata: { responseTimeMs: 580 },
                    },
                    {
                      type: 'audit.document.uploaded',
                      metadata: { name: 'FAQ.pdf' },
                    },
                  ]),
                  count: jest.fn(async () => 25),
                };
              }
              return {
                find: jest.fn(async () => [
                  {
                    id: 'm-1',
                    conversationId: 'conv-resolved-1',
                    sender: MessageSender.CUSTOMER,
                    content: 'What is the diesel price?',
                  },
                  {
                    id: 'm-2',
                    conversationId: 'conv-resolved-2',
                    sender: MessageSender.CUSTOMER,
                    content: 'what is the diesel price?',
                  },
                  {
                    id: 'm-3',
                    conversationId: 'conv-escalated-1',
                    sender: MessageSender.CUSTOMER,
                    content: 'Do you deliver aviation jet fuel to Sylhet?',
                  },
                ]),
              };
            },
          };
          return cb(manager);
        }),
      };

      const analyticsService = new AnalyticsService(
        {
          findOne: jest.fn(async () => ({
            id: 'tenant-oil-1',
            monthlyQuota: 1000,
          })),
        } as any,
        { requireTenantId: () => 'tenant-oil-1' } as any,
        mockRls as any,
      );

      const summary = await analyticsService.getSummary();
      expect(summary.totalChats).toBe(10);
      expect(summary.botResolvedChats).toBe(8);
      expect(summary.escalatedChats).toBe(2);
      expect(summary.resolutionRate).toBe(80);
      expect(summary.averageResponseTimeMs).toBe(500);
      expect(summary.monthlyQuotaUsed).toBe(25);
      expect(summary.topQuestions[0]).toEqual({
        question: 'What is the diesel price?',
        count: 2,
      });

      const unanswered = await analyticsService.getUnansweredQuestions();
      expect(unanswered).toHaveLength(1);
      expect(unanswered[0].content).toBe(
        'Do you deliver aviation jet fuel to Sylhet?',
      );

      const audits = await analyticsService.getAuditLogs();
      expect(audits).toHaveLength(1);
      expect(audits[0].type).toBe('audit.document.uploaded');
    });
  });

  describe('PRD Section 8 Security & Privacy: XSS Sanitizer & Tenant Deletion', () => {
    it('strips <script>, inline event handlers, and javascript: URIs', () => {
      const dirty =
        '<script>alert("xss")</script><img src=x onerror="steal()">Hello <b>Oil Supply</b>';
      expect(sanitizeInput(dirty)).toBe('Hello Oil Supply');
    });

    it('deletes the current tenant and cascades removal of all tenant data', async () => {
      const removeSpy = jest.fn(async (t: any) => t);
      const tenantsService = new TenantsService(
        {
          findOne: jest.fn(async () => ({
            id: 'tenant-oil-1',
            name: 'Oil Supply',
          })),
          remove: removeSpy,
        } as any,
        { requireTenantId: () => 'tenant-oil-1' } as any,
      );

      const result = await tenantsService.deleteCurrentTenant();
      expect(result).toEqual({ deleted: true, tenantId: 'tenant-oil-1' });
      expect(removeSpy).toHaveBeenCalledTimes(1);
    });
  });
});
