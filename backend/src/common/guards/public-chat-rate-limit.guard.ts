import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RedisService } from '../../infra/redis/redis.module';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';

@Injectable()
export class PublicChatRateLimitGuard implements CanActivate {
  private readonly defaultIpLimitPerMinute = 30;
  private readonly defaultTenantLimitPerMinute = 120;
  private readonly defaultWindowSeconds = 60;

  constructor(
    private readonly redisService: RedisService,
    @Optional() private readonly reflector?: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res =
      typeof http.getResponse === 'function'
        ? http.getResponse<Response | undefined>()
        : undefined;

    const routeOptions =
      typeof context.getHandler === 'function' &&
      typeof context.getClass === 'function' &&
      this.reflector
        ? this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
            RATE_LIMIT_KEY,
            [context.getHandler(), context.getClass()],
          )
        : undefined;

    const ipLimit = routeOptions?.limit ?? this.defaultIpLimitPerMinute;
    const windowSeconds =
      routeOptions?.windowSeconds ?? this.defaultWindowSeconds;
    const keyPrefix = routeOptions?.keyPrefix ?? 'chat';
    const perTenantLimit =
      routeOptions?.perTenantLimit ??
      (keyPrefix === 'chat' ? this.defaultTenantLimitPerMinute : undefined);

    const forwardedFor = req.headers?.['x-forwarded-for'];
    const clientIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : (forwardedFor?.split(',')[0]?.trim() || req.ip || '127.0.0.1');

    const ipKey = `ratelimit:${keyPrefix}:ip:${clientIp}`;
    const ipCount = await this.redisService.increment(ipKey, windowSeconds);

    if (res && typeof res.setHeader === 'function') {
      res.setHeader('X-RateLimit-Limit', String(ipLimit));
      res.setHeader(
        'X-RateLimit-Remaining',
        String(Math.max(0, ipLimit - ipCount)),
      );
    }

    if (ipCount > ipLimit) {
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('Retry-After', String(windowSeconds));
      }
      throw new HttpException(
        'Too many requests from this IP address. Please wait a moment and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (perTenantLimit !== undefined) {
      const tenantKey = String(
        req.params?.tenantKey ||
          (req as Request & { user?: { tenantId?: string } }).user?.tenantId ||
          'unknown',
      );
      const tenantRateKey = `ratelimit:${keyPrefix}:tenant:${tenantKey}`;
      const tenantCount = await this.redisService.increment(
        tenantRateKey,
        windowSeconds,
      );

      if (tenantCount > perTenantLimit) {
        if (res && typeof res.setHeader === 'function') {
          res.setHeader('Retry-After', String(windowSeconds));
        }
        throw new HttpException(
          'This workspace has exceeded its per-minute rate limit. Please try again shortly.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    return true;
  }
}

export { PublicChatRateLimitGuard as RedisRateLimitGuard };
