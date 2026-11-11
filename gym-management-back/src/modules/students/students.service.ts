import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit/audit.module';
import { AuthUser } from '../../common/auth/auth.types';
import { CacheService } from '../../common/redis/redis.module';
import { brDate, dateOnly, diffDays, initials, iso, num, today, ymd } from '../../common/util';
import { promotionTitle } from '../../domain/graduation';
import { toRules } from '../../domain/rules-mapper';
import { slotSummary } from '../../domain/schedule';
import { AcademyQueries, duration } from '../shared/academy.queries';
import { InvoicesService } from './invoices.service';
import { CreateStudentDto, ListStudentsQuery, UpdateStudentDto } from './students.dto';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly q: AcademyQueries,
    private readonly cache: CacheService,
    private readonly invoices: InvoicesService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, f: ListStudentsQuery) {
    const all = await this.cache.getOrSet(tenantId, 'students:rows', 120, () => this.q.studentRows(tenantId));
    const status = f.status ?? 'ACTIVE';
    const counts = { ACTIVE: 0, INACTIVE: 0, LOCKED: 0, all: all.length };
    all.forEach((s) => counts[s.status]++);

    const q = f.q ? norm(f.q.trim()) : '';
    const digits = f.q?.replace(/\D/g, '') ?? '';
    const rows = all.filter((s) => {
      if (status !== 'all' && s.status !== status) return false;
      if (f.disciplineId && f.disciplineId !== 'all' && !s.disciplines.some((d) => d.id === f.disciplineId)) return false;
      if (f.finance && f.finance !== 'all') {
        if (f.finance === 'ok' && s.finance.key !== 'ok') return false;
        if (f.finance === 'today' && s.finance.key !== 'today') return false;
        if (f.finance === 'late' && s.finance.key !== 'late') return false;
      }
      if (q && !norm(s.name).includes(q) && !(digits.length >= 3 && (s.phone ?? '').replace(/\D/g, '').includes(digits))) return false;
      return true;
    });
    return { counts, total: all.length, rows: rows.map(({ openInvoices: _o, ...r }) => r) };
  }

  async detail(tenantId: string, id: string) {
    const disc = await this.q.disciplines(tenantId);
    const s = await this.prisma.student.findFirst({
      where: { id, tenantId, anonymizedAt: null },
      include: {
        plan: true,
        user: { select: { id: true } },
        ranks: true,
        promotions: { orderBy: { date: 'desc' } },
        enrollments: { include: { classGroup: { include: { slots: true, instructor: true, discipline: true } } } },
      },
    });
    if (!s) throw new NotFoundException('Aluno não encontrado.');
    const t = today();
    const row = (await this.q.studentRows(tenantId)).find((r) => r.id === id)!;
    const fin = await this.invoices.forStudent(tenantId, id);

    return {
      id: s.id,
      name: s.name,
      initials: initials(s.name),
      gender: s.gender,
      status: s.status,
      finance: row.finance,
      email: s.email,
      phone: s.phone,
      birthDate: iso(s.birthDate),
      age: Math.floor(diffDays(s.birthDate, t) / 365.25),
      startDate: iso(s.startDate),
      since: duration(diffDays(s.startDate, t)),
      monthlyFee: num(s.monthlyFee),
      dueDay: s.dueDay,
      plan: s.plan ? { id: s.plan.id, name: s.plan.name } : null,
      hasAccess: !!s.user,
      medicalNotes: s.medicalNotes,
      consentAt: s.consentAt?.toISOString() ?? null,
      guardian: s.guardianName ? { name: s.guardianName, relation: s.guardianRelation, phone: s.guardianPhone } : null,
      ranks: s.ranks
        .filter((r) => disc.has(r.disciplineId))
        .map((r) => {
          const d = disc.get(r.disciplineId)!;
          return {
            ...this.q.rankView(d, r, t),
            history: s.promotions
              .filter((p) => p.disciplineId === r.disciplineId)
              .map((p) => ({
                title: p.title,
                date: brDate(p.date),
                color: d.levels.find((l) => l.order === p.levelOrder)?.color ?? '#888',
                instructor: p.instructorName,
              })),
          };
        }),
      classes: s.enrollments.map((e) => ({
        id: e.classGroup.id,
        name: e.classGroup.name,
        color: e.classGroup.discipline.color,
        instructor: e.classGroup.instructor?.name ?? null,
        ...slotSummary(e.classGroup.slots),
      })),
      invoices: fin,
    };
  }

  async create(tenantId: string, dto: CreateStudentDto) {
    const disc = await this.q.disciplines(tenantId);
    if (!dto.ranks.length) throw new BadRequestException('Escolha pelo menos uma modalidade.');
    for (const r of dto.ranks) {
      const d = disc.get(r.disciplineId);
      if (!d) throw new BadRequestException('Modalidade inválida.');
      if (d.levels.length && !d.levels.some((l) => l.order === r.levelOrder)) throw new BadRequestException(`Nível inválido em ${d.name}.`);
    }
    const start = dto.startDate ? dateOnly(dto.startDate) : today();
    const email = dto.email.trim().toLowerCase();
    try {
      const s = await this.prisma.$transaction(async (tx) => {
        const s = await tx.student.create({
          data: {
            tenantId, name: dto.name.trim(), gender: dto.gender, birthDate: dateOnly(dto.birthDate), email, phone: dto.phone,
            monthlyFee: dto.monthlyFee, dueDay: dto.dueDay, startDate: start, planId: dto.planId || null,
            medicalNotes: dto.medicalNotes || null, guardianName: dto.guardianName || null,
            guardianRelation: dto.guardianRelation || null, guardianPhone: dto.guardianPhone || null,
            consentAt: new Date(),
          },
        });
        for (const r of dto.ranks) await this.addRank(tx, s.id, disc.get(r.disciplineId)!, r.levelOrder, r.degree ?? 0, start);
        if (dto.classGroupIds?.length)
          await tx.enrollment.createMany({ data: dto.classGroupIds.map((classGroupId) => ({ studentId: s.id, classGroupId })), skipDuplicates: true });
        return s;
      });
      // Primeira mensalidade: mês corrente, nunca com vencimento no passado.
      const t = today();
      const due = ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, dto.dueDay);
      await this.prisma.invoice.create({
        data: {
          tenantId, studentId: s.id, year: t.getUTCFullYear(), month: t.getUTCMonth() + 1,
          dueDate: due < t ? t : due, amount: dto.monthlyFee,
        },
      });
      return { id: s.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Já existe um aluno com esse e-mail.');
      throw e;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateStudentDto) {
    await this.q.studentOr404(tenantId, id);
    const disc = await this.q.disciplines(tenantId);
    const current = await this.prisma.student.findUniqueOrThrow({ where: { id }, select: { consentAt: true } });
    const { classGroupIds, addRanks, birthDate, email, planId, consent, ...rest } = dto;
    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id },
        data: {
          ...rest,
          ...(birthDate ? { birthDate: dateOnly(birthDate) } : {}),
          ...(email ? { email: email.trim().toLowerCase() } : {}),
          ...(planId !== undefined ? { planId: planId || null } : {}),
          // mantém a data original do consentimento; desmarcar registra a revogação
          ...(consent === true && !current.consentAt ? { consentAt: new Date() } : {}),
          ...(consent === false ? { consentAt: null } : {}),
        },
      });
      if (classGroupIds) {
        await tx.enrollment.deleteMany({ where: { studentId: id, classGroupId: { notIn: classGroupIds } } });
        await tx.enrollment.createMany({ data: classGroupIds.map((classGroupId) => ({ studentId: id, classGroupId })), skipDuplicates: true });
      }
      for (const r of addRanks ?? []) {
        const d = disc.get(r.disciplineId);
        if (!d) throw new BadRequestException('Modalidade inválida.');
        const has = await tx.studentRank.findUnique({ where: { studentId_disciplineId: { studentId: id, disciplineId: d.id } } });
        if (!has) await this.addRank(tx, id, d, r.levelOrder, r.degree ?? 0, today());
      }
    });
    return { id };
  }

  /** LGPD: todos os dados do aluno, para entregar a ele (portabilidade/acesso). */
  async exportData(user: AuthUser, id: string) {
    const s = await this.prisma.student.findFirst({
      where: { id, tenantId: user.tenantId, anonymizedAt: null },
      include: {
        tenant: { select: { name: true, cnpj: true } },
        plan: true,
        ranks: { include: { discipline: { select: { name: true } } } },
        promotions: { include: { discipline: { select: { name: true } } }, orderBy: { date: 'asc' } },
        enrollments: { include: { classGroup: { select: { name: true } } } },
        invoices: { orderBy: [{ year: 'asc' }, { month: 'asc' }] },
        sales: { include: { items: { include: { product: { select: { name: true } } } } }, orderBy: { date: 'asc' } },
        user: { select: { email: true, createdAt: true } },
      },
    });
    if (!s) throw new NotFoundException('Aluno não encontrado.');
    await this.audit.record({ tenantId: user.tenantId, userId: user.sub, action: 'students.export', entity: 'students', entityId: id });
    return {
      exportadoEm: new Date().toISOString(),
      controlador: { academia: s.tenant.name, cnpj: s.tenant.cnpj },
      aluno: {
        nome: s.name, sexo: s.gender, dataNascimento: iso(s.birthDate), email: s.email, telefone: s.phone,
        situacao: s.status, dataInicio: iso(s.startDate), plano: s.plan?.name ?? null, mensalidade: num(s.monthlyFee), diaVencimento: s.dueDay,
        observacoesMedicas: s.medicalNotes,
        responsavel: s.guardianName ? { nome: s.guardianName, parentesco: s.guardianRelation, telefone: s.guardianPhone } : null,
        consentimentoEm: s.consentAt?.toISOString() ?? null,
        cadastradoEm: s.createdAt.toISOString(),
        acessoAoSistema: s.user ? { email: s.user.email, criadoEm: s.user.createdAt.toISOString() } : null,
      },
      graduacoes: s.ranks.map((r) => ({ modalidade: r.discipline.name, nivel: r.levelOrder, grau: r.degree, desde: iso(r.levelSince) })),
      historicoGraduacoes: s.promotions.map((p) => ({ modalidade: p.discipline.name, titulo: p.title, data: iso(p.date), professor: p.instructorName })),
      turmas: s.enrollments.map((e) => e.classGroup.name),
      mensalidades: s.invoices.map((i) => ({ referencia: `${String(i.month).padStart(2, '0')}/${i.year}`, vencimento: iso(i.dueDate), valor: num(i.amount), situacao: i.status, pagaEm: iso(i.paidAt), formaPagamento: i.paymentMethod })),
      compras: s.sales.map((v) => ({ numero: v.number, data: iso(v.date), formaPagamento: v.paymentMethod, itens: v.items.map((it) => ({ produto: it.product.name, quantidade: it.qty, valorUnitario: num(it.unitPrice) })) })),
    };
  }

  /**
   * LGPD: apaga os dados pessoais a pedido do titular. Mensalidades pagas e
   * vendas ficam (registros financeiros), sem identificação. Mensalidades em
   * aberto, que não movimentaram dinheiro, são excluídas.
   */
  async anonymize(user: AuthUser, id: string) {
    const s = await this.prisma.student.findFirst({ where: { id, tenantId: user.tenantId, anonymizedAt: null }, select: { id: true } });
    if (!s) throw new NotFoundException('Aluno não encontrado.');
    const removed = 'Aluno removido';
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id },
        data: {
          name: removed, email: `removido-${id}@anon.invalid`, phone: null, gender: null, birthDate: dateOnly('1900-01-01'),
          medicalNotes: null, guardianName: null, guardianRelation: null, guardianPhone: null,
          status: 'INACTIVE', consentAt: null, anonymizedAt: new Date(), planId: null,
        },
      });
      await tx.user.deleteMany({ where: { studentId: id } });
      await tx.enrollment.deleteMany({ where: { studentId: id } });
      const open = await tx.invoice.deleteMany({ where: { studentId: id, status: { in: ['PENDING', 'OVERDUE'] }, transaction: null } });
      // lançamentos de mensalidade levam o nome do aluno na descrição
      await tx.transaction.updateMany({ where: { invoice: { studentId: id } }, data: { description: `Mensalidade · ${removed}` } });
      return { openInvoicesRemoved: open.count };
    });
    await this.audit.record({ tenantId: user.tenantId, userId: user.sub, action: 'students.anonymize', entity: 'students', entityId: id, meta: result });
    return { ok: true, ...result };
  }

  private async addRank(tx: Prisma.TransactionClient, studentId: string, d: Parameters<typeof toRules>[0], levelOrder: number, degree: number, date: Date) {
    await tx.studentRank.create({ data: { studentId, disciplineId: d.id, levelOrder, degree, levelSince: date, lastPromotionAt: date } });
    if (d.levels.length)
      await tx.promotion.create({
        data: { studentId, disciplineId: d.id, levelOrder, degree, date, title: promotionTitle(toRules(d), levelOrder, degree, true) },
      });
  }
}
