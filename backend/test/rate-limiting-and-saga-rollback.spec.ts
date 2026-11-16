import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { RateLimitOptions } from '../src/common/decorators/rate-limit.decorator';
import {
  DocumentStatus,
  DocumentType,
} from '../src/common/enums/document-status.enum';
import { RedisRateLimitGuard } from '../src/common/guards/public-chat-rate-limit.guard';
import { SagaOrchestrator } from '../src/common/saga/saga-orchestrator';
import { EmbeddingsService } from '../src/infra/embeddings/embeddings.module';
import { RabbitMqService } from '../src/infra/rabbitmq/rabbitmq.module';
import { RedisService } from '../src/infra/redis/redis.module';
import { IngestionSagaService } from '../src/ingestion/ingestion-saga.service';
import { DocumentParserFactory } from '../src/ingestion/parsers/document-parser.factory';
import { ChunkingStrategyResolver } from '../src/ingestion/strategies/chunking.strategy';

describe('Rate Limiting (@RateLimit + Redis) & Saga Compensating Rollback Suite', () => {
  const configService = new ConfigService({ NODE_ENV: 'test' });

  describe('SagaOrchestrator: LIFO Compensating Rollback Engine', () => {
    it('executes compensating steps in strict reverse (LIFO) order when a middle or final step fails', async () => {
      const executionLog: string[] = [];

      const saga = new SagaOrchestrator<{ ledger: string[] }>('OrderOrIngestionSaga', [
        {
          name: 'Step1_ReserveState',
          execute: async (ctx) => {
            executionLog.push('exec:Step1');
            ctx.ledger.push('reserved');
          },
          compensate: async (ctx) => {
            executionLog.push('comp:Step1');
            ctx.ledger.pop();
          },
        },
        {
          name: 'Step2_GenerateVectors',
          execute: async (ctx) => {
            executionLog.push('exec:Step2');
            ctx.ledger.push('vectors-ready');
          },
          compensate: async (ctx) => {
            executionLog.push('comp:Step2');
            ctx.ledger.pop();
          },
        },
        {
          name: 'Step3_WriteDatabase',
          execute: async () => {
            executionLog.push('exec:Step3');
            throw new Error('pgvector disk write failure');
          },
          compensate: async () => {
            executionLog.push('comp:Step3');
          },
        },
      ]);

      const context = { ledger: [] as string[] };
      const result = await saga.run(context);

      expect(result.succeeded).toBe(false);
      expect(result.rolledBack).toBe(true);
      expect(result.failedStep).toBe('Step3_WriteDatabase');
      expect(result.completedSteps).toEqual([
        'Step1_ReserveState',
        'Step2_GenerateVectors',
      ]);
      // Strict reverse LIFO order: Step2 compensated before Step1
      expect(result.compensatedSteps).toEqual([
        'Step2_GenerateVectors',
        'Step1_ReserveState',
      ]);
      expect(executionLog).toEqual([
        'exec:Step1',
        'exec:Step2',
        'exec:Step3',
        'comp:Step2',
        'comp:Step1',
      ]);
      expect(context.ledger).toHaveLength(0);
    });

    it('rolls back all 3 prior ingestion stages in LIFO order when Step 4 pgvector insert fails', async () => {
      let chunkDeleteCount = 0;
      const statusHistory: DocumentStatus[] = [];

      const mockRls = {
        runWithTenant: jest.fn(async (_tId: string, cb: any) => {
          const manager = {
            getRepository: () => ({
              update: jest.fn(async (_where: any, data: any) => {
                if (data.status) statusHistory.push(data.status);
              }),
              delete: jest.fn(async () => {
                chunkDeleteCount++;
              }),
            }),
            query: jest.fn(async () => {
              throw new Error('Simulated pgvector index corruption');
            }),
          };
          return cb(manager);
        }),
      };

      const sagaService = new IngestionSagaService(
        mockRls as any,
        new DocumentParserFactory(),
        new ChunkingStrategyResolver(),
        new EmbeddingsService(configService),
        new RabbitMqService(configService),
      );

      const res = await sagaService.execute({
        tenantId: 'tenant-oil-1',
        documentId: 'doc-rollback-1',
        type: DocumentType.MARKDOWN,
        rawText: '# Fuel Policy\nBulk diesel delivery takes 24 hours.',
        attempt: 3,
      });

      expect(res.status).toBe(DocumentStatus.FAILED);
      expect(res.rolledBack).toBe(true);
      expect(res.routedToDlq).toBe(true);
      expect(res.completedSteps).toEqual([
        'MarkDocumentProcessing',
        'ParseDocumentContent',
        'ChunkAndEmbedVectors',
      ]);
      expect(res.compensatedSteps).toEqual([
        'ChunkAndEmbedVectors',
        'ParseDocumentContent',
        'MarkDocumentProcessing',
      ]);
      expect(chunkDeleteCount).toBeGreaterThanOrEqual(1);
      expect(statusHistory).toEqual([
        DocumentStatus.PROCESSING,
        DocumentStatus.FAILED,
      ]);
    });
  });

  describe('RedisRateLimitGuard + @RateLimit Decorator (Auth, Upload & Per-Tenant Throttling)', () => {
    it('enforces @RateLimit on Auth login endpoint and sets X-RateLimit-* and Retry-After headers', async () => {
      const redis = new RedisService(configService);
      const reflector = new Reflector();
      const authRateLimit: RateLimitOptions = {
        limit: 3,
        windowSeconds: 60,
        keyPrefix: 'auth:login',
      };
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(authRateLimit);

      const guard = new RedisRateLimitGuard(redis, reflector);
      const headersSent: Record<string, string> = {};

      const makeAuthCtx = (ip: string): ExecutionContext =>
        ({
          getHandler: () => ({}),
          getClass: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({ ip, headers: {}, params: {} }),
            getResponse: () => ({
              setHeader: (k: string, v: string) => {
                headersSent[k] = v;
              },
            }),
          }),
        }) as unknown as ExecutionContext;

      await expect(guard.canActivate(makeAuthCtx('198.51.100.9'))).resolves.toBe(
        true,
      );
      expect(headersSent['X-RateLimit-Limit']).toBe('3');
      expect(headersSent['X-RateLimit-Remaining']).toBe('2');

      await expect(guard.canActivate(makeAuthCtx('198.51.100.9'))).resolves.toBe(
        true,
      );
      await expect(guard.canActivate(makeAuthCtx('198.51.100.9'))).resolves.toBe(
        true,
      );
      expect(headersSent['X-RateLimit-Remaining']).toBe('0');

      // 4th attempt exceeds auth:login limit of 3 -> 429 + Retry-After header
      await expect(
        guard.canActivate(makeAuthCtx('198.51.100.9')),
      ).rejects.toThrow(HttpException);
      expect(headersSent['Retry-After']).toBe('60');
    });

    it('enforces perTenantLimit across multiple client IPs targeting the same tenant', async () => {
      const redis = new RedisService(configService);
      const reflector = new Reflector();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
        limit: 50,
        windowSeconds: 60,
        keyPrefix: 'docs:upload',
        perTenantLimit: 2,
      } satisfies RateLimitOptions);

      const guard = new RedisRateLimitGuard(redis, reflector);

      const makeTenantCtx = (ip: string, tenantKey: string): ExecutionContext =>
        ({
          getHandler: () => ({}),
          getClass: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({ ip, headers: {}, params: { tenantKey } }),
            getResponse: () => ({ setHeader: jest.fn() }),
          }),
        }) as unknown as ExecutionContext;

      // Two different IPs succeed for tenant 'oil-supply'
      await expect(
        guard.canActivate(makeTenantCtx('10.0.0.1', 'oil-supply')),
      ).resolves.toBe(true);
      await expect(
        guard.canActivate(makeTenantCtx('10.0.0.2', 'oil-supply')),
      ).resolves.toBe(true);

      // Third IP targeting 'oil-supply' hits perTenantLimit (2) -> 429 Too Many Requests
      try {
        await guard.canActivate(makeTenantCtx('10.0.0.3', 'oil-supply'));
        fail('Expected 429 Too Many Requests');
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    });
  });
});
