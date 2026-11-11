import { Body, Controller, ForbiddenException, Headers, HttpCode, Injectable, Logger, Module, Post } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { IsInt, Max, Min } from 'class-validator';
import { Can, CurrentUser, Public } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma.service';
import { CacheService } from '../../common/cache/cache.module';
import { today } from '../../common/util';
import { InvoicesService } from '../students/invoices.service';
import { StudentsModule } from '../students/students.module';

/**
 * Cobrança: geração de mensalidades e marcação de atrasos.
 * Na V1 roda de forma síncrona, disparada pelo Cloud Scheduler
 * (POST /internal/billing/daily) ou sob demanda pelo administrador.
 */
@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly cache: CacheService,
  ) {}

  private tenants(tenantId?: string, onlyAuto = false) {
    return this.prisma.tenant.findMany({ where: { ...(tenantId ? { id: tenantId } : {}), ...(onlyAuto ? { autoGenerateInvoices: true } : {}) } });
  }

  /**
   * Sem ano/mês: garante o mês corrente e, a partir do dia 25, já cria o mês
   * seguinte (Configurações › "Gerar mensalidades automaticamente").
   * Idempotente: a constraint (aluno, ano, mês) impede duplicatas.
   */
  async generate(opts: { tenantId?: string; year?: number; month?: number; force?: boolean } = {}) {
    const t = today();
    const y = t.getUTCFullYear();
    const m = t.getUTCMonth() + 1;
    const months: [number, number][] =
      opts.year && opts.month ? [[opts.year, opts.month]] : [[y, m], ...(t.getUTCDate() >= 25 ? [[m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1] as [number, number]] : [])];
    const result: Record<string, number> = {};
    for (const tenant of await this.tenants(opts.tenantId, !opts.force)) {
      let n = 0;
      for (const [yy, mm] of months) n += await this.invoices.generateMonth(tenant.id, yy, mm);
      result[tenant.id] = n;
      if (n) await this.cache.invalidate(tenant.id);
    }
    this.log.log(`Mensalidades geradas: ${JSON.stringify(result)}`);
    return result;
  }

  async markOverdue(tenantId?: string) {
    const out: Record<string, number> = {};
    for (const tenant of await this.tenants(tenantId)) {
      const marked = await this.invoices.markOverdue(tenant.id);
      out[tenant.id] = marked.length;
      if (marked.length) await this.cache.invalidate(tenant.id);
    }
    this.log.log(`Mensalidades marcadas como atrasadas: ${JSON.stringify(out)}`);
    return out;
  }
}

class GenerateDto {
  @IsInt() @Min(2000) year: number;
  @IsInt() @Min(1) @Max(12) month: number;
}

/** Sob demanda, para o administrador da academia (só a própria academia). */
@Can('billing.run')
@Controller('jobs')
export class JobsController {
  constructor(private readonly billing: BillingService) {}

  @Post('invoices/generate') @HttpCode(200)
  async generate(@CurrentUser() u: AuthUser, @Body() dto: GenerateDto) {
    const r = await this.billing.generate({ tenantId: u.tenantId, year: dto.year, month: dto.month, force: true });
    return { created: r[u.tenantId] ?? 0 };
  }

  @Post('invoices/mark-overdue') @HttpCode(200)
  async markOverdue(@CurrentUser() u: AuthUser) {
    const r = await this.billing.markOverdue(u.tenantId);
    return { marked: r[u.tenantId] ?? 0 };
  }
}

/** Compara o segredo em tempo constante. */
function sameSecret(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rotina diária chamada pelo Cloud Scheduler, autenticada pelo header
 * X-Cron-Secret (= CRON_SECRET). Sem CRON_SECRET configurado, fica desligada.
 */
@Controller('internal')
export class InternalController {
  constructor(private readonly billing: BillingService) {}

  @Public() @Post('billing/daily') @HttpCode(200)
  async daily(@Headers('x-cron-secret') secret?: string) {
    if (!sameSecret(secret, process.env.CRON_SECRET)) throw new ForbiddenException('Acesso restrito.');
    const generated = await this.billing.generate();
    const overdue = await this.billing.markOverdue();
    return { generated, overdue };
  }
}

@Module({
  imports: [StudentsModule],
  controllers: [JobsController, InternalController],
  providers: [BillingService],
})
export class JobsModule {}
