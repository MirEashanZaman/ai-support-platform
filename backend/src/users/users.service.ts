import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../common/audit/audit-log.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { hashSecret } from '../common/crypto/scrypt.util';
import { Role } from '../common/enums/role.enum';
import { UserEntity } from '../database/entities';
import { RlsTransactionService } from '../database/rls-transaction.service';
import { InviteUserDto } from './dto/invite-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly rlsTransaction: RlsTransactionService,
    private readonly tenantContext: TenantContextService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listTeamMembers(): Promise<
    Array<{ id: string; tenantId: string; email: string; role: Role; createdAt: Date }>
  > {
    return this.rlsTransaction.runInCurrentTenant(async (manager) => {
      const users = await manager.getRepository(UserEntity).find({
        order: { createdAt: 'ASC' },
      });
      return users.map((u) => ({
        id: u.id,
        tenantId: u.tenantId,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
      }));
    });
  }

  async inviteUser(dto: InviteUserDto) {
    const tenantId = this.tenantContext.requireTenantId();
    const normalizedEmail = dto.email.trim().toLowerCase();
    const passwordHash = await hashSecret(dto.temporaryPassword);

    return this.rlsTransaction.runWithTenant(tenantId, async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const existing = await userRepo.findOne({
        where: { email: normalizedEmail },
      });
      if (existing) {
        throw new ConflictException(
          'User with this email already exists in your workspace',
        );
      }

      const created = userRepo.create({
        tenantId,
        email: normalizedEmail,
        passwordHash,
        role: dto.role,
      });
      const saved = await userRepo.save(created);
      await this.auditLogService.record(
        {
          tenantId,
          actorUserId: this.tenantContext.getStore()?.userId,
          action: 'audit.user.invited',
          targetId: saved.id,
          details: { email: saved.email, role: saved.role },
        },
        manager,
      );
      return {
        id: saved.id,
        tenantId: saved.tenantId,
        email: saved.email,
        role: saved.role,
        createdAt: saved.createdAt,
      };
    });
  }

  async updateUserRole(userId: string, role: Role) {
    return this.rlsTransaction.runInCurrentTenant(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const user = await userRepo.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('Team member not found in your workspace');
      }
      const previousRole = user.role;
      user.role = role;
      const saved = await userRepo.save(user);
      await this.auditLogService.record(
        {
          tenantId: saved.tenantId,
          actorUserId: this.tenantContext.getStore()?.userId,
          action: 'audit.user.role_changed',
          targetId: saved.id,
          details: { previousRole, newRole: saved.role },
        },
        manager,
      );
      return {
        id: saved.id,
        tenantId: saved.tenantId,
        email: saved.email,
        role: saved.role,
      };
    });
  }
}
