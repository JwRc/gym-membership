import { Body, Controller, Get, Injectable, Logger, Module, NotFoundException, OnModuleInit, Param, Post } from '@nestjs/common';
import { BullModule, InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { IsInt, Max, Min } from 'class-validator';
import { Can, CurrentUser } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma.service';
import { CacheService } from '../../common/redis/redis.module';
import { today } from '../../common/util';
import { InvoicesService } from '../students/invoices.service';
import { StudentsModule } from '../students/students.module';
import { BILLING_QUEUE, BillingJobs, GenerateInvoicesData, NOTIFICATIONS_QUEUE, NotificationJobs } from './queues';

const TZ = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

/** Processa a cobrança: geração de mensalidades e marcação de atrasos. */
@Processor(BILLING_QUEUE)
export class BillingProcessor extends WorkerHost {
  private readonly log = new Logger(BillingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly cache: CacheService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue,
  ) {
    super();
  }

  async process(job: Job) {
    switch (job.name) {
      case BillingJobs.GENERATE_INVOICES:
        return this.generate(job.data as GenerateInvoicesData);
      case BillingJobs.MARK_OVERDUE:
        return this.markOverdue((job.data as { tenantId?: string }).tenantId);
      default:
        this.log.warn(`Job desconhecido: ${job.name}`);
    }
  }

  private async tenants(tenantId?: string, onlyAuto = false) {
    return this.prisma.tenant.findMany({ where: { ...(tenantId ? { id: tenantId } : {}), ...(onlyAuto ? { autoGenerateInvoices: true } : {}) } });
  }

  /**
   * Sem ano/mês: garante o mês corrente e, a partir do dia 25, já cria o mês
   * seguinte (como em Configurações › "Gerar mensalidades automaticamente").
   * Idempotente: a constraint (aluno, ano, mês) impede duplicatas.
   */
  private async generate(data: GenerateInvoicesData) {
    const t = today();
    const y = t.getUTCFullYear();
    const m = t.getUTCMonth() + 1;
    const months: [number, number][] = data.year && data.month ? [[data.year, data.month]] : [[y, m], ...(t.getUTCDate() >= 25 ? [[m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1] as [number, number]] : [])];
    const result: Record<string, number> = {};
    for (const tenant of await this.tenants(data.tenantId, !data.force)) {
      let n = 0;
      for (const [yy, mm] of months) n += await this.invoices.generateMonth(tenant.id, yy, mm);
      result[tenant.id] = n;
      if (n) await this.cache.invalidate(tenant.id);
    }
    this.log.log(`Mensalidades geradas: ${JSON.stringify(result)}`);
    return result;
  }

  private async markOverdue(tenantId?: string) {
    const out: Record<string, number> = {};
    for (const tenant of await this.tenants(tenantId)) {
      const marked = await this.invoices.markOverdue(tenant.id);
      out[tenant.id] = marked.length;
      if (!marked.length) continue;
      await this.cache.invalidate(tenant.id);
      await this.notifications.addBulk(
        marked.map((m) => ({ name: NotificationJobs.INVOICE_OVERDUE, data: { tenantId: tenant.id, ...m }, opts: { jobId: `overdue:${m.id}`, removeOnComplete: 500 } })),
      );
    }
    return out;
  }
}

/**
 * Notificações. Hoje só registra no log — é o ponto de integração para
 * e-mail/WhatsApp (ex.: lembrete de mensalidade, aviso de estoque baixo).
 */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly log = new Logger(NotificationsProcessor.name);

  async process(job: Job) {
    if (job.name === NotificationJobs.LOW_STOCK) this.log.log(`Estoque baixo: ${job.data.name} (${job.data.stock} un.)`);
    else if (job.name === NotificationJobs.INVOICE_OVERDUE)
      this.log.log(`Mensalidade em atraso: ${job.data.student} · venc. ${job.data.dueDate} · R$ ${job.data.amount}`);
    return { delivered: false, channel: 'log' };
  }
}

/** Registra os jobs recorrentes (idempotente: upsert pelo id do agendador). */
@Injectable()
export class JobsScheduler implements OnModuleInit {
  private readonly log = new Logger(JobsScheduler.name);
  constructor(@InjectQueue(BILLING_QUEUE) private readonly billing: Queue) {}

  async onModuleInit() {
    if (process.env.DISABLE_SCHEDULER === 'true') return;
    try {
      await this.billing.upsertJobScheduler('daily-generate-invoices', { pattern: '0 2 * * *', tz: TZ }, { name: BillingJobs.GENERATE_INVOICES, data: {} });
      await this.billing.upsertJobScheduler('daily-mark-overdue', { pattern: '0 3 * * *', tz: TZ }, { name: BillingJobs.MARK_OVERDUE, data: {} });
      this.log.log('Agendadores de cobrança registrados (02:00 gerar · 03:00 atrasos).');
    } catch (e) {
      this.log.error(`Não foi possível registrar os agendadores: ${(e as Error).message}`);
    }
  }
}

class GenerateDto {
  @IsInt() @Min(2000) year: number;
  @IsInt() @Min(1) @Max(12) month: number;
}

@Can('billing.run')
@Controller('jobs')
export class JobsController {
  constructor(@InjectQueue(BILLING_QUEUE) private readonly billing: Queue) {}

  @Post('invoices/generate')
  async generate(@CurrentUser() u: AuthUser, @Body() dto: GenerateDto) {
    const job = await this.billing.add(BillingJobs.GENERATE_INVOICES, { tenantId: u.tenantId, year: dto.year, month: dto.month, force: true });
    return { jobId: job.id };
  }

  @Post('invoices/mark-overdue')
  async markOverdue(@CurrentUser() u: AuthUser) {
    const job = await this.billing.add(BillingJobs.MARK_OVERDUE, { tenantId: u.tenantId });
    return { jobId: job.id };
  }

  @Get(':id')
  async status(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const job = await this.billing.getJob(id);
    if (!job || job.data?.tenantId !== u.tenantId) throw new NotFoundException('Job não encontrado.');
    return { id: job.id, name: job.name, state: await job.getState(), result: job.returnvalue ?? null, failedReason: job.failedReason ?? null };
  }
}

@Module({
  imports: [BullModule.registerQueue({ name: BILLING_QUEUE }, { name: NOTIFICATIONS_QUEUE }), StudentsModule],
  controllers: [JobsController],
  providers: [BillingProcessor, NotificationsProcessor, JobsScheduler],
})
export class JobsModule {}
