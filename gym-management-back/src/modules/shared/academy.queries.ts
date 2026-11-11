import { Global, Injectable, Module, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { diffDays, initials, iso, num, today } from '../../common/util';
import { beltVisual, nextRank } from '../../domain/graduation';
import { DisciplineWithLevels, toRules } from '../../domain/rules-mapper';
import { financeSituation } from '../../domain/invoices';

export type DisciplineFull = DisciplineWithLevels & { instructor: { id: string; name: string } | null };

/** Durações no formato do design: "3 semanas", "8 meses", "2 anos e 3 meses". */
export function duration(days: number): string {
  const m = Math.floor(days / 30.4);
  if (m < 1) {
    const w = Math.max(1, Math.round(days / 7));
    return `${w} ${w > 1 ? 'semanas' : 'semana'}`;
  }
  const y = Math.floor(m / 12);
  const r = m % 12;
  if (!y) return `${m} ${m > 1 ? 'meses' : 'mês'}`;
  return `${y} ${y > 1 ? 'anos' : 'ano'}` + (r ? ` e ${r} ${r > 1 ? 'meses' : 'mês'}` : '');
}

/** Consultas de leitura compartilhadas por vários módulos (lista, painel, graduação, portal). */
@Injectable()
export class AcademyQueries {
  constructor(private readonly prisma: PrismaService) {}

  tenant(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  }

  async disciplines(tenantId: string): Promise<Map<string, DisciplineFull>> {
    const list = await this.prisma.discipline.findMany({
      where: { tenantId, archived: false },
      include: { levels: { orderBy: { order: 'asc' } }, instructor: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    return new Map(list.map((d) => [d.id, d]));
  }

  disciplineTag(d: DisciplineFull) {
    return { id: d.id, name: d.name, color: d.color };
  }

  /**
   * Graduação de um aluno numa modalidade e a próxima graduação possível.
   * Na V1 a graduação é manual (o professor decide): não há cálculo de aptidão
   * por tempo/aulas, porque a presença não é registrada.
   */
  rankView(d: DisciplineFull, r: { levelOrder: number; degree: number; levelSince: Date; lastPromotionAt: Date; classesSince: number }, t = today()) {
    const rules = toRules(d);
    const nx = nextRank(rules, r);
    return {
      discipline: this.disciplineTag(d),
      levelOrder: r.levelOrder,
      degree: r.degree,
      belt: beltVisual(rules, r.levelOrder, r.degree),
      next: nx ? { ...nx, belt: beltVisual(rules, nx.levelOrder, nx.degree) } : null,
      nextLabel: nx ? 'Próxima: ' + beltVisual(rules, nx.levelOrder, nx.degree).label : 'Graduação máxima',
      sinceDays: diffDays(r.levelSince, t),
      since: duration(diffDays(r.levelSince, t)),
      lastPromotionAt: iso(r.lastPromotionAt),
      timeInRank: duration(diffDays(r.lastPromotionAt, t)),
    };
  }

  /** Lista enxuta de alunos com graduação e situação financeira (base da lista e do painel). */
  async studentRows(tenantId: string) {
    const [tenant, disc, students] = await Promise.all([
      this.tenant(tenantId),
      this.disciplines(tenantId),
      this.prisma.student.findMany({
        where: { tenantId },
        include: {
          ranks: true,
          invoices: { where: { status: { in: ['PENDING', 'OVERDUE'] } }, select: { status: true, dueDate: true, amount: true, id: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);
    const t = today();
    return students.map((s) => {
      const ranks = s.ranks.filter((r) => disc.has(r.disciplineId)).map((r) => ({ ...this.rankView(disc.get(r.disciplineId)!, r, t), disciplineId: r.disciplineId }));
      const fin = financeSituation(s.status, s.invoices, t, tenant.lateToleranceDays);
      const age = Math.floor(diffDays(s.birthDate, t) / 365.25);
      return {
        id: s.id,
        name: s.name,
        initials: initials(s.name),
        email: s.email,
        phone: s.phone,
        age,
        birthDate: iso(s.birthDate)!,
        status: s.status,
        finance: fin,
        monthlyFee: num(s.monthlyFee),
        dueDay: s.dueDay,
        disciplines: ranks.map((r) => r.discipline),
        ranks,
        openInvoices: s.invoices.map((i) => ({ id: i.id, dueDate: iso(i.dueDate)!, amount: num(i.amount), status: i.status })),
      };
    });
  }

  async studentOr404(tenantId: string, id: string) {
    const s = await this.prisma.student.findFirst({ where: { id, tenantId } });
    if (!s) throw new NotFoundException('Aluno não encontrado.');
    return s;
  }
}

@Global()
@Module({ providers: [AcademyQueries], exports: [AcademyQueries] })
export class SharedModule {}
