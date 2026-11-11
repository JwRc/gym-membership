import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma.service';
import { CacheService } from '../../common/redis/redis.module';
import { brDate, dateOnly, hm, money, nowMinutes, today, weekdayMon0 } from '../../common/util';
import { invoiceState } from '../../domain/invoices';
import { AcademyQueries } from '../shared/academy.queries';
import { FinanceModule, FinanceService } from '../finance/finance.module';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly q: AcademyQueries,
    private readonly finance: FinanceService,
    private readonly cache: CacheService,
  ) {}

  get(tenantId: string) {
    // "Turmas de hoje" depende do horário: a chave inclui o bloco de 5 minutos.
    return this.cache.getOrSet(tenantId, `dashboard:${Math.floor(nowMinutes() / 5)}`, 300, () => this.build(tenantId));
  }

  private async build(tenantId: string) {
    const t = today();
    const y = t.getUTCFullYear();
    const m = t.getUTCMonth() + 1;
    const [tenant, rows, finRows, invoices, groups] = await Promise.all([
      this.q.tenant(tenantId),
      this.q.studentRows(tenantId),
      this.finance.monthRows(tenantId, y, m),
      this.prisma.invoice.findMany({ where: { tenantId, year: y, month: m, status: { not: 'EXEMPT' } }, select: { status: true, dueDate: true } }),
      this.prisma.classGroup.findMany({
        where: { tenantId, discipline: { archived: false } },
        include: {
          slots: true,
          discipline: { select: { color: true } },
          instructor: { select: { name: true } },
          _count: { select: { enrollments: { where: { student: { status: 'ACTIVE' } } } } },
        },
      }),
    ]);
    const active = rows.filter((r) => r.status === 'ACTIVE');

    // Aniversariantes
    const md = (iso: string) => iso.slice(5, 10);
    const todayMD = md(t.toISOString());
    const bdays = active.filter((s) => s.birthDate.slice(5, 7) === todayMD.slice(0, 2)).sort((a, b) => md(a.birthDate).localeCompare(md(b.birthDate)));
    const turning = (s: (typeof active)[number]) => y - Number(s.birthDate.slice(0, 4));
    const birthdays = {
      today: bdays
        .filter((s) => md(s.birthDate) === todayMD)
        .map((s) => ({ id: s.id, name: s.name, initials: s.initials, sub: `Faz ${turning(s)} anos` + (s.ranks[0] ? ` · ${s.ranks[0].discipline.name} ${s.ranks[0].belt.label}` : '') })),
      month: bdays.map((s) => ({ id: s.id, name: s.name, day: brDate(dateOnly(s.birthDate))!.slice(0, 5), age: `${turning(s)} anos`, past: md(s.birthDate) < todayMD, today: md(s.birthDate) === todayMD })),
    };

    // Financeiro do mês + barra de mensalidades
    const sum = this.finance.summarize(finRows);
    const st = invoices.map((i) => invoiceState(i, t, tenant.lateToleranceDays));
    const n = Math.max(1, st.length);
    const paid = st.filter((s) => s === 'paid').length;
    const late = st.filter((s) => s === 'overdue' || s === 'grace').length;
    const due = st.filter((s) => s === 'today').length;
    const finance = {
      ...sum,
      invoices: { total: st.length, paid, late, dueToday: due, upcoming: st.length - paid - late - due, pctPaid: paid / n, wPaid: paid / n, wLate: late / n, wDue: due / n },
    };

    // Turmas de hoje
    const wd = weekdayMon0(t);
    const now = nowMinutes();
    const todayClasses = groups
      .flatMap((g) => g.slots.filter((s) => s.weekday === wd).map((s) => ({ g, s })))
      .sort((a, b) => a.s.startMin - b.s.startMin)
      .map(({ g, s }) => {
        const state = now >= s.endMin ? 'done' : now >= s.startMin ? 'live' : 'next';
        const mins = s.startMin - now;
        return {
          id: s.id, classId: g.id, name: g.name, color: g.discipline.color, instructor: g.instructor?.name ?? null,
          start: hm(s.startMin), end: hm(s.endMin), count: g._count.enrollments, capacity: g.capacity, state,
          label: state === 'done' ? 'Encerrada' : state === 'live' ? 'Agora' : mins <= 90 ? `Em ${mins} min` : `Às ${hm(s.startMin)}`,
        };
      });

    // Atrasadas
    const lateList = active
      .filter((s) => s.finance.key === 'late')
      .map((s) => {
        const overdue = s.openInvoices
          .filter((i) => invoiceState({ status: i.status, dueDate: dateOnly(i.dueDate) }, t, tenant.lateToleranceDays) === 'overdue')
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        return { id: s.id, name: s.name, initials: s.initials, dueDate: brDate(dateOnly(overdue[0]?.dueDate ?? t.toISOString())), amount: money(overdue.reduce((a, i) => a + i.amount, 0)), days: s.finance.days ?? 0 };
      })
      .sort((a, b) => b.days - a.days);

    return {
      date: t.toISOString().slice(0, 10),
      activeStudents: active.length,
      birthdays,
      finance,
      todayClasses,
      late: { count: lateList.length, total: money(lateList.reduce((a, l) => a + l.amount, 0)), rows: lateList.slice(0, 6) },
    };
  }
}

@Roles('ADMIN')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}
  @Get() get(@CurrentUser() u: AuthUser) {
    return this.svc.get(u.tenantId);
  }
}

@Module({ imports: [FinanceModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
