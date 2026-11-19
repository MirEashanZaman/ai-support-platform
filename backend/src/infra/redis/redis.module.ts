import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly memoryFallback = new Map<string, { value: string; expiresAt?: number }>();

  constructor(private readonly configService: ConfigService) {
    const isTest = this.configService.get<string>('NODE_ENV') === 'test';
    const host = this.configService.get<string>('REDIS_HOST');

    if (!isTest && host) {
      this.client = new Redis({
        host,
        port: this.configService.get<number>('REDIS_PORT', 6379),
        password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 2,
      });

      this.client.on('error', (err) => {
        this.logger.warn(`Redis connection warning (using in-memory fallback): ${err.message}`);
      });
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.client?.status === 'ready') {
      return this.client.get(key);
    }
    const entry = this.memoryFallback.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.memoryFallback.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.client?.status === 'ready') {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
      return;
    }
    this.memoryFallback.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async increment(key: string, ttlSeconds?: number): Promise<number> {
    if (this.client?.status === 'ready') {
      const count = await this.client.incr(key);
      if (count === 1 && ttlSeconds) {
        await this.client.expire(key, ttlSeconds);
      }
      return count;
    }
    const current = Number((await this.get(key)) ?? '0') + 1;
    await this.set(key, String(current), ttlSeconds);
    return current;
  }

  async del(key: string): Promise<void> {
    if (this.client?.status === 'ready') {
      await this.client.del(key);
      return;
    }
    this.memoryFallback.delete(key);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
