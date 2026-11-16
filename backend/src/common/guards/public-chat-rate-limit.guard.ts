import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { RedisService } from '../../infra/redis/redis.module';

/**
 * FR-8 & Tech Decisions Section 2:
 * Enforces both per-IP and per-tenant Redis rate limiting on the public chat endpoint
 * (`POST /chat/:tenantKey/messages`).
 */
@Injectable()
export class PublicChatRateLimitGuard implements CanActivate {
  private readonly perIpLimitPerMinute = 30;
  private readonly perTenantLimitPerMinute = 120;
  private readonly windowSeconds = 60;

  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const tenantKey = String(req.params?.tenantKey || 'unknown');
    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : (forwardedFor?.split(',')[0]?.trim() || req.ip || '127.0.0.1');

    const ipKey = `ratelimit:chat:ip:${clientIp}`;
    const tenantRateKey = `ratelimit:chat:tenant:${tenantKey}`;

    const [ipCount, tenantCount] = await Promise.all([
      this.redisService.increment(ipKey, this.windowSeconds),
      this.redisService.increment(tenantRateKey, this.windowSeconds),
    ]);

    if (ipCount > this.perIpLimitPerMinute) {
      throw new HttpException(
        'Too many chat requests from this IP address. Please wait a moment and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (tenantCount > this.perTenantLimitPerMinute) {
      throw new HttpException(
        'This support bot is experiencing high traffic. Please try again in a moment.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
