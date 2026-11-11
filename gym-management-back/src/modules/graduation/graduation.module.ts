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

  async overview(tenantId: string, disciplineId?: string) {
    const [disc, rows] = await Promise.all([this.q.disciplines(tenantId), this.q.studentRows(tenantId)]);
    const active = rows.filter((r) => r.status === 'ACTIVE');
    const graded = [...disc.values()].filter((d) => d.levels.length);
    const count = (id: string) => active.filter((s) => s.ranks.some((r) => r.disciplineId === id)).length;
    const tabs = graded.map((d) => ({ ...this.q.disciplineTag(d), students: count(d.id) }));
    const byStudents = [...graded].sort((a, b) => count(b.id) - count(a.id));
    const d = disc.get(disciplineId ?? '') ?? byStudents[0];
    if (!d) return { tabs, discipline: null, levels: [], rows: [] };

    const rules = toRules(d);
    const inDisc = active
      .map((s) => ({ s, r: s.ranks.find((r) => r.disciplineId === d.id) }))
      .filter((x): x is { s: (typeof active)[number]; r: NonNullable<(typeof x)['r']> } => !!x.r);
    const levels = rules.levels.map((l, i) => ({
      n: i + 1,
      ...beltVisual(rules, l.order, 0),
      order: l.order,
      count: inDisc.filter((x) => x.r.levelOrder === l.order).length,
    }));
    const list = inDisc
      // graduação mais alta primeiro; dentro dela, há mais tempo sem graduar
      .sort((a, b) => b.r.levelOrder - a.r.levelOrder || b.r.degree - a.r.degree || (a.r.lastPromotionAt ?? '').localeCompare(b.r.lastPromotionAt ?? ''))
      .map(({ s, r }) => ({
        studentId: s.id,
        name: s.name,
        initials: s.initials,
        belt: r.belt,
        next: r.next?.belt ?? null,
        time: r.timeInRank,
        canPromote: !!r.next,
      }));
    return {
      tabs,
      discipline: { ...this.q.disciplineTag(d), system: d.system, instructor: d.instructor?.name ?? null },
      levels,
      rows: list,
    };
  }

  /** Preview do modal "Registrar graduação": de → para, professor e data. */
  async preview(tenantId: string, studentId: string, disciplineId: string) {
    const { d, rank, rules } = await this.load(tenantId, studentId, disciplineId);
    const nx = nextRank(rules, rank);
    return {
      from: beltVisual(rules, rank.levelOrder, rank.degree),
      to: nx ? beltVisual(rules, nx.levelOrder, nx.degree) : null,
      instructor: d.instructor?.name ?? null,
      date: brDate(today()),
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
  overview(@CurrentUser() u: AuthUser, @Query('disciplineId') disciplineId?: string) {
    return this.svc.overview(u.tenantId, disciplineId);
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
