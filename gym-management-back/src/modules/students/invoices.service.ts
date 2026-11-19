import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Family, InvoiceStatus, Prisma, StudentStatus, Tenant } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { MONTHS, PAYMENT_LABEL, addDays, brDate, dateOnly, diffDays, iso, money, num, today, ymd } from '../../common/util';
import { INVOICE_LABEL, invoiceState } from '../../domain/invoices';
import { DiscountRule, MemberAmount, effectiveRule, familyAmounts } from '../../domain/family-discount';
import { AcademyQueries } from '../shared/academy.queries';
import { LaunchInvoicesDto, PayInvoiceDto } from './invoices.dto';

type Db = Prisma.TransactionClient | PrismaService;
export const OPEN_STATUS: InvoiceStatus[] = ['PENDING', 'OVERDUE'];

interface MemberRow {
  id: string;
  dueDay: number;
  monthlyFee: Prisma.Decimal;
  status: StudentStatus;
}
const MEMBER_SELECT = { id: true, dueDay: true, monthlyFee: true, status: true } as const;

/** Regra padrão do desconto família da academia. */
export function tenantRule(t: Pick<Tenant, 'familyDiscountKind' | 'familyDiscountType' | 'familyDiscountValue'>): DiscountRule {
  return { kind: t.familyDiscountKind, valueType: t.familyDiscountType, value: num(t.familyDiscountValue) };
}

/** Regra que vale para a família (padrão da academia, própria ou nenhuma). */
export function familyRule(tenant: Parameters<typeof tenantRule>[0], f: Family): DiscountRule {
  return effectiveRule(
    tenantRule(tenant),
    { discountOverride: f.discountOverride, discountKind: f.discountKind, discountType: f.discountType, discountValue: f.discountValue == null ? null : num(f.discountValue) },
    f.billingMode,
  );
}

