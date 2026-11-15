import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing Bearer access token');
    }

    try {
      const secret = this.configService.get<string>(
        'JWT_ACCESS_SECRET',
        'dev-access-secret-do-not-use-in-prod',
      );
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        tenantId: string;
        email: string;
        role: AuthenticatedUser['role'];
      }>(token, { secret });

      if (!payload.sub || !payload.tenantId) {
        throw new UnauthorizedException('Invalid token claims');
      }

      const user: AuthenticatedUser = {
        userId: payload.sub,
        tenantId: payload.tenantId,
        email: payload.email,
        role: payload.role,
      };
      (request as Request & { user: AuthenticatedUser }).user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private extractBearerToken(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}

