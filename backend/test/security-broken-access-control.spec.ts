import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AnalyticsController } from '../src/analytics/analytics.module';
import { AuthService } from '../src/auth/auth.service';
import { hashSecret } from '../src/common/crypto/scrypt.util';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { Role } from '../src/common/enums/role.enum';
import { RolesGuard } from '../src/common/guards/roles.guard';
import {
  DocumentsController,
  DocumentsService,
} from '../src/documents/documents.module';
import {
  HandoffController,
  HandoffGateway,
  HandoffService,
} from '../src/handoff/handoff.module';
import { TenantsController } from '../src/tenants/tenants.controller';
import { UsersController } from '../src/users/users.controller';

describe('Security Testing Plan — Broken Access Control, Cross-Tenant IDOR & Token Replay Suite', () => {
  describe('Cross-Tenant IDOR Defense (Tenant A targeting Tenant B UUIDs)', () => {
    it('prevents Tenant A from reading, claiming, replying to, or closing Tenant B conversations', async () => {

      const rlsScopedStore = {
        runInCurrentTenant: jest.fn(async (cb: any) =>
          rlsScopedStore.runWithTenant('tenant-oil-A', cb),
        ),
        runWithTenant: jest.fn(async (activeTenantId: string, cb: any) => {
          const manager = {
            getRepository: () => ({
              findOne: jest.fn(async ({ where }: any) => {
                if (
                  where.id === 'conv-clinic-99' &&
                  activeTenantId === 'tenant-clinic-B'
                ) {
                  return { id: 'conv-clinic-99', tenantId: 'tenant-clinic-B' };
                }

                return null;
              }),
            }),
          };
          return cb(manager);
        }),
      };

      const handoffService = new HandoffService(
        rlsScopedStore as any,
        new HandoffGateway(),
      );

      const tenantAAgent = {
        userId: 'user-oil-1',
        tenantId: 'tenant-oil-A',
        email: 'agent@oilsupply.com',
        role: Role.AGENT,
      };

      await expect(
        handoffService.getConversationTranscript('conv-clinic-99'),
      ).rejects.toThrow(NotFoundException);

      await expect(
        handoffService.claimConversation('conv-clinic-99', tenantAAgent),
      ).rejects.toThrow(NotFoundException);

      await expect(
        handoffService.replyToConversation('conv-clinic-99', tenantAAgent, {
          content: 'Cross-tenant hijack attempt',
        }),
      ).rejects.toThrow(NotFoundException);

      await expect(
        handoffService.closeConversation('conv-clinic-99', tenantAAgent),
      ).rejects.toThrow(NotFoundException);
    });

    it('prevents Tenant A from deleting Tenant B documents by ID', async () => {
      const rlsScopedStore = {
        runInCurrentTenant: jest.fn(async (cb: any) => {
          const manager = {
            getRepository: () => ({
              findOne: jest.fn(async () => null),
            }),
          };
          return cb(manager);
        }),
      };

      const docsService = new DocumentsService(
        rlsScopedStore as any,
        { requireTenantId: () => 'tenant-oil-A' } as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(
        docsService.deleteDocument('doc-clinic-99'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('RBAC Matrix Enforcement (Viewer vs Agent vs Owner across Controllers)', () => {
    const reflector = new Reflector();
    const rolesGuard = new RolesGuard(reflector);

    function assertRoutePermission(
      controllerClass: any,
      methodName: string,
      role: Role,
      shouldAllow: boolean,
    ) {
      const handler = controllerClass.prototype[methodName];
      const ctx = {
        getHandler: () => handler,
        getClass: () => controllerClass,
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              userId: 'u-1',
              tenantId: 't-1',
              email: 'test@oilsupply.com',
              role,
            },
          }),
        }),
      } as unknown as ExecutionContext;

      const requiredRoles = Reflect.getMetadata(ROLES_KEY, handler) as
        | Role[]
        | undefined;
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(requiredRoles);

      if (shouldAllow) {
        expect(rolesGuard.canActivate(ctx)).toBe(true);
      } else {
        expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
      }
    }

    it('blocks Viewer from all write/destructive actions and audit logs while allowing read-only endpoints', () => {

      assertRoutePermission(DocumentsController, 'list', Role.VIEWER, true);
      assertRoutePermission(HandoffController, 'getQueue', Role.VIEWER, true);
      assertRoutePermission(
        HandoffController,
        'getTranscript',
        Role.VIEWER,
        true,
      );
      assertRoutePermission(
        AnalyticsController,
        'getSummary',
        Role.VIEWER,
        true,
      );

      assertRoutePermission(DocumentsController, 'upload', Role.VIEWER, false);
      assertRoutePermission(DocumentsController, 'remove', Role.VIEWER, false);
      assertRoutePermission(TenantsController, 'updateMe', Role.VIEWER, false);
      assertRoutePermission(TenantsController, 'deleteMe', Role.VIEWER, false);
      assertRoutePermission(UsersController, 'invite', Role.VIEWER, false);
      assertRoutePermission(UsersController, 'updateRole', Role.VIEWER, false);
      assertRoutePermission(HandoffController, 'claim', Role.VIEWER, false);
      assertRoutePermission(HandoffController, 'reply', Role.VIEWER, false);
      assertRoutePermission(HandoffController, 'close', Role.VIEWER, false);
      assertRoutePermission(
        AnalyticsController,
        'getAuditLogs',
        Role.VIEWER,
        false,
      );
    });

    it('allows Agent to handle escalated chats but blocks Agent from Owner-only tenant/team/document administration', () => {
      assertRoutePermission(HandoffController, 'claim', Role.AGENT, true);
      assertRoutePermission(HandoffController, 'reply', Role.AGENT, true);
      assertRoutePermission(HandoffController, 'close', Role.AGENT, true);

      assertRoutePermission(DocumentsController, 'upload', Role.AGENT, false);
      assertRoutePermission(DocumentsController, 'remove', Role.AGENT, false);
      assertRoutePermission(TenantsController, 'deleteMe', Role.AGENT, false);
      assertRoutePermission(UsersController, 'invite', Role.AGENT, false);
    });
  });

  describe('Refresh Token Replay Detection & Automatic Session Revocation', () => {
    it('immediately revokes refreshTokenHash when a stolen/rotated refresh token is replayed', async () => {
      const jwtService = new JwtService();
      const configService = new ConfigService({
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
      });

      const currentRotatedTokenHash = await hashSecret('latest-valid-token');
      const revokeSpy = jest.fn();

      const mockRls = {
        runWithTenant: jest.fn(async (_tId: string, cb: any) => {
          const manager = {
            getRepository: () => ({
              findOne: jest.fn(async () => ({
                id: 'user-owner-1',
                tenantId: 'tenant-oil-1',
                email: 'owner@oilsupply.com',
                role: Role.OWNER,
                refreshTokenHash: currentRotatedTokenHash,
                tenant: {
                  id: 'tenant-oil-1',
                  name: 'Oil Supply',
                  tenantKey: 'oil-supply',
                  plan: 'starter',
                  monthlyQuota: 1000,
                },
              })),
              update: revokeSpy,
            }),
          };
          return cb(manager);
        }),
      };

      const authService = new AuthService(
        {} as any,
        mockRls as any,
        jwtService,
        configService,
      );

      const replayedOldToken = await jwtService.signAsync(
        {
          sub: 'user-owner-1',
          tenantId: 'tenant-oil-1',
          email: 'owner@oilsupply.com',
          role: Role.OWNER,
        },
        { secret: 'test-refresh-secret', expiresIn: '7d' },
      );

      await expect(authService.refresh(replayedOldToken)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(revokeSpy).toHaveBeenCalledWith(
        { id: 'user-owner-1' },
        { refreshTokenHash: null },
      );
    });
  });
});
