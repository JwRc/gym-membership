import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post,
} from '@nestjs/common';
import { BillingMode, DiscountKind, DiscountOverride, DiscountValueType, Family, Prisma, Tenant } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Can, CurrentUser } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma.service';
import { MONTHS, PAYMENT_LABEL, diffDays, initials, iso, money, num, today } from '../../common/util';
import { DiscountRule, validateRule } from '../../domain/family-discount';
import { INVOICE_LABEL, financeSituation, invoiceState } from '../../domain/invoices';
import { AcademyQueries } from '../shared/academy.queries';
import { InvoicesService, OPEN_STATUS, familyRule, tenantRule } from '../students/invoices.service';
import { PayInvoiceDto } from '../students/invoices.dto';
import { StudentsModule } from '../students/students.module';

class GuardianDto {
  @IsString() @MinLength(3) name: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() cpf?: string | null;
  @IsOptional() @IsString() relation?: string | null;
  /** o titular também treina: aluno vinculado (entra como membro) */
  @IsOptional() @IsString() studentId?: string | null;
}
class UpdateGuardianDto {
  @IsOptional() @IsString() @MinLength(3) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() cpf?: string | null;
  @IsOptional() @IsString() relation?: string | null;
  @IsOptional() @IsString() studentId?: string | null;
}

class BillingFields {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(BillingMode) billingMode?: BillingMode;
  @IsOptional() @IsInt() @Min(1) @Max(31) dueDay?: number | null;
  @IsOptional() @IsEnum(DiscountOverride) discountOverride?: DiscountOverride;
  @IsOptional() @IsEnum(DiscountKind) discountKind?: DiscountKind | null;
  @IsOptional() @IsEnum(DiscountValueType) discountType?: DiscountValueType | null;
  @IsOptional() @IsNumber() @Min(0) discountValue?: number | null;
}
class CreateFamilyDto extends BillingFields {
  @ValidateNested() @Type(() => GuardianDto) guardian: GuardianDto;
  @IsOptional() @IsArray() @IsString({ each: true }) memberIds?: string[];
}
class UpdateFamilyDto extends BillingFields {
  @IsOptional() @ValidateNested() @Type(() => UpdateGuardianDto) guardian?: UpdateGuardianDto;
}
class MemberDto {
  @IsString() studentId: string;
}

type Tx = Prisma.TransactionClient;

const surname = (name: string) => name.trim().split(/\s+/).slice(-1)[0] ?? '';
const clean = (v: string | null | undefined) => (v == null ? v : v.trim() || null);
const cpfDigits = (v: string | null | undefined) => (v == null ? v : v.replace(/\D/g, '') || null);

