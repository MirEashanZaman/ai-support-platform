import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { InviteUserDto, UpdateUserRoleDto } from './dto/invite-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.OWNER, Role.AGENT, Role.VIEWER)
  async listUsers() {
    return this.usersService.listTeamMembers();
  }

  @Post('invite')
  @Roles(Role.OWNER)
  async invite(@Body() dto: InviteUserDto) {
    return this.usersService.inviteUser(dto);
  }

  @Patch(':id/role')
  @Roles(Role.OWNER)
  async updateRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    return this.usersService.updateUserRole(id, dto.role);
  }
}
