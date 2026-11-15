import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('me')
  async getMe() {
    return this.tenantsService.getCurrentTenant();
  }

  @Patch('me')
  @Roles(Role.OWNER)
  async updateMe(@Body() dto: UpdateTenantDto) {
    return this.tenantsService.updateCurrentTenant(dto);
  }
}

