import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { hashSecret, verifySecret } from '../common/crypto/scrypt.util';
import { Role } from '../common/enums/role.enum';
import { TenantEntity, UserEntity } from '../database/entities';
import { RlsTransactionService } from '../database/rls-transaction.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

export interface AuthTokensResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    tenantId: string;
    email: string;
    role: Role;
  };
  tenant: {
    id: string;
    name: string;
    tenantKey: string;
    plan: string;
    monthlyQuota: number;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly rlsTransaction: RlsTransactionService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthTokensResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const tenantKey = this.generateTenantKey(dto.businessName);
    const passwordHash = await hashSecret(dto.password);

    return this.dataSource.transaction(async (manager) => {
      const existingUser = await manager
        .getRepository(UserEntity)
        .findOne({ where: { email: normalizedEmail } });
      if (existingUser) {
        throw new ConflictException('An account with this email already exists');
      }

      const tenantRepo = manager.getRepository(TenantEntity);
      const tenant = tenantRepo.create({
        name: dto.businessName.trim(),
        tenantKey,
        plan: 'starter',
        monthlyQuota: 5000,
      });
      const savedTenant = await tenantRepo.save(tenant);

      // Activate RLS session context for the newly created tenant
      await manager.query(`SET LOCAL ROLE app_tenant_user;`);
      await manager.query(
        `SELECT set_config('app.current_tenant_id', $1, true);`,
        [savedTenant.id],
      );

      const userRepo = manager.getRepository(UserEntity);
      const user = userRepo.create({
        tenantId: savedTenant.id,
        email: normalizedEmail,
        passwordHash,
        role: Role.OWNER,
      });
      const savedUser = await userRepo.save(user);

      const tokens = await this.issueTokens(savedUser);
      savedUser.refreshTokenHash = await hashSecret(tokens.refreshToken);
      await userRepo.save(savedUser);

      return {
        ...tokens,
        user: {
          id: savedUser.id,
          tenantId: savedUser.tenantId,
          email: savedUser.email,
          role: savedUser.role,
        },
        tenant: {
          id: savedTenant.id,
          name: savedTenant.name,
          tenantKey: savedTenant.tenantKey,
          plan: savedTenant.plan,
          monthlyQuota: savedTenant.monthlyQuota,
        },
      };
    });
  }

  async login(dto: LoginDto): Promise<AuthTokensResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // System lookup to resolve which tenant the user belongs to before activating RLS
    const matchedUser = await this.dataSource.transaction(async (manager) => {
      const qb = manager
        .getRepository(UserEntity)
        .createQueryBuilder('u')
        .innerJoinAndSelect('u.tenant', 't')
        .where('u.email = :email', { email: normalizedEmail });

      if (dto.tenantKey) {
        qb.andWhere('t.tenant_key = :tenantKey', { tenantKey: dto.tenantKey });
      }
      return qb.getOne();
    });

    if (!matchedUser || !matchedUser.tenant) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await verifySecret(
      dto.password,
      matchedUser.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tenant = matchedUser.tenant;

    return this.rlsTransaction.runWithTenant(tenant.id, async (manager) => {
      const tokens = await this.issueTokens(matchedUser);
      const refreshTokenHash = await hashSecret(tokens.refreshToken);

      await manager
        .getRepository(UserEntity)
        .update({ id: matchedUser.id }, { refreshTokenHash });

      return {
        ...tokens,
        user: {
          id: matchedUser.id,
          tenantId: matchedUser.tenantId,
          email: matchedUser.email,
          role: matchedUser.role,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          tenantKey: tenant.tenantKey,
          plan: tenant.plan,
          monthlyQuota: tenant.monthlyQuota,
        },
      };
    });
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokensResult> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    let payload: { sub: string; tenantId: string; email: string; role: Role };
    try {
      const refreshSecret = this.configService.get<string>(
        'JWT_REFRESH_SECRET',
        'dev-refresh-secret-do-not-use-in-prod',
      );
      payload = await this.jwtService.verifyAsync(rawRefreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return this.rlsTransaction.runWithTenant(
      payload.tenantId,
      async (manager) => {
        const userRepo = manager.getRepository(UserEntity);
        const user = await userRepo.findOne({
          where: { id: payload.sub },
          relations: ['tenant'],
        });

        if (!user || !user.refreshTokenHash || !user.tenant) {
          throw new UnauthorizedException('Session has been revoked');
        }

        const isTokenValid = await verifySecret(
          rawRefreshToken,
          user.refreshTokenHash,
        );
        if (!isTokenValid) {
          // Possible token reuse: revoke session immediately
          await userRepo.update({ id: user.id }, { refreshTokenHash: null });
          throw new UnauthorizedException('Invalid refresh token');
        }

        const tokens = await this.issueTokens(user);
        user.refreshTokenHash = await hashSecret(tokens.refreshToken);
        await userRepo.save(user);

        return {
          ...tokens,
          user: {
            id: user.id,
            tenantId: user.tenantId,
            email: user.email,
            role: user.role,
          },
          tenant: {
            id: user.tenant.id,
            name: user.tenant.name,
            tenantKey: user.tenant.tenantKey,
            plan: user.tenant.plan,
            monthlyQuota: user.tenant.monthlyQuota,
          },
        };
      },
    );
  }

  async logout(tenantId: string, userId: string): Promise<void> {
    await this.rlsTransaction.runWithTenant(tenantId, async (manager) => {
      await manager
        .getRepository(UserEntity)
        .update({ id: userId }, { refreshTokenHash: null });
    });
  }

  private async issueTokens(
    user: Pick<UserEntity, 'id' | 'tenantId' | 'email' | 'role'>,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessSecret = this.configService.get<string>(
      'JWT_ACCESS_SECRET',
      'dev-access-secret-do-not-use-in-prod',
    );
    const refreshSecret = this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      'dev-refresh-secret-do-not-use-in-prod',
    );

    const claims = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      jti: randomBytes(8).toString('hex'),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(claims, {
        secret: accessSecret,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(claims, {
        secret: refreshSecret,
        expiresIn: '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private generateTenantKey(businessName: string): string {
    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const suffix = randomBytes(3).toString('hex');
    return `${slug || 'tenant'}-${suffix}`;
  }
}

