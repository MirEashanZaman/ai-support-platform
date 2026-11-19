import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { Role } from '../enums/role.enum';

export interface TenantStore {
  tenantId: string;
  userId?: string;
  role?: Role;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantStore>();

  run<T>(store: TenantStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  getStore(): TenantStore | undefined {
    return this.storage.getStore();
  }

  getTenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  requireTenantId(): string {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context is not active for the current execution scope');
    }
    return tenantId;
  }
}
