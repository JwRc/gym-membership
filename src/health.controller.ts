import { Controller, Get, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { Public } from './common/auth/decorators';
import { PrismaService } from './common/prisma.service';
import { REDIS } from './common/redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public() @Get()
  async check() {
    const [db, cache] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'up').catch(() => 'down'),
      this.redis.ping().then(() => 'up').catch(() => 'down'),
    ]);
    return { status: db === 'up' && cache === 'up' ? 'ok' : 'degraded', db, redis: cache };
  }
}
