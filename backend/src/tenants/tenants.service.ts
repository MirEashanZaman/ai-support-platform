import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../common/context/tenant-context.service';
import { TenantEntity } from '../database/entities';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getCurrentTenant(): Promise<TenantEntity & { scriptTag: string }> {
    const tenantId = this.tenantContext.requireTenantId();
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return {
      ...tenant,
      scriptTag: `<script src="https://cdn.aisupport.local/widget.js" data-tenant-key="${tenant.tenantKey}" async></script>`,
    };
  }

  async updateCurrentTenant(dto: UpdateTenantDto): Promise<TenantEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (dto.name !== undefined) {
      tenant.name = dto.name.trim();
    }
    if (dto.allowedOrigins !== undefined) {
      tenant.allowedOrigins = dto.allowedOrigins;
    }
    if (dto.widgetConfig !== undefined) {
      tenant.widgetConfig = {
        ...tenant.widgetConfig,
        ...dto.widgetConfig,
      };
    }

    return this.tenantRepo.save(tenant);
  }
}

