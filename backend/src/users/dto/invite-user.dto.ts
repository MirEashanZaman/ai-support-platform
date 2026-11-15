import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class InviteUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  temporaryPassword: string;

  @IsEnum(Role)
  role: Role;
}

export class UpdateUserRoleDto {
  @IsEnum(Role)
  role: Role;
}