@Injectable()
export class FamiliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly q: AcademyQueries,
    private readonly invoices: InvoicesService,
  ) {}

  async list(tenantId: string) {
    const tenant = await this.q.tenant(tenantId);
    const t = today();
    const families = await this.prisma.family.findMany({
      where: { tenantId },
      include: {
        guardian: true,
        members: {
          where: { anonymizedAt: null },
          select: { id: true, name: true, status: true, invoices: { where: { status: { in: OPEN_STATUS } }, select: { status: true, dueDate: true, amount: true } } },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    return families.map((f) => {
      const open = f.members.flatMap((m) => m.invoices);
      return {
        id: f.id,
        name: f.name,
        guardian: { name: f.guardian.name, email: f.guardian.email, phone: f.guardian.phone, trains: !!f.guardian.studentId },
        members: f.members.map((m) => ({ id: m.id, name: m.name, status: m.status })),
        activeMembers: f.members.filter((m) => m.status === 'ACTIVE').length,
        billingMode: f.billingMode,
        dueDay: f.dueDay,
        discountOverride: f.discountOverride,
        rule: familyRule(tenant, f),
        finance: financeSituation('ACTIVE', open, t, tenant.lateToleranceDays),
        openAmount: money(open.reduce((s, i) => s + num(i.amount), 0)),
      };
    });
  }

  async detail(tenantId: string, id: string) {
    const tenant = await this.q.tenant(tenantId);
    const f = await this.familyOr404(tenantId, id);
    const full = await this.prisma.family.findUniqueOrThrow({
      where: { id },
      include: {
        guardian: true,
        members: {
          where: { anonymizedAt: null },
          select: { id: true, name: true, email: true, phone: true, status: true, monthlyFee: true, dueDay: true, birthDate: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    const { rule, amounts } = await this.invoices.familyAmountsOf(this.prisma, tenant, f);
    const byId = new Map(amounts.map((a) => [a.id, a]));
    const t = today();
    const inherited = tenantRule(tenant);
    return {
      id: full.id,
      name: full.name,
      guardian: {
        id: full.guardian.id, name: full.guardian.name, email: full.guardian.email, phone: full.guardian.phone,
        cpf: full.guardian.cpf, relation: full.guardian.relation, studentId: full.guardian.studentId,
      },
      billingMode: full.billingMode,
      dueDay: full.dueDay,
      discountOverride: full.discountOverride,
      customRule: full.discountKind
        ? { kind: full.discountKind, valueType: full.discountType ?? 'PERCENT', value: num(full.discountValue) }
        : null,
      tenantRule: inherited,
      rule,
      /** regra da academia é "total da família", mas a família é separada: fica sem desconto */
      warning:
        full.discountOverride === 'INHERIT' && inherited.kind === 'FAMILY_FIXED' && full.billingMode === 'SEPARATE'
          ? 'O desconto padrão da academia é sobre o total da família e só vale na cobrança consolidada. Esta família fica sem desconto.'
          : null,
      members: full.members.map((m) => {
        const a = byId.get(m.id);
        return {
          id: m.id,
          name: m.name,
          initials: initials(m.name),
          email: m.email,
          phone: m.phone,
          age: Math.floor(diffDays(m.birthDate, t) / 365.25),
          status: m.status,
          dueDay: m.dueDay,
          isGuardian: full.guardian.studentId === m.id,
          monthlyFee: num(m.monthlyFee),
          /** prévia da próxima mensalidade com o desconto atual */
          next: a ? { amount: a.amount, discount: a.discount, exempt: a.exempt, position: a.position, note: a.note } : null,
        };
      }),
      totals: {
        gross: money(amounts.filter((a) => !a.exempt).reduce((s, a) => s + a.gross, 0)),
        discount: money(amounts.reduce((s, a) => s + a.discount, 0)),
        amount: money(amounts.filter((a) => !a.exempt).reduce((s, a) => s + a.amount, 0)),
      },
    };
  }

  async create(tenantId: string, dto: CreateFamilyDto) {
    const tenant = await this.q.tenant(tenantId);
    const billingMode = dto.billingMode ?? 'SEPARATE';
    const fields = this.billingData(tenant, dto, { billingMode, dueDay: null, discountOverride: 'INHERIT', discountKind: null, discountType: null, discountValue: null });
    const g = dto.guardian;
    const memberIds = [...new Set([...(dto.memberIds ?? []), ...(g.studentId ? [g.studentId] : [])])];
    await this.checkMembers(tenantId, memberIds, null);
    return this.conflicts(() =>
      this.prisma.$transaction(async (tx) => {
        const guardian = await tx.guardian.create({
          data: {
            tenantId, name: g.name.trim(), email: g.email.trim().toLowerCase(), phone: clean(g.phone) ?? null,
            cpf: cpfDigits(g.cpf) ?? null, relation: clean(g.relation) ?? null, studentId: g.studentId || null,
          },
        });
        const family = await tx.family.create({
          data: { tenantId, guardianId: guardian.id, name: clean(dto.name) || `Família ${surname(g.name)}`, ...fields },
        });
        if (memberIds.length) await tx.student.updateMany({ where: { id: { in: memberIds }, tenantId }, data: { familyId: family.id } });
        return { id: family.id };
      }),
    );
  }

  async update(tenantId: string, id: string, dto: UpdateFamilyDto) {
    const tenant = await this.q.tenant(tenantId);
    const f = await this.familyOr404(tenantId, id);
    const fields = this.billingData(tenant, dto, f);
    const g = dto.guardian;
    if (g?.studentId) await this.checkMembers(tenantId, [g.studentId], id);
    return this.conflicts(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.family.update({ where: { id }, data: { ...fields, ...(dto.name !== undefined ? { name: clean(dto.name) || f.name } : {}) } });
        if (g) {
          await tx.guardian.update({
            where: { id: f.guardianId },
            data: {
              ...(g.name ? { name: g.name.trim() } : {}),
              ...(g.email ? { email: g.email.trim().toLowerCase() } : {}),
              ...(g.phone !== undefined ? { phone: clean(g.phone) } : {}),
              ...(g.cpf !== undefined ? { cpf: cpfDigits(g.cpf) } : {}),
              ...(g.relation !== undefined ? { relation: clean(g.relation) } : {}),
              ...(g.studentId !== undefined ? { studentId: g.studentId || null } : {}),
            },
          });
          if (g.studentId) await tx.student.update({ where: { id: g.studentId }, data: { familyId: id } });
        }
        // trocou para separada: as mensalidades em aberto saem da cobrança e seguem avulsas
        if (f.billingMode === 'CONSOLIDATED' && fields.billingMode === 'SEPARATE') await this.invoices.detachOpen(tx, { familyCharge: { familyId: id } });
        return { id };
      }),
    );
  }

  /** Desfaz a família: membros voltam a ser avulsos; histórico pago fica nas mensalidades. */
  async remove(tenantId: string, id: string) {
    const f = await this.familyOr404(tenantId, id);
    const members = await this.prisma.student.findMany({ where: { familyId: id, anonymizedAt: null }, select: { name: true, email: true } });
    const noEmail = members.filter((m) => !m.email);
    if (noEmail.length)
      throw new BadRequestException(`Informe o e-mail de ${noEmail.map((m) => m.name).join(', ')} antes de desfazer a família.`);
    await this.prisma.$transaction(async (tx) => {
      await this.invoices.detachOpen(tx, { familyCharge: { familyId: id } });
      await tx.student.updateMany({ where: { familyId: id }, data: { familyId: null } });
      await tx.guardian.delete({ where: { id: f.guardianId } }); // apaga a família e as cobranças junto
    });
    return { ok: true };
  }

  /** Novo membro: o desconto vale a partir da próxima mensalidade gerada. */
  async addMember(tenantId: string, id: string, dto: MemberDto) {
    await this.familyOr404(tenantId, id);
    await this.checkMembers(tenantId, [dto.studentId], id);
    await this.prisma.student.update({ where: { id: dto.studentId }, data: { familyId: id } });
    return { ok: true };
  }

  async removeMember(tenantId: string, id: string, studentId: string) {
    const f = await this.familyOr404(tenantId, id);
    const s = await this.prisma.student.findFirst({ where: { id: studentId, tenantId, familyId: id }, select: { email: true, name: true } });
    if (!s) throw new NotFoundException('Esse aluno não é membro da família.');
    const guardian = await this.prisma.guardian.findUniqueOrThrow({ where: { id: f.guardianId } });
    if (guardian.studentId === studentId) throw new BadRequestException('Esse aluno é o titular. Troque o titular antes de tirá-lo da família.');
    if (!s.email) throw new BadRequestException(`Informe o e-mail de ${s.name} antes de tirá-lo da família.`);
    await this.prisma.$transaction(async (tx) => {
      await this.invoices.detachOpen(tx, { studentId });
      await tx.student.update({ where: { id: studentId }, data: { familyId: null } });
    });
    return { ok: true };
  }

  /** Financeiro da família: cobranças consolidadas e mensalidades avulsas dos membros. */
  async finance(tenantId: string, id: string) {
    const tenant = await this.q.tenant(tenantId);
    await this.familyOr404(tenantId, id);
    const t = today();
    const tol = tenant.lateToleranceDays;
    const year = t.getUTCFullYear();
    const [charges, loose] = await Promise.all([
      this.prisma.familyCharge.findMany({
        where: { familyId: id },
        include: { invoices: { include: { student: { select: { id: true, name: true } } }, orderBy: { student: { name: 'asc' } } } },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      }),
      this.prisma.invoice.findMany({
        where: { student: { familyId: id }, familyChargeId: null },
        include: { student: { select: { id: true, name: true } } },
        orderBy: [{ dueDate: 'desc' }],
        take: 120,
      }),
    ]);
    const label = (state: ReturnType<typeof invoiceState>, due: Date) => (state === 'overdue' ? `Atrasado · ${diffDays(due, t)} dias` : INVOICE_LABEL[state]);
    const invRow = (i: (typeof loose)[number]) => {
      const state = invoiceState(i, t, tol);
      return {
        id: i.id,
        ref: `${MONTHS[i.month - 1]} ${i.year}`,
        student: i.student,
        dueDate: iso(i.dueDate),
        amount: num(i.amount),
        discount: num(i.discount),
        gross: money(num(i.amount) + num(i.discount)),
        discountNote: i.discountNote,
        paidAt: iso(i.paidAt),
        method: i.paymentMethod ? PAYMENT_LABEL[i.paymentMethod] : null,
        state,
        label: label(state, i.dueDate),
        canPay: ['overdue', 'grace', 'today', 'upcoming'].includes(state),
      };
    };
    const chargeRows = charges.map((c) => {
      const state = invoiceState(c, t, tol);
      const total = c.invoices.reduce((s, i) => s + num(i.amount), 0);
      return {
        id: c.id,
        ref: `${MONTHS[c.month - 1]} ${c.year}`,
        year: c.year,
        month: c.month,
        dueDate: iso(c.dueDate),
        total: money(total),
        discount: money(c.invoices.reduce((s, i) => s + num(i.discount), 0)),
        paidAt: iso(c.paidAt),
        method: c.paymentMethod ? PAYMENT_LABEL[c.paymentMethod] : null,
        state,
        label: label(state, c.dueDate),
        canPay: ['overdue', 'grace', 'today', 'upcoming'].includes(state),
        invoices: c.invoices.map(invRow),
      };
    });
    const looseRows = loose.map(invRow);
    const allInv = [...chargeRows.flatMap((c) => c.invoices), ...looseRows];
    const open = allInv.filter((r) => ['overdue', 'grace', 'today'].includes(r.state));
    const paidYear = allInv.filter((r) => r.state === 'paid' && r.paidAt?.startsWith(String(year)));
    return {
      summary: {
        open: money(open.reduce((s, r) => s + r.amount, 0)),
        openCount: open.length,
        paidYear: money(paidYear.reduce((s, r) => s + r.amount, 0)),
        discountYear: money(allInv.filter((r) => r.dueDate?.startsWith(String(year))).reduce((s, r) => s + r.discount, 0)),
      },
      charges: chargeRows,
      invoices: looseRows,
    };
  }

  payCharge(tenantId: string, id: string, chargeId: string, dto: PayInvoiceDto) {
    return this.invoices.payCharge(tenantId, id, chargeId, dto);
  }

  // ─── apoio ───

  private async familyOr404(tenantId: string, id: string) {
    const f = await this.prisma.family.findFirst({ where: { id, tenantId } });
    if (!f) throw new NotFoundException('Família não encontrada.');
    return f;
  }

  /** Campos de cobrança/desconto validados, mesclando com os atuais. */
  private billingData(tenant: Tenant, dto: BillingFields, cur: Pick<Family, 'billingMode' | 'dueDay' | 'discountOverride' | 'discountKind' | 'discountType' | 'discountValue'>) {
    const billingMode = dto.billingMode ?? cur.billingMode;
    const dueDay = dto.dueDay !== undefined ? dto.dueDay : cur.dueDay;
    if (billingMode === 'CONSOLIDATED') {
      if (!dueDay) throw new BadRequestException('Informe o dia de vencimento da cobrança da família.');
      if (!tenant.dueDays.includes(dueDay)) throw new BadRequestException('Dia de vencimento não está entre os da academia.');
    }
    const discountOverride = dto.discountOverride ?? cur.discountOverride;
    let rule: { discountKind: DiscountKind | null; discountType: DiscountValueType | null; discountValue: number | null } = {
      discountKind: null, discountType: null, discountValue: null,
    };
    if (discountOverride === 'CUSTOM') {
      const r: DiscountRule = {
        kind: (dto.discountKind !== undefined ? dto.discountKind : cur.discountKind) ?? 'NONE',
        valueType: (dto.discountType !== undefined ? dto.discountType : cur.discountType) ?? 'PERCENT',
        value: dto.discountValue != null ? dto.discountValue : num(cur.discountValue),
      };
      if (r.kind === 'NONE') throw new BadRequestException('Escolha o tipo do desconto personalizado.');
      const err = validateRule(r, billingMode);
      if (err) throw new BadRequestException(err);
      rule = { discountKind: r.kind, discountType: r.valueType, discountValue: r.value };
    }
    return { billingMode, dueDay: billingMode === 'CONSOLIDATED' ? dueDay : (dueDay ?? null), discountOverride, ...rule };
  }

  /** Alunos da academia, não anonimizados e sem outra família. */
  private async checkMembers(tenantId: string, ids: string[], familyId: string | null) {
    if (!ids.length) return;
    const found = await this.prisma.student.findMany({ where: { id: { in: ids }, tenantId, anonymizedAt: null }, select: { id: true, name: true, familyId: true } });
    if (found.length !== ids.length) throw new BadRequestException('Aluno inválido.');
    const other = found.find((s) => s.familyId && s.familyId !== familyId);
    if (other) throw new BadRequestException(`${other.name} já faz parte de outra família.`);
  }

  private async conflicts<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = String((e.meta?.target as string[] | string | undefined) ?? '');
        if (target.includes('cpf')) throw new ConflictException('Já existe um titular com esse CPF.');
        if (target.includes('studentId')) throw new ConflictException('Esse aluno já é titular de outra família.');
        throw new ConflictException('Já existe um titular com esse e-mail.');
      }
      throw e;
    }
  }
}

@Can('families.read')
@Controller('families')
export class FamiliesController {
  constructor(private readonly svc: FamiliesService) {}

  @Get() list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.tenantId);
  }
  @Can('families.write') @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateFamilyDto) {
    return this.svc.create(u.tenantId, dto);
  }
  @Get(':id') detail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.detail(u.tenantId, id);
  }
  @Can('families.write') @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateFamilyDto) {
    return this.svc.update(u.tenantId, id, dto);
  }
  @Can('families.write') @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.tenantId, id);
  }
  @Can('families.write') @Post(':id/members') addMember(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: MemberDto) {
    return this.svc.addMember(u.tenantId, id, dto);
  }
  @Can('families.write') @Delete(':id/members/:studentId') removeMember(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.svc.removeMember(u.tenantId, id, studentId);
  }
  @Get(':id/finance') finance(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.finance(u.tenantId, id);
  }
  @Can('invoices.write') @Post(':id/charges/:chargeId/pay') @HttpCode(200)
  payCharge(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('chargeId') chargeId: string, @Body() dto: PayInvoiceDto) {
    return this.svc.payCharge(u.tenantId, id, chargeId, dto);
  }
}

@Module({ imports: [StudentsModule], controllers: [FamiliesController], providers: [FamiliesService] })
export class FamiliesModule {}
