import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TenantContextService } from '../common/context/tenant-context.service';

@Injectable()
export class RlsTransactionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async runWithTenant<T>(
    tenantId: string,
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (!tenantId) {
      throw new Error('tenantId is required for runWithTenant');
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SET LOCAL ROLE app_tenant_user;`);
      await manager.query(
        `SELECT set_config('app.current_tenant_id', $1, true);`,
        [tenantId],
      );
      return callback(manager);
    });
  }

  async runInCurrentTenant<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const tenantId = this.tenantContext.requireTenantId();
    return this.runWithTenant(tenantId, callback);
  }

  async runWithoutTenantContext<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SET LOCAL ROLE app_tenant_user;`);
      await manager.query(`SELECT set_config('app.current_tenant_id', '', true);`);
      return callback(manager);
    });
  }
}
