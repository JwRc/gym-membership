import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Post, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma.service';
import { brDate, dateOnly, today } from '../../common/util';
import { beltVisual, nextRank, promotionTitle } from '../../domain/graduation';
import { toRules } from '../../domain/rules-mapper';
import { AcademyQueries } from '../shared/academy.queries';

class PromoteDto {
  @IsString() studentId: string;
  @IsString() disciplineId: string;
  @IsOptional() @IsString() date?: string;
}

@Injectable()
export class GraduationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly q: AcademyQueries,
  ) {}

  async overview(tenantId: string, disciplineId?: string, onlyEligible = false) {
    const [disc, rows] = await Promise.all([this.q.disciplines(tenantId), this.q.studentRows(tenantId)]);
    const active = rows.filter((r) => r.status === 'ACTIVE');
    const graded = [...disc.values()].filter((d) => d.levels.length);
    const tabs = graded.map((d) => ({
      ...this.q.disciplineTag(d),
      eligible: active.filter((s) => s.ranks.some((r) => r.disciplineId === d.id && r.eligible)).length,
    }));
    const byStudents = [...graded].sort((a, b) => count(b.id) - count(a.id));
    function count(id: string) {
      return active.filter((s) => s.ranks.some((r) => r.disciplineId === id)).length;
    }
    const d = disc.get(disciplineId ?? '') ?? byStudents[0];
    if (!d) return { tabs, discipline: null, levels: [], rows: [], eligibleTotal: 0 };

    const rules = toRules(d);
    const inDisc = active
      .map((s) => ({ s, r: s.ranks.find((r) => r.disciplineId === d.id) }))
      .filter((x): x is { s: (typeof active)[number]; r: NonNullable<(typeof x)['r']> } => !!x.r);
    const levels = rules.levels.map((l, i) => ({
      n: i + 1,
      ...beltVisual(rules, l.order, 0),
      order: l.order,
      requirement:
        l.minMonths == null ? 'Graduação máxima' : `${l.minMonths} meses · ${l.minClasses} aulas`,
      count: inDisc.filter((x) => x.r.levelOrder === l.order).length,
    }));
    const list = inDisc
      .filter((x) => !onlyEligible || x.r.eligible)
      .sort((a, b) => Number(b.r.eligible) - Number(a.r.eligible) || (b.r.pct ?? 0) - (a.r.pct ?? 0))
      .map(({ s, r }) => ({
        studentId: s.id,
        name: s.name,
        initials: s.initials,
        belt: r.belt,
        next: r.next,
        time: r.timeInRank,
        classes: r.requirement ? `${r.classesSince}/${r.requirement.classes}` : String(r.classesSince),
        status: r.status,
        pct: r.pct,
        eligible: r.eligible,
        canPromote: !!r.next,
      }));
    const note =
      rules.degreesPerLevel > 0
        ? `Graus: ${rules.degreeMinMonths} meses e ${rules.degreeMinClasses} aulas entre cada um. Faixa nova após ${rules.degreesPerLevel} graus.`
        : 'Tempo e aulas mínimos contados desde a última graduação.';
    return {
      tabs,
      discipline: { ...this.q.disciplineTag(d), system: d.system, instructor: d.instructor?.name ?? null, note },
      levels,
      rows: list,
      eligibleTotal: tabs.reduce((a, t) => a + t.eligible, 0),
    };
  }

  /** Preview do modal "Registrar graduação". */
  async preview(tenantId: string, studentId: string, disciplineId: string) {
    const { d, rank, rules } = await this.load(tenantId, studentId, disciplineId);
    const nx = nextRank(rules, rank);
    const rv = this.q.rankView(d, rank);
    return {
      from: beltVisual(rules, rank.levelOrder, rank.degree),
      to: nx ? beltVisual(rules, nx.levelOrder, nx.degree) : null,
      instructor: d.instructor?.name ?? null,
      date: brDate(today()),
      eligible: rv.eligible,
      info: rv.eligible
        ? `Cumpre os requisitos: ${rv.requirement?.kind === 'level' && rules.degreesPerLevel > 0 ? rv.since + ' na faixa' : rv.timeInRank + ' desde a última graduação'} e ${rank.classesSince} aulas.`
        : `Ainda não cumpre os requisitos (${rv.status.toLowerCase()}). A graduação pode ser registrada mesmo assim.`,
    };
  }

  async promote(tenantId: string, dto: PromoteDto) {
    const { d, rank, rules } = await this.load(tenantId, dto.studentId, dto.disciplineId);
    const nx = nextRank(rules, rank);
    if (!nx) throw new BadRequestException('O aluno já está na graduação máxima.');
    const date = dto.date ? dateOnly(dto.date) : today();
    const changesLevel = nx.levelOrder !== rank.levelOrder;
    await this.prisma.$transaction([
      this.prisma.studentRank.update({
        where: { id: rank.id },
        data: { levelOrder: nx.levelOrder, degree: nx.degree, lastPromotionAt: date, classesSince: 0, ...(changesLevel ? { levelSince: date } : {}) },
      }),
      this.prisma.promotion.create({
        data: {
          studentId: dto.studentId, disciplineId: d.id, levelOrder: nx.levelOrder, degree: nx.degree, date,
          title: promotionTitle(rules, nx.levelOrder, nx.degree), instructorName: d.instructor?.name ?? null,
        },
      }),
    ]);
    return { belt: beltVisual(rules, nx.levelOrder, nx.degree) };
  }

  private async load(tenantId: string, studentId: string, disciplineId: string) {
    const disc = await this.q.disciplines(tenantId);
    const d = disc.get(disciplineId);
    const rank = await this.prisma.studentRank.findFirst({ where: { studentId, disciplineId, student: { tenantId } } });
    if (!d || !rank) throw new NotFoundException('Aluno não está nessa modalidade.');
    return { d, rank, rules: toRules(d) };
  }
}

@Roles('ADMIN')
@Controller('graduation')
export class GraduationController {
  constructor(private readonly svc: GraduationService) {}

  @Get()
  overview(@CurrentUser() u: AuthUser, @Query('disciplineId') disciplineId?: string, @Query('onlyEligible') onlyEligible?: string) {
    return this.svc.overview(u.tenantId, disciplineId, onlyEligible === 'true');
  }

  @Get('preview')
  preview(@CurrentUser() u: AuthUser, @Query('studentId') studentId: string, @Query('disciplineId') disciplineId: string) {
    return this.svc.preview(u.tenantId, studentId, disciplineId);
  }

  @Post('promote')
  promote(@CurrentUser() u: AuthUser, @Body() dto: PromoteDto) {
    return this.svc.promote(u.tenantId, dto);
  }
}

@Module({ controllers: [GraduationController], providers: [GraduationService] })
export class GraduationModule {}
