import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsEnum, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { TxStatus, TxType } from '@prisma/client';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma.service';
import { brDate, dateOnly, diffDays, iso, money, monthRange, num, today } from '../../common/util';
import { FINANCE_CATEGORIES } from '../../domain/catalog';
import { invoiceState } from '../../domain/invoices';
import { AcademyQueries } from '../shared/academy.queries';

class CreateTxDto {
  @IsEnum(TxType) type: TxType;
  @IsString() @MinLength(2) description: string;
  @IsOptional() @IsString() note?: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsString() date: string;
  @IsString() category: string;
  @IsEnum(TxStatus) status: TxStatus;
}
class UpdateTxDto {
  @IsOptional() @IsEnum(TxStatus) status?: TxStatus;
}
class FinanceQuery {
  @IsOptional() @IsString() year?: string;
  @IsOptional() @IsString() month?: string;
  @IsOptional() @IsIn(['all', 'INCOME', 'EXPENSE']) type?: string;
  @IsOptional() @IsString() category?: string;
}

export type RowStatus = 'paid' | 'pending' | 'overdue';
export interface FinanceRow {
  id: string;
  date: string;
  description: string;
  note: string | null;
  category: string;
  type: TxType;
  amount: number;
  status: RowStatus;
  source: 'MANUAL' | 'INVOICE' | 'SALE' | 'INVOICE_GROUP';
  studentId?: string;
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly q: AcademyQueries,
  ) {}

  /** Linhas do mês: lançamentos + mensalidades (agrupadas por vencimento; atrasadas uma a uma). */
  async monthRows(tenantId: string, year: number, month: number): Promise<FinanceRow[]> {
    const tenant = await this.q.tenant(tenantId);
    const range = monthRange(year, month);
    const t = today();
    const [txs, invoices] = await Promise.all([
      this.prisma.transaction.findMany({ where: { tenantId, date: range, source: { not: 'INVOICE' } } }),
      this.prisma.invoice.findMany({
        where: { tenantId, dueDate: range, status: { not: 'EXEMPT' } },
        include: { student: { select: { id: true, name: true } } },
      }),
    ]);
    const rows: FinanceRow[] = txs.map((x) => ({
      id: x.id,
      date: iso(x.date)!,
      description: x.description,
      note: x.note,
      category: x.category,
      type: x.type,
      amount: num(x.amount),
      status: x.status === 'PAID' ? 'paid' : diffDays(x.date, t) > 0 && x.status === 'PENDING' ? 'overdue' : 'pending',
      source: x.source,
    }));

    const groups = new Map<string, { date: string; status: RowStatus; n: number; amount: number }>();
    for (const inv of invoices) {
      const st = invoiceState(inv, t, tenant.lateToleranceDays);
      const date = iso(inv.dueDate)!;
      if (st === 'overdue') {
        rows.push({
          id: inv.id, date, description: `Mensalidade · ${inv.student.name}`, note: `${diffDays(inv.dueDate, t)} dias em atraso`,
          category: 'Mensalidades', type: 'INCOME', amount: num(inv.amount), status: 'overdue', source: 'INVOICE', studentId: inv.student.id,
        });
        continue;
      }
      const status: RowStatus = st === 'paid' ? 'paid' : 'pending';
      const key = `${date}:${status}`;
      const g = groups.get(key) ?? { date, status, n: 0, amount: 0 };
      g.n++;
      g.amount += num(inv.amount);
      groups.set(key, g);
    }
    for (const [key, g] of groups)
      rows.push({
        id: `inv:${key}`, date: g.date, description: `Mensalidades · venc. ${brDate(dateOnly(g.date))!.slice(0, 5)}`,
        note: `${g.n} aluno${g.n > 1 ? 's' : ''}`, category: 'Mensalidades', type: 'INCOME', amount: money(g.amount), status: g.status,
        source: 'INVOICE_GROUP',
      });
    return rows.sort((a, b) => b.date.localeCompare(a.date) || (a.type === 'INCOME' ? -1 : 1));
  }

  summarize(rows: FinanceRow[]) {
    const sum = (f: (r: FinanceRow) => boolean) => money(rows.filter(f).reduce((a, r) => a + r.amount, 0));
    const income = sum((r) => r.type === 'INCOME' && r.status === 'paid');
    const expense = sum((r) => r.type === 'EXPENSE' && r.status === 'paid');
    const incomeOpen = sum((r) => r.type === 'INCOME' && r.status !== 'paid');
    const incomeOverdue = sum((r) => r.type === 'INCOME' && r.status === 'overdue');
    const expenseOpen = sum((r) => r.type === 'EXPENSE' && r.status !== 'paid');
    return {
      income, expense, incomeOpen, incomeOverdue, expenseOpen,
      balance: money(income - expense),
      forecast: money(income + incomeOpen - expense - expenseOpen),
      incomeAll: money(income + incomeOpen),
      expenseAll: money(expense + expenseOpen),
    };
  }

  async overview(tenantId: string, f: FinanceQuery) {
    const t = today();
    const year = Number(f.year) || t.getUTCFullYear();
    const month = Number(f.month) || t.getUTCMonth() + 1;
    const all = await this.monthRows(tenantId, year, month);
    const tISO = iso(t)!;
    const rows = all.filter((r) => (!f.type || f.type === 'all' || r.type === f.type) && (!f.category || f.category === 'Todas' || r.category === f.category));
    const byCat = new Map<string, number>();
    all.filter((r) => r.type === 'EXPENSE').forEach((r) => byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount));
    const catMax = Math.max(1, ...byCat.values());
    return {
      year, month,
      summary: this.summarize(all),
      rows,
      categories: ['Todas', ...FINANCE_CATEGORIES.INCOME, ...FINANCE_CATEGORIES.EXPENSE],
      txCategories: FINANCE_CATEGORIES,
      upcoming: all
        .filter((r) => r.status === 'pending' && r.date >= tISO)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 6),
      expensesByCategory: [...byCat.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([category, amount]) => ({ category, amount: money(amount), pct: amount / catMax })),
    };
  }

  async create(tenantId: string, dto: CreateTxDto) {
    const x = await this.prisma.transaction.create({
      data: { tenantId, ...dto, description: dto.description.trim(), date: dateOnly(dto.date), source: 'MANUAL' },
    });
    return { id: x.id };
  }

  async update(tenantId: string, id: string, dto: UpdateTxDto) {
    const x = await this.prisma.transaction.findFirst({ where: { id, tenantId, source: 'MANUAL' } });
    if (!x) throw new NotFoundException('Lançamento não encontrado.');
    await this.prisma.transaction.update({ where: { id }, data: dto });
    return { id };
  }

  async remove(tenantId: string, id: string) {
    const x = await this.prisma.transaction.findFirst({ where: { id, tenantId, source: 'MANUAL' } });
    if (!x) throw new NotFoundException('Lançamento não encontrado.');
    await this.prisma.transaction.delete({ where: { id } });
    return { ok: true };
  }
}

@Roles('ADMIN')
@Controller('finance')
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  @Get() overview(@CurrentUser() u: AuthUser, @Query() q: FinanceQuery) {
    return this.svc.overview(u.tenantId, q);
  }
  @Post('transactions') create(@CurrentUser() u: AuthUser, @Body() dto: CreateTxDto) {
    return this.svc.create(u.tenantId, dto);
  }
  @Patch('transactions/:id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateTxDto) {
    return this.svc.update(u.tenantId, id, dto);
  }
  @Delete('transactions/:id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.tenantId, id);
  }
}

@Module({ controllers: [FinanceController], providers: [FinanceService], exports: [FinanceService] })
export class FinanceModule {}
