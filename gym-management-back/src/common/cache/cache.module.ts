import { Global, Injectable, Module } from '@nestjs/common';

interface Entry {
  value: unknown;
  expires: number;
}

/**
 * Cache em memória por academia. Cada academia tem um contador de versão e as
 * chaves incluem a versão: invalidar = incrementar o contador (O(1)).
 *
 * Na V1 a API roda numa única instância do Cloud Run (max-instances=1), então
 * memória local basta. Com várias instâncias, trocar a implementação por um
 * cache compartilhado mantendo esta interface.
 */
@Injectable()
export class CacheService {
  private readonly versions = new Map<string, number>();
  private readonly store = new Map<string, Entry>();
  private static readonly MAX_ENTRIES = 500;

  private key(tenantId: string, key: string) {
    return `${tenantId}:${this.versions.get(tenantId) ?? 0}:${key}`;
  }

  async getOrSet<T>(tenantId: string, key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const k = this.key(tenantId, key);
    const hit = this.store.get(k);
    if (hit && hit.expires > Date.now()) return hit.value as T;
    const value = await fn();
    this.set(k, value, ttlSeconds);
    return value;
  }

  async invalidate(tenantId: string): Promise<void> {
    this.versions.set(tenantId, (this.versions.get(tenantId) ?? 0) + 1);
    const prefix = `${tenantId}:`;
    for (const k of this.store.keys()) if (k.startsWith(prefix)) this.store.delete(k);
  }

  private set(k: string, value: unknown, ttlSeconds: number) {
    const now = Date.now();
    if (this.store.size >= CacheService.MAX_ENTRIES) {
      for (const [key, e] of this.store) if (e.expires <= now) this.store.delete(key);
      // ainda cheio: descarta as mais antigas (ordem de inserção do Map)
      for (const key of this.store.keys()) {
        if (this.store.size < CacheService.MAX_ENTRIES) break;
        this.store.delete(key);
      }
    }
    this.store.set(k, { value, expires: now + ttlSeconds * 1000 });
  }
}

@Global()
@Module({ providers: [CacheService], exports: [CacheService] })
export class CacheModule {}
