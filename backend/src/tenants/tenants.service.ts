import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../common/context/tenant-context.service';
import { sanitizeInput } from '../common/security/xss-sanitizer.util';
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
    const apiUrl = process.env.PUBLIC_API_URL || 'http://localhost:4000';
    return {
      ...tenant,
      scriptTag: `<script src="${apiUrl}/widget.js" data-tenant-key="${tenant.tenantKey}" async></script>`,
    };
  }

  async updateCurrentTenant(dto: UpdateTenantDto): Promise<TenantEntity> {
    const tenantId = this.tenantContext.requireTenantId();
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (dto.name !== undefined) {
      tenant.name = sanitizeInput(dto.name);
    }
    if (dto.allowedOrigins !== undefined) {
      tenant.allowedOrigins = dto.allowedOrigins;
    }
    if (dto.widgetConfig !== undefined) {
      tenant.widgetConfig = {
        ...tenant.widgetConfig,
        ...dto.widgetConfig,
        ...(dto.widgetConfig.botName
          ? { botName: sanitizeInput(dto.widgetConfig.botName) }
          : {}),
        ...(dto.widgetConfig.welcomeMessage
          ? { welcomeMessage: sanitizeInput(dto.widgetConfig.welcomeMessage) }
          : {}),
      };
    }

    return this.tenantRepo.save(tenant);
  }

  async deleteCurrentTenant(): Promise<{ deleted: boolean; tenantId: string }> {
    const tenantId = this.tenantContext.requireTenantId();
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    await this.tenantRepo.remove(tenant);
    return { deleted: true, tenantId };
  }
}
