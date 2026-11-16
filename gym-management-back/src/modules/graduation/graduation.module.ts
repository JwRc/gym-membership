import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Can, CurrentUser } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma.service';
import { brDate, dateOnly, iso, today } from '../../common/util';
import { beltVisual, invalidRank, maxDegree, nextRank, promotionTitle } from '../../domain/graduation';
import { toRules } from '../../domain/rules-mapper';
import { AcademyQueries } from '../shared/academy.queries';

class PromoteDto {
  @IsString() studentId: string;
  @IsString() disciplineId: string;
  @IsOptional() @IsString() date?: string;
}

/** Graduação escolhida livremente (qualquer faixa/grau, inclusive para baixo). */
class SetRankDto {
  @IsString() studentId: string;
  @IsString() disciplineId: string;
  @IsInt() @Min(0) levelOrder: number;
  @IsInt() @Min(0) degree: number;
  /** promotion = registra no histórico; correction = só corrige o cadastro */
  @IsIn(['promotion', 'correction']) mode: 'promotion' | 'correction';
  @IsOptional() @IsString() date?: string;
  /** Só na correção: data em que entrou na faixa atual. */
  @IsOptional() @IsString() levelSince?: string;
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
        levelOrder: r.levelOrder,
        degree: r.degree,
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
      current: { levelOrder: rank.levelOrder, degree: rank.degree, levelSince: iso(rank.levelSince) },
      levels: rules.levels.map((l) => ({ order: l.order, maxDegree: maxDegree(rules, l.order), ...beltVisual(rules, l.order, 0) })),
    };
  }

  /** Muda a graduação para qualquer faixa/grau. Na correção, o histórico não muda. */
  async setRank(tenantId: string, dto: SetRankDto) {
    const { d, rank, rules } = await this.load(tenantId, dto.studentId, dto.disciplineId);
    const bad = invalidRank(rules, dto.levelOrder, dto.degree);
    if (bad) throw new BadRequestException(bad);
    const changesLevel = dto.levelOrder !== rank.levelOrder;
    if (dto.mode === 'correction') {
      await this.prisma.studentRank.update({
        where: { id: rank.id },
        data: { levelOrder: dto.levelOrder, degree: dto.degree, ...(dto.levelSince ? { levelSince: dateOnly(dto.levelSince) } : {}) },
      });
    } else {
      const date = dto.date ? dateOnly(dto.date) : today();
      await this.prisma.$transaction([
        this.prisma.studentRank.update({
          where: { id: rank.id },
          data: { levelOrder: dto.levelOrder, degree: dto.degree, lastPromotionAt: date, classesSince: 0, ...(changesLevel ? { levelSince: date } : {}) },
        }),
        this.prisma.promotion.create({
          data: {
            studentId: dto.studentId, disciplineId: d.id, levelOrder: dto.levelOrder, degree: dto.degree, date,
            title: promotionTitle(rules, dto.levelOrder, dto.degree), instructorName: d.instructor?.name ?? null,
          },
        }),
      ]);
    }
    return { belt: beltVisual(rules, dto.levelOrder, dto.degree) };
  }

  /** Apaga um registro do histórico (lançado por engano). A faixa atual não muda. */
  async removeHistory(tenantId: string, promotionId: string) {
    const r = await this.prisma.promotion.deleteMany({ where: { id: promotionId, student: { tenantId } } });
    if (!r.count) throw new NotFoundException('Registro não encontrado.');
    return { ok: true };
  }

  /** Tira o aluno de uma modalidade: graduação, histórico e turmas dela. */
  async removeRank(tenantId: string, studentId: string, disciplineId: string) {
    if (!studentId || !disciplineId) throw new BadRequestException('Informe o aluno e a modalidade.');
    const rank = await this.prisma.studentRank.findFirst({
      where: { studentId, disciplineId, student: { tenantId } },
      include: { student: { select: { status: true, _count: { select: { ranks: true } } } } },
    });
    if (!rank) throw new NotFoundException('Aluno não está nessa modalidade.');
    if (rank.student.status === 'ACTIVE' && rank.student._count.ranks <= 1)
      throw new BadRequestException('O aluno precisa ter pelo menos uma modalidade.');
    await this.prisma.$transaction([
      this.prisma.enrollment.deleteMany({ where: { studentId, classGroup: { disciplineId } } }),
      this.prisma.promotion.deleteMany({ where: { studentId, disciplineId } }),
      this.prisma.studentRank.delete({ where: { id: rank.id } }),
    ]);
    return { ok: true };
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

@Can('graduation.read')
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

  @Can('graduation.write') @Post('promote')
  promote(@CurrentUser() u: AuthUser, @Body() dto: PromoteDto) {
    return this.svc.promote(u.tenantId, dto);
  }

  @Can('graduation.write') @Put('rank')
  setRank(@CurrentUser() u: AuthUser, @Body() dto: SetRankDto) {
    return this.svc.setRank(u.tenantId, dto);
  }

  @Can('graduation.write') @Delete('rank')
  removeRank(@CurrentUser() u: AuthUser, @Query('studentId') studentId: string, @Query('disciplineId') disciplineId: string) {
    return this.svc.removeRank(u.tenantId, studentId, disciplineId);
  }

  @Can('graduation.write') @Delete('history/:id')
  removeHistory(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.removeHistory(u.tenantId, id);
  }
}

@Module({ controllers: [GraduationController], providers: [GraduationService] })
export class GraduationModule {}
