import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { MONTHS, PAYMENT_LABEL, addDays, brDate, dateOnly, diffDays, iso, money, num, today, ymd } from '../../common/util';
import { INVOICE_LABEL, invoiceState } from '../../domain/invoices';
import { AcademyQueries } from '../shared/academy.queries';
import { LaunchInvoicesDto, PayInvoiceDto } from './invoices.dto';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly q: AcademyQueries,
  ) {}

  /** Mensalidades do aluno + resumo (telas "Financeiro do aluno" e portal). */
  async forStudent(tenantId: string, studentId: string) {
    const [tenant, s] = await Promise.all([this.q.tenant(tenantId), this.q.studentOr404(tenantId, studentId)]);
    const invoices = await this.prisma.invoice.findMany({ where: { studentId }, orderBy: [{ dueDate: 'desc' }] });
    const t = today();
    const year = t.getUTCFullYear();
    const rows = invoices.map((i) => {
      const state = invoiceState(i, t, tenant.lateToleranceDays);
      return {
        id: i.id,
        ref: `${MONTHS[i.month - 1]} ${i.year}`,
        year: i.year,
        month: i.month,
        dueDate: iso(i.dueDate),
        amount: num(i.amount),
        paidAt: iso(i.paidAt),
        method: i.paymentMethod ? PAYMENT_LABEL[i.paymentMethod] : null,
        state,
        label: state === 'overdue' ? `Atrasado · ${diffDays(i.dueDate, t)} dias` : INVOICE_LABEL[state],
        manual: i.manual,
        canPay: ['overdue', 'grace', 'today', 'upcoming'].includes(state),
      };
    });
    const paidYear = rows.filter((r) => r.state === 'paid' && r.paidAt?.startsWith(String(year)));
    const open = rows.filter((r) => ['overdue', 'grace', 'today'].includes(r.state));
    const next = [...rows].reverse().find((r) => r.state === 'upcoming' || r.state === 'today');
    return {
      summary: {
        paidYear: money(paidYear.reduce((a, r) => a + r.amount, 0)),
        paidYearCount: paidYear.length,
        open: money(open.reduce((a, r) => a + r.amount, 0)),
        openCount: open.length,
        next: next ? { dueDate: next.dueDate, amount: next.amount } : null,
        monthlyFee: num(s.monthlyFee),
        dueDay: s.dueDay,
      },
      rows,
    };
  }

  async launch(tenantId: string, studentId: string, dto: LaunchInvoicesDto) {
    const s = await this.q.studentOr404(tenantId, studentId);
    if (dto.paid && !dto.method) throw new BadRequestException('Informe a forma de pagamento.');
    const firstDue = dateOnly(dto.dueDate);
    const created: string[] = [];
    const skipped: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (let k = 0; k < dto.repeat; k++) {
        const m0 = dto.month - 1 + k;
        const y = dto.year + Math.floor(m0 / 12);
        const m = (m0 % 12) + 1;
        const due = k === 0 ? firstDue : ymd(y, m, firstDue.getUTCDate());
        const exists = await tx.invoice.findUnique({ where: { studentId_year_month: { studentId, year: y, month: m } } });
        if (exists) {
          skipped.push(`${MONTHS[m - 1]} ${y}`);
          continue;
        }
        const inv = await tx.invoice.create({
          data: {
            tenantId, studentId, year: y, month: m, dueDate: due, amount: dto.amount, manual: true,
            ...(dto.paid ? { status: 'PAID', paidAt: dto.paidAt ? dateOnly(dto.paidAt) : today(), paymentMethod: dto.method } : {}),
          },
        });
        if (dto.paid) await this.paymentTx(tx, tenantId, inv.id, s.name, `${MONTHS[m - 1]} ${y}`, dto.amount, inv.paidAt!);
        created.push(inv.id);
      }
    });
    return { created: created.length, skipped, total: money(created.length * dto.amount) };
  }

  async pay(tenantId: string, invoiceId: string, dto: PayInvoiceDto) {
    const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId, tenantId }, include: { student: true } });
    if (!inv) throw new NotFoundException('Mensalidade não encontrada.');
    if (inv.status === 'PAID') throw new BadRequestException('Essa mensalidade já está paga.');
    if (inv.status === 'EXEMPT') throw new BadRequestException('Mensalidade isenta (matrícula trancada).');
    const paidAt = dto.paidAt ? dateOnly(dto.paidAt) : today();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({ where: { id: inv.id }, data: { status: 'PAID', paidAt, paymentMethod: dto.method } });
      await this.paymentTx(tx, tenantId, inv.id, inv.student.name, `${MONTHS[inv.month - 1]} ${inv.year}`, num(inv.amount), paidAt);
      return { id: updated.id, status: updated.status, paidAt: iso(updated.paidAt) };
    });
  }

  private paymentTx(tx: Prisma.TransactionClient, tenantId: string, invoiceId: string, name: string, ref: string, amount: number, date: Date) {
    return tx.transaction.create({
      data: {
        tenantId, invoiceId, date, amount, description: `Mensalidade · ${name}`, note: ref, category: 'Mensalidades',
        type: 'INCOME', status: 'PAID', source: 'INVOICE',
      },
    });
  }

  /** Gera as mensalidades do mês para todos os alunos ativos (idempotente). Usado pelo job de cobrança. */
  async generateMonth(tenantId: string, year: number, month: number) {
    const students = await this.prisma.student.findMany({ where: { tenantId, status: { in: ['ACTIVE', 'LOCKED'] } } });
    const existing = new Set(
      (await this.prisma.invoice.findMany({ where: { tenantId, year, month }, select: { studentId: true } })).map((i) => i.studentId),
    );
    const data = students
      .filter((s) => !existing.has(s.id))
      .map((s) => ({
        tenantId, studentId: s.id, year, month, dueDate: ymd(year, month, s.dueDay), amount: s.monthlyFee,
        status: s.status === 'LOCKED' ? ('EXEMPT' as const) : ('PENDING' as const),
      }));
    if (data.length) await this.prisma.invoice.createMany({ data, skipDuplicates: true });
    return data.length;
  }

  /** Marca como atrasadas as mensalidades vencidas além da tolerância. Retorna as recém-marcadas. */
  async markOverdue(tenantId: string) {
    const tenant = await this.q.tenant(tenantId);
    const limit = addDays(today(), -tenant.lateToleranceDays);
    const due = await this.prisma.invoice.findMany({
      where: { tenantId, status: 'PENDING', dueDate: { lt: limit } },
      include: { student: { select: { name: true } } },
    });
    if (due.length) await this.prisma.invoice.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { status: 'OVERDUE' } });
    return due.map((d) => ({ id: d.id, student: d.student.name, dueDate: brDate(d.dueDate), amount: num(d.amount) }));
  }
}
