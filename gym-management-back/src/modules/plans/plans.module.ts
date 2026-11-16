import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Can, CurrentUser } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma.service';
import { initials, num, today } from '../../common/util';
import { added, classOutsidePlan, missingDisciplines, planClassTransition } from '../../domain/plans';
import { AcademyQueries, DisciplineFull } from '../shared/academy.queries';
import { addRank, initialLevel } from '../shared/ranks';

class PlanDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) price: number;
  @IsArray() @IsString({ each: true }) disciplineIds: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) classGroupIds?: string[];
}
class UpdatePlanDto extends PlanDto {
  /** Aplica o que foi adicionado (modalidades/turmas) aos alunos que já estão no plano. */
  @IsOptional() @IsBoolean() applyToCurrent?: boolean;
}

type Tx = Prisma.TransactionClient;

interface SyncInput {
  studentId: string;
  /** Turmas pedidas (formulário) ou as atuais. */
  base: string[];
  enrolled: string[];
  oldPlanClasses: string[];
  newPlanClasses: string[];
  disciplineIds: string[];
  disc: Map<string, DisciplineFull>;
  date: Date;
}

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly q: AcademyQueries,
  ) {}

  async list(tenantId: string) {
    const plans = await this.prisma.plan.findMany({
      where: { tenantId },
      include: {
        disciplines: { where: { discipline: { archived: false } }, include: { discipline: { select: { id: true, name: true, color: true } } } },
        classGroups: {
          where: { classGroup: { discipline: { archived: false } } },
          include: { classGroup: { select: { id: true, name: true, discipline: { select: { color: true } } } } },
        },
        students: { where: { anonymizedAt: null }, select: { id: true, name: true, status: true }, orderBy: { name: 'asc' } },
      },
      orderBy: [{ price: 'desc' }, { name: 'asc' }],
    });
    return {
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: num(p.price),
        archived: p.archived,
        disciplines: p.disciplines.map((x) => x.discipline).sort((a, b) => a.name.localeCompare(b.name)),
        classGroups: p.classGroups.map((x) => ({ id: x.classGroup.id, name: x.classGroup.name, color: x.classGroup.discipline.color })).sort((a, b) => a.name.localeCompare(b.name)),
        studentCount: p.students.filter((s) => s.status === 'ACTIVE').length,
        students: p.students.map((s) => ({ id: s.id, name: s.name, initials: initials(s.name), status: s.status })),
      })),
    };
  }

  async create(tenantId: string, dto: PlanDto) {
    const { disciplineIds, classGroupIds } = await this.validate(tenantId, dto);
    const p = await this.prisma.plan.create({
      data: {
        tenantId, name: dto.name.trim(), description: dto.description?.trim() || null, price: dto.price,
        disciplines: { create: disciplineIds.map((disciplineId) => ({ disciplineId })) },
        classGroups: { create: classGroupIds.map((classGroupId) => ({ classGroupId })) },
      },
    });
    return { id: p.id };
  }

  async update(tenantId: string, id: string, dto: UpdatePlanDto) {
    const before = await this.planOr404(tenantId, id);
    const { disciplineIds, classGroupIds } = await this.validate(tenantId, dto);
    const newDisc = added(before.disciplines.map((x) => x.disciplineId), disciplineIds);
    const newClasses = added(before.classGroups.map((x) => x.classGroupId), classGroupIds);
    const disc = dto.applyToCurrent ? await this.q.disciplines(tenantId) : new Map<string, DisciplineFull>();

    return this.prisma.$transaction(
      async (tx) => {
        await tx.plan.update({
          where: { id },
          data: { name: dto.name.trim(), description: dto.description?.trim() || null, price: dto.price },
        });
        await tx.planDiscipline.deleteMany({ where: { planId: id } });
        await tx.planDiscipline.createMany({ data: disciplineIds.map((disciplineId) => ({ planId: id, disciplineId })) });
        await tx.planClassGroup.deleteMany({ where: { planId: id } });
        await tx.planClassGroup.createMany({ data: classGroupIds.map((classGroupId) => ({ planId: id, classGroupId })) });

        let affected = 0;
        const warnings: string[] = [];
        if (dto.applyToCurrent && (newDisc.length || newClasses.length)) {
          const students = await tx.student.findMany({
            where: { planId: id, tenantId, anonymizedAt: null },
            select: { id: true, name: true, enrollments: { select: { classGroupId: true } }, ranks: { select: { disciplineId: true } } },
          });
          for (const s of students) {
            const enrolled = s.enrollments.map((e) => e.classGroupId);
            const r = await this.sync(tx, {
              studentId: s.id, base: enrolled, enrolled, oldPlanClasses: [], newPlanClasses: newClasses,
              disciplineIds: newDisc, disc, date: today(),
            });
            if (r.changed) affected++;
            warnings.push(...r.skipped.map((t) => `${s.name}: turma ${t} lotada`));
          }
        }
        return { id, affected, warnings };
      },
      { timeout: 30_000 },
    );
  }

  async setArchived(tenantId: string, id: string, archived: boolean) {
    await this.planOr404(tenantId, id);
    await this.prisma.plan.update({ where: { id }, data: { archived } });
    return { ok: true };
  }

  async remove(tenantId: string, id: string) {
    await this.planOr404(tenantId, id);
    const students = await this.prisma.student.count({ where: { planId: id, anonymizedAt: null } });
    if (students) throw new ConflictException('O plano tem alunos. Arquive-o em vez de excluir.');
    await this.prisma.plan.delete({ where: { id } });
    return { ok: true };
  }

  /** Plano válido para vincular a um aluno (do tenant e não arquivado). */
  async assignable(tenantId: string, id: string) {
    const p = await this.planOr404(tenantId, id);
    if (p.archived) throw new BadRequestException('Esse plano está arquivado.');
    return p;
  }

  /**
   * Aplica o plano a um aluno dentro da transação do cadastro/edição:
   * matricula nas modalidades que faltam e acerta as turmas. Devolve avisos.
   */
  async applyToStudent(
    tx: Tx,
    o: { studentId: string; planId: string | null; prevPlanId: string | null; base: string[]; enrolled: string[]; disc: Map<string, DisciplineFull>; date: Date },
  ): Promise<string[]> {
    const links = (planId: string | null) =>
      planId
        ? tx.plan.findUniqueOrThrow({ where: { id: planId }, select: { disciplines: { select: { disciplineId: true } }, classGroups: { select: { classGroupId: true } } } })
        : Promise.resolve({ disciplines: [], classGroups: [] });
    const [next, prev] = await Promise.all([links(o.planId), o.prevPlanId !== o.planId ? links(o.prevPlanId) : Promise.resolve({ disciplines: [], classGroups: [] })]);
    const r = await this.sync(tx, {
      studentId: o.studentId, base: o.base, enrolled: o.enrolled,
      oldPlanClasses: prev.classGroups.map((x) => x.classGroupId),
      newPlanClasses: next.classGroups.map((x) => x.classGroupId),
      disciplineIds: next.disciplines.map((x) => x.disciplineId),
      disc: o.disc, date: o.date,
    });
    return r.skipped.map((t) => `Turma ${t} lotada — o aluno não foi incluído.`);
  }

  /** Núcleo comum: modalidades que faltam + turmas (com vaga). */
  private async sync(tx: Tx, i: SyncInput) {
    let changed = false;
    const has = await tx.studentRank.findMany({ where: { studentId: i.studentId }, select: { disciplineId: true } });
    for (const disciplineId of missingDisciplines(has.map((r) => r.disciplineId), i.disciplineIds)) {
      const d = i.disc.get(disciplineId);
      if (!d) continue; // modalidade arquivada
      await addRank(tx, i.studentId, d, initialLevel(d), 0, i.date);
      changed = true;
    }

    const groups = i.newPlanClasses.length
      ? await tx.classGroup.findMany({
          where: { id: { in: i.newPlanClasses } },
          select: { id: true, name: true, capacity: true, _count: { select: { enrollments: { where: { student: { status: 'ACTIVE' } } } } } },
        })
      : [];
    const full = groups.filter((g) => g._count.enrollments >= g.capacity).map((g) => g.id);
    const { finalIds, skippedFull } = planClassTransition({
      base: i.base, enrolled: i.enrolled, oldPlan: i.oldPlanClasses, newPlan: i.newPlanClasses, full,
    });

    const enrolled = new Set(i.enrolled);
    const keep = new Set(finalIds);
    if (i.enrolled.some((id) => !keep.has(id))) {
      await tx.enrollment.deleteMany({ where: { studentId: i.studentId, classGroupId: { notIn: finalIds } } });
      changed = true;
    }
    const toAdd = finalIds.filter((id) => !enrolled.has(id));
    if (toAdd.length) {
      await tx.enrollment.createMany({ data: toAdd.map((classGroupId) => ({ studentId: i.studentId, classGroupId })), skipDuplicates: true });
      changed = true;
    }
    const name = new Map(groups.map((g) => [g.id, g.name]));
    return { changed, skipped: skippedFull.map((id) => name.get(id) ?? id) };
  }

  private async validate(tenantId: string, dto: PlanDto) {
    const disciplineIds = [...new Set(dto.disciplineIds)];
    const classGroupIds = [...new Set(dto.classGroupIds ?? [])];
    const ds = await this.prisma.discipline.count({ where: { id: { in: disciplineIds }, tenantId, archived: false } });
    if (ds !== disciplineIds.length) throw new BadRequestException('Modalidade inválida.');
    const gs = await this.prisma.classGroup.findMany({ where: { id: { in: classGroupIds }, tenantId }, select: { name: true, disciplineId: true } });
    if (gs.length !== classGroupIds.length) throw new BadRequestException('Turma inválida.');
    const outside = classOutsidePlan(disciplineIds, gs);
    if (outside) throw new BadRequestException(`A turma ${outside} não é de uma modalidade do plano.`);
    return { disciplineIds, classGroupIds };
  }

  private async planOr404(tenantId: string, id: string) {
    const p = await this.prisma.plan.findFirst({ where: { id, tenantId }, include: { disciplines: true, classGroups: true } });
    if (!p) throw new NotFoundException('Plano não encontrado.');
    return p;
  }
}

@Can('plans.read')
@Controller('plans')
export class PlansController {
  constructor(private readonly svc: PlansService) {}

  @Get() list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.tenantId);
  }
  @Can('plans.write') @Post() create(@CurrentUser() u: AuthUser, @Body() dto: PlanDto) {
    return this.svc.create(u.tenantId, dto);
  }
  @Can('plans.write') @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.svc.update(u.tenantId, id, dto);
  }
  @Can('plans.write') @Post(':id/archive') archive(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.setArchived(u.tenantId, id, true);
  }
  @Can('plans.write') @Post(':id/restore') restore(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.setArchived(u.tenantId, id, false);
  }
  @Can('plans.write') @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.tenantId, id);
  }
}

@Module({ controllers: [PlansController], providers: [PlansService], exports: [PlansService] })
export class PlansModule {}