const consolidated = (f: Family) => f.billingMode === 'CONSOLIDATED' && f.dueDay != null;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly q: AcademyQueries,
  ) {}

  /** Mensalidades do aluno + resumo (telas "Financeiro do aluno" e portal). */
  async forStudent(tenantId: string, studentId: string) {
    const [tenant, s] = await Promise.all([this.q.tenant(tenantId), this.q.studentOr404(tenantId, studentId)]);
    const invoices = await this.prisma.invoice.findMany({
      where: { studentId },
      include: { familyCharge: { select: { id: true, familyId: true, family: { select: { name: true } } } } },
      orderBy: [{ dueDate: 'desc' }],
    });
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
        gross: money(num(i.amount) + num(i.discount)),
        discount: num(i.discount),
        discountNote: i.discountNote,
        paidAt: iso(i.paidAt),
        method: i.paymentMethod ? PAYMENT_LABEL[i.paymentMethod] : null,
        state,
        label: state === 'overdue' ? `Atrasado · ${diffDays(i.dueDate, t)} dias` : INVOICE_LABEL[state],
        manual: i.manual,
        /** mensalidade dentro da cobrança consolidada: paga-se pela família */
        charge: i.familyCharge ? { id: i.familyCharge.id, familyId: i.familyCharge.familyId, familyName: i.familyCharge.family.name } : null,
        canPay: ['overdue', 'grace', 'today', 'upcoming'].includes(state) && !i.familyCharge,
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
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { student: true, familyCharge: { select: { family: { select: { name: true } } } } },
    });
    if (!inv) throw new NotFoundException('Mensalidade não encontrada.');
    if (inv.status === 'PAID') throw new BadRequestException('Essa mensalidade já está paga.');
    if (inv.status === 'EXEMPT') throw new BadRequestException('Mensalidade isenta (matrícula trancada).');
    if (inv.familyCharge)
      throw new BadRequestException(`Esta mensalidade faz parte da cobrança da família (${inv.familyCharge.family.name}). Registre o pagamento pela família.`);
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
    const tenant = await this.q.tenant(tenantId);
    const students = await this.prisma.student.findMany({
      where: { tenantId, anonymizedAt: null, status: { in: ['ACTIVE', 'LOCKED'] } },
      select: { ...MEMBER_SELECT, familyId: true },
    });
    const existing = new Set(
      (await this.prisma.invoice.findMany({ where: { tenantId, year, month }, select: { studentId: true } })).map((i) => i.studentId),
    );
    const data = students
      .filter((s) => !s.familyId && !existing.has(s.id))
      .map((s) => ({
        tenantId, studentId: s.id, year, month, dueDate: ymd(year, month, s.dueDay), amount: s.monthlyFee,
        status: s.status === 'LOCKED' ? ('EXEMPT' as const) : ('PENDING' as const),
      }));
    if (data.length) await this.prisma.invoice.createMany({ data, skipDuplicates: true });
    let n = data.length;
    // famílias: desconto calculado com todos os membros; cobrança consolidada quando configurada
    const byFamily = new Map<string, MemberRow[]>();
    for (const s of students) if (s.familyId) byFamily.set(s.familyId, [...(byFamily.get(s.familyId) ?? []), s]);
    for (const [familyId, members] of byFamily) {
      if (members.every((s) => existing.has(s.id))) continue;
      n += await this.generateFamilyMonth(tenant, familyId, members, year, month, existing);
    }
    return n;
  }

  /** Mensalidades do mês de uma família. Membros que já têm a do mês contam para o desconto, mas não são tocados. */
  private async generateFamilyMonth(tenant: Tenant, familyId: string, members: MemberRow[], year: number, month: number, existing: Set<string>) {
    const family = await this.prisma.family.findUniqueOrThrow({ where: { id: familyId } });
    const amounts = familyAmounts(members.map((s) => ({ id: s.id, fee: num(s.monthlyFee), status: s.status })), familyRule(tenant, family));
    const todo = amounts.filter((a) => !existing.has(a.id));
    if (!todo.length) return 0;
    const byId = new Map(members.map((s) => [s.id, s]));
    return this.prisma.$transaction(async (tx) => {
      const charge =
        consolidated(family) && todo.some((a) => !a.exempt)
          ? await tx.familyCharge.upsert({
              where: { familyId_year_month: { familyId, year, month } },
              create: { tenantId: tenant.id, familyId, year, month, dueDate: ymd(year, month, family.dueDay!) },
              update: {},
            })
          : null;
      const data = todo.map((a) => {
        const inCharge = charge && !a.exempt ? charge : null;
        return {
          tenantId: tenant.id, studentId: a.id, year, month,
          dueDate: inCharge ? inCharge.dueDate : ymd(year, month, byId.get(a.id)!.dueDay),
          ...this.amountData(a),
          familyChargeId: inCharge?.id ?? null,
        };
      });
      const r = await tx.invoice.createMany({ data, skipDuplicates: true });
      if (charge) await this.refreshCharge(tx, charge.id);
      return r.count;
    });
  }

  private amountData(a: MemberAmount) {
    return { amount: a.amount, discount: a.discount, discountNote: a.note, status: a.exempt ? ('EXEMPT' as const) : ('PENDING' as const) };
  }

  /** Valor de cada membro da família com o desconto (geração e prévia da tela da família). */
  async familyAmountsOf(db: Db, tenant: Tenant, family: Family) {
    const members = await db.student.findMany({ where: { familyId: family.id, anonymizedAt: null }, select: MEMBER_SELECT });
    const rule = familyRule(tenant, family);
    return { rule, amounts: familyAmounts(members.map((s) => ({ id: s.id, fee: num(s.monthlyFee), status: s.status })), rule) };
  }

  /**
   * Primeira mensalidade do aluno recém-cadastrado: mês corrente, nunca com vencimento no passado.
   * Membro de família já entra com o desconto e, na consolidada, na cobrança do mês (se ainda não venceu).
   */
  async firstInvoice(tenantId: string, studentId: string) {
    const s = await this.prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { family: true } });
    const t = today();
    const year = t.getUTCFullYear();
    const month = t.getUTCMonth() + 1;
    const notPast = (d: Date) => (d < t ? t : d);
    if (!s.family) {
      await this.prisma.invoice.create({
        data: { tenantId, studentId, year, month, dueDate: notPast(ymd(year, month, s.dueDay)), amount: s.monthlyFee },
      });
      return;
    }
    const family = s.family;
    const tenant = await this.q.tenant(tenantId);
    const { amounts } = await this.familyAmountsOf(this.prisma, tenant, family);
    const a = amounts.find((x) => x.id === studentId);
    if (!a) return; // aluno inativo: sem cobrança
    await this.prisma.$transaction(async (tx) => {
      let charge = null;
      if (consolidated(family) && !a.exempt) {
        const cur = await tx.familyCharge.findUnique({ where: { familyId_year_month: { familyId: family.id, year, month } } });
        if (!cur) charge = await tx.familyCharge.create({ data: { tenantId, familyId: family.id, year, month, dueDate: notPast(ymd(year, month, family.dueDay!)) } });
        else if (cur.dueDate >= t && cur.status !== 'PAID') charge = cur; // cobrança já vencida/paga: esta fica avulsa
      }
      const ownDue = consolidated(family) ? family.dueDay! : s.dueDay;
      await tx.invoice.create({
        data: {
          tenantId, studentId, year, month,
          dueDate: charge ? charge.dueDate : notPast(ymd(year, month, ownDue)),
          ...this.amountData(a),
          familyChargeId: charge?.id ?? null,
        },
      });
      if (charge) await this.refreshCharge(tx, charge.id);
    });
  }

  /** Acerta a cobrança da família depois de mexer nas mensalidades dela: some se vazia; paga se todas pagas. */
  async refreshCharge(db: Db, chargeId: string) {
    const c = await db.familyCharge.findUnique({
      where: { id: chargeId },
      include: { invoices: { select: { status: true, paidAt: true, paymentMethod: true }, orderBy: { paidAt: 'desc' } } },
    });
    if (!c) return;
    if (!c.invoices.length) {
      await db.familyCharge.delete({ where: { id: c.id } });
      return;
    }
    const allPaid = c.invoices.every((i) => i.status === 'PAID');
    if (allPaid && c.status !== 'PAID') {
      const last = c.invoices[0];
      await db.familyCharge.update({ where: { id: c.id }, data: { status: 'PAID', paidAt: last.paidAt, paymentMethod: last.paymentMethod } });
    } else if (!allPaid && c.status === 'PAID') {
      await db.familyCharge.update({ where: { id: c.id }, data: { status: 'PENDING', paidAt: null, paymentMethod: null } });
    }
  }

  /** Tira mensalidades em aberto das cobranças da família (elas passam a ser pagas avulsas, com o valor que já tinham). */
  async detachOpen(db: Db, where: Prisma.InvoiceWhereInput) {
    const inv = await db.invoice.findMany({
      where: { ...where, familyChargeId: { not: null }, status: { in: OPEN_STATUS } },
      select: { id: true, familyChargeId: true },
    });
    if (!inv.length) return;
    await db.invoice.updateMany({ where: { id: { in: inv.map((i) => i.id) } }, data: { familyChargeId: null } });
    for (const id of new Set(inv.map((i) => i.familyChargeId!))) await this.refreshCharge(db, id);
  }

  /** Paga a cobrança consolidada: cada mensalidade em aberto vira paga, com seu lançamento. */
  async payCharge(tenantId: string, familyId: string, chargeId: string, dto: PayInvoiceDto) {
    const c = await this.prisma.familyCharge.findFirst({
      where: { id: chargeId, familyId, tenantId },
      include: { family: { select: { name: true } }, invoices: { include: { student: { select: { name: true } } } } },
    });
    if (!c) throw new NotFoundException('Cobrança não encontrada.');
    if (c.status === 'PAID') throw new BadRequestException('Essa cobrança já está paga.');
    const open = c.invoices.filter((i) => OPEN_STATUS.includes(i.status));
    if (!open.length) throw new BadRequestException('Essa cobrança não tem mensalidades em aberto.');
    const paidAt = dto.paidAt ? dateOnly(dto.paidAt) : today();
    const ref = `${MONTHS[c.month - 1]} ${c.year} · ${c.family.name}`;
    return this.prisma.$transaction(async (tx) => {
      for (const i of open) {
        await tx.invoice.update({ where: { id: i.id }, data: { status: 'PAID', paidAt, paymentMethod: dto.method } });
        await this.paymentTx(tx, tenantId, i.id, i.student.name, ref, num(i.amount), paidAt);
      }
      await tx.familyCharge.update({ where: { id: c.id }, data: { status: 'PAID', paidAt, paymentMethod: dto.method } });
      return { id: c.id, status: 'PAID' as const, paidAt: iso(paidAt), total: money(open.reduce((s, i) => s + num(i.amount), 0)), invoices: open.length };
    });
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
    await this.prisma.familyCharge.updateMany({ where: { tenantId, status: 'PENDING', dueDate: { lt: limit } }, data: { status: 'OVERDUE' } });
    return due.map((d) => ({ id: d.id, student: d.student.name, dueDate: brDate(d.dueDate), amount: num(d.amount) }));
  }
}
