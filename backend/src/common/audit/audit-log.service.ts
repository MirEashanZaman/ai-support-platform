import { Global, Injectable, Module } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UsageEventEntity } from '../../database/entities';
import { RlsTransactionService } from '../../database/rls-transaction.service';

export type AuditActionType =
  | 'audit.document.uploaded'
  | 'audit.document.deleted'
  | 'audit.user.invited'
  | 'audit.user.role_changed';

export interface RecordAuditParams {
  tenantId: string;
  actorUserId?: string;
  action: AuditActionType;
  targetId?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly rlsTransaction: RlsTransactionService) {}

  async record(
    params: RecordAuditParams,
    existingManager?: EntityManager,
  ): Promise<UsageEventEntity> {
    const writeAudit = async (manager: EntityManager) => {
      const repo = manager.getRepository(UsageEventEntity);
      const entry = repo.create({
        tenantId: params.tenantId,
        type: params.action,
        metadata: {
          actorUserId: params.actorUserId ?? null,
          targetId: params.targetId ?? null,
          timestamp: new Date().toISOString(),
          ...(params.details ?? {}),
        },
      });
      return repo.save(entry);
    };

    if (existingManager) {
      return writeAudit(existingManager);
    }

    return this.rlsTransaction.runWithTenant(params.tenantId, writeAudit);
  }
}

@Global()
@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
