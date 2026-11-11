import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth/decorators';
import { PrismaService } from './common/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public() @Get()
  async check() {
    const db = await this.prisma.$queryRaw`SELECT 1`.then(() => 'up').catch(() => 'down');
    return { status: db === 'up' ? 'ok' : 'degraded', db };
  }
}
