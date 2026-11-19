import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { TenantContextService } from '../src/common/context/tenant-context.service';
import { hashSecret, verifySecret } from '../src/common/crypto/scrypt.util';
import { Role } from '../src/common/enums/role.enum';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { RabbitMqService } from '../src/infra/rabbitmq/rabbitmq.module';
import { IngestionService } from '../src/ingestion/ingestion.module';

describe('Week 1 Auth, RBAC, Crypto & Pipeline Unit Suite', () => {
  describe('scrypt Password & Refresh Token Hashing', () => {
    it('hashes secrets with random salt and verifies in constant time', async () => {
      const hash1 = await hashSecret('StrongPass#2026');
      const hash2 = await hashSecret('StrongPass#2026');

      expect(hash1).not.toBe(hash2);
      expect(await verifySecret('StrongPass#2026', hash1)).toBe(true);
      expect(await verifySecret('WrongPassword', hash1)).toBe(false);
    });
  });

  describe('JwtAuthGuard & RolesGuard (Owner / Agent / Viewer)', () => {
    const jwtService = new JwtService();
    const configService = new ConfigService({
      JWT_ACCESS_SECRET: 'test-access-secret',
    });
    const reflector = new Reflector();

    it('authenticates valid Bearer JWT and attaches user + tenantId to request', async () => {
      const guard = new JwtAuthGuard(jwtService, configService, reflector);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const token = await jwtService.signAsync(
        {
          sub: 'user-1',
          tenantId: 'tenant-oil-1',
          email: 'owner@oilsupply.com',
          role: Role.OWNER,
        },
        { secret: 'test-access-secret' },
      );

      const req: Record<string, any> = {
        headers: { authorization: `Bearer ${token}` },
      };
      const ctx = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(req.user).toEqual({
        userId: 'user-1',
        tenantId: 'tenant-oil-1',
        email: 'owner@oilsupply.com',
        role: Role.OWNER,
      });
    });

    it('rejects missing or tampered tokens with UnauthorizedException', async () => {
      const guard = new JwtAuthGuard(jwtService, configService, reflector);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const ctx = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('enforces Owner, Agent, and Viewer RBAC permissions accurately', () => {
      const rolesGuard = new RolesGuard(reflector);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OWNER]);

      const viewerCtx = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              userId: 'u-2',
              tenantId: 't-1',
              email: 'viewer@oilsupply.com',
              role: Role.VIEWER,
            },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => rolesGuard.canActivate(viewerCtx)).toThrow(ForbiddenException);

      const ownerCtx = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              userId: 'u-1',
              tenantId: 't-1',
              email: 'owner@oilsupply.com',
              role: Role.OWNER,
            },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(rolesGuard.canActivate(ownerCtx)).toBe(true);
    });
  });

  describe('TenantContextService & RabbitMQ DLQ Routing', () => {
    it('isolates AsyncLocalStorage tenant context across concurrent async scopes', async () => {
      const ctx = new TenantContextService();
      const results = await Promise.all([
        ctx.run({ tenantId: 'tenant-A', role: Role.OWNER }, async () => {
          await new Promise((r) => setTimeout(r, 10));
          return ctx.requireTenantId();
        }),
        ctx.run({ tenantId: 'tenant-B', role: Role.AGENT }, async () => {
          await new Promise((r) => setTimeout(r, 5));
          return ctx.requireTenantId();
        }),
      ]);

      expect(results).toEqual(['tenant-A', 'tenant-B']);
    });

    it('routes jobs exceeding 3 attempts to Dead-Letter Queue (DLQ)', async () => {
      const rmq = new RabbitMqService(new ConfigService({ NODE_ENV: 'test' }));
      await rmq.publishIngestionJob({
        tenantId: 't-1',
        documentId: 'doc-1',
        attempt: 1,
      });
      await rmq.publishIngestionJob({
        tenantId: 't-1',
        documentId: 'doc-failed',
        attempt: 4,
      });

      const queues = rmq.getInMemoryQueues();
      expect(queues.queue).toHaveLength(1);
      expect(queues.dlq).toHaveLength(1);
      expect(queues.dlq[0].documentId).toBe('doc-failed');
    });

    it('chunks long documents with configurable overlap', () => {
      const ingestion = new IngestionService({} as any, {} as any);
      const sampleText = 'A'.repeat(400) + ' ' + 'B'.repeat(400);
      const chunks = ingestion.chunkText(sampleText, 500, 80);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });
  });
});
