import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit_options';

export interface RateLimitOptions {
  /** Maximum requests allowed within `windowSeconds` per client IP */
  limit: number;
  /** Sliding/fixed window duration in seconds (default: 60) */
  windowSeconds?: number;
  /** Redis key namespace prefix (e.g. 'auth:login', 'chat:public', 'docs:upload') */
  keyPrefix: string;
  /** Optional higher ceiling enforced per tenant (for public chat endpoints) */
  perTenantLimit?: number;
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
