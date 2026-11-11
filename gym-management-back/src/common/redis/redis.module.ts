import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS');

/**
 * Cache por academia. Cada tenant tem um contador de versão; as chaves incluem
 * a versão, então invalidar = incrementar o contador (O(1), sem SCAN).
 */
@Injectable()
export class CacheService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private vKey(tenantId: string) {
    return `t:${tenantId}:v`;
  }

  async getOrSet<T>(tenantId: string, key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    let version = '0';
    try {
      version = (await this.redis.get(this.vKey(tenantId))) ?? '0';
      const hit = await this.redis.get(`t:${tenantId}:${version}:${key}`);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      return fn(); // Redis fora do ar: segue sem cache
    }
    const value = await fn();
    this.redis.set(`t:${tenantId}:${version}:${key}`, JSON.stringify(value), 'EX', ttlSeconds).catch(() => undefined);
    return value;
  }

  async invalidate(tenantId: string) {
    await this.redis.incr(this.vKey(tenantId)).catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) =>
        new Redis({
          host: cfg.get('REDIS_HOST', 'localhost'),
          port: Number(cfg.get('REDIS_PORT', 6379)),
          maxRetriesPerRequest: 2,
          lazyConnect: false,
        }),
    },
    CacheService,
  ],
  exports: [REDIS, CacheService],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }
}
