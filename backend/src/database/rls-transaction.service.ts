import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TenantContextService } from '../common/context/tenant-context.service';

@Injectable()
export class RlsTransactionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Executes a callback inside a database transaction scoped to `tenantId`.
   * Sets both `LOCAL ROLE app_tenant_user` (so Postgres never bypasses RLS even if connected
   * as superuser) and `set_config('app.current_tenant_id', tenantId, true)` which automatically
   * resets when the transaction ends—preventing connection pool tenant leakage.
   */
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

  /**
   * Executes a callback inside a transaction scoped to the active AsyncLocalStorage tenant.
   */
  async runInCurrentTenant<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const tenantId = this.tenantContext.requireTenantId();
    return this.runWithTenant(tenantId, callback);
  }

  /**
   * Executes a callback inside a transaction with `app_tenant_user` role active
   * but WITHOUT a tenant context (used in RLS security tests to verify queries fail closed).
   */
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

