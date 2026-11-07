import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, Logger, Module, NotFoundException,
  OnModuleInit, Param, Patch, Post,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Matches, Min, MinLength, ValidateNested } from 'class-validator';
import { Prisma } from '@prisma/client';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma.service';
import { brDate, num } from '../../common/util';
import { CATALOG, CatalogEntry, DISCIPLINE_COLORS } from '../../domain/catalog';

class LevelDto {
  @IsString() @MinLength(1) name: string;
  @Matches(/^#[0-9a-fA-F]{6}$/) color: string;
  @IsOptional() @IsInt() @Min(0) minMonths?: number | null;
  @IsOptional() @IsInt() @Min(0) minClasses?: number | null;
}
class DisciplineDto {
  @IsString() @MinLength(2) name: string;
  @Matches(/^#[0-9a-fA-F]{6}$/) color: string;
  @IsString() system: string;
  @IsOptional() @IsString() instructorId?: string | null;
  @IsNumber() @Min(0) monthlyPrice: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => LevelDto) levels: LevelDto[];
}

function catalogLevels(c: CatalogEntry) {
  return c.levels.map(([name, color, minMonths, minClasses], order) => ({ order, name, color, minMonths, minClasses }));
}
function catalogRules(c: CatalogEntry) {
  return {
    system: c.system,
    degreesPerLevel: c.degreesPerLevel ?? 0,
    lastLevelMaxDegrees: c.lastLevelMaxDegrees ?? 0,
    degreeMinMonths: c.degreeMinMonths ?? null,
    degreeMinClasses: c.degreeMinClasses ?? null,
  };
}

/** Mantém a tabela do catálogo padrão igual ao código (rodado no boot). */
@Injectable()
export class CatalogSync implements OnModuleInit {
  private readonly log = new Logger(CatalogSync.name);
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      for (const c of CATALOG) {
        const data = { name: c.name, color: c.color, ...catalogRules(c) };
        await this.prisma.catalogDiscipline.upsert({ where: { id: c.id }, update: data, create: { id: c.id, ...data } });
        await this.prisma.catalogLevel.deleteMany({ where: { disciplineId: c.id } });
        await this.prisma.catalogLevel.createMany({ data: catalogLevels(c).map((l) => ({ ...l, disciplineId: c.id })) });
      }
    } catch (e) {
      this.log.error(`Falha ao sincronizar catálogo: ${(e as Error).message}`);
    }
  }
}

@Injectable()
export class DisciplinesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const [rows, instructors] = await Promise.all([
      this.prisma.discipline.findMany({
        where: { tenantId, archived: false },
        include: {
          levels: { orderBy: { order: 'asc' } },
          instructor: { select: { id: true, name: true } },
          _count: { select: { ranks: { where: { student: { status: 'ACTIVE' } } } } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.instructor.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    ]);
    const C = new Map(CATALOG.map((c) => [c.id, c]));
    return {
      colors: DISCIPLINE_COLORS,
      instructors: instructors.map((i) => ({ id: i.id, name: i.name })),
      disciplines: rows.map((d) => ({
        id: d.id,
        name: d.name,
        color: d.color,
        system: d.system,
        origin: d.originId ? { id: d.originId, name: C.get(d.originId)?.name ?? d.originId } : null,
        customized: !!d.customizedAt,
        customizedAt: brDate(d.customizedAt),
        degreesPerLevel: d.degreesPerLevel,
        levels: d.levels.map((l) => ({ order: l.order, name: l.name, color: l.color, minMonths: l.minMonths, minClasses: l.minClasses })),
        instructor: d.instructor,
        monthlyPrice: num(d.monthlyPrice),
        students: d._count.ranks,
      })),
      catalog: CATALOG.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        system: c.system,
        levels: catalogLevels(c),
        inUse: rows.filter((d) => d.originId === c.id).map((d) => d.name),
      })),
    };
  }

  async addFromCatalog(tenantId: string, catalogId: string) {
    const c = CATALOG.find((x) => x.id === catalogId);
    if (!c) throw new NotFoundException('Modalidade não existe no catálogo.');
    const firstInstructor = await this.prisma.instructor.findFirst({ where: { tenantId }, orderBy: { name: 'asc' } });
    const d = await this.prisma.discipline.create({
      data: {
        tenantId, originId: c.id, name: c.name, color: c.color, monthlyPrice: c.defaultPrice, instructorId: firstInstructor?.id ?? null,
        ...catalogRules(c),
        levels: { create: catalogLevels(c) },
      },
    });
    return { id: d.id };
  }

  async create(tenantId: string, dto: DisciplineDto) {
    const d = await this.prisma.discipline.create({
      data: {
        tenantId, name: dto.name.trim(), color: dto.color, system: dto.system || 'Sem graduação', monthlyPrice: dto.monthlyPrice,
        instructorId: dto.instructorId || null, customizedAt: new Date(),
        levels: { create: dto.levels.map((l, order) => ({ order, name: l.name, color: l.color, minMonths: l.minMonths ?? null, minClasses: l.minClasses ?? null })) },
      },
    });
    return { id: d.id };
  }

  /** Editar uma modalidade do catálogo cria uma cópia só da academia (customizedAt). */
  async update(tenantId: string, id: string, dto: DisciplineDto) {
    const d = await this.own(tenantId, id);
    await this.assertLevelsKeepStudents(id, dto.levels.length);
    await this.prisma.$transaction(async (tx) => {
      await tx.discipline.update({
        where: { id },
        data: {
          name: dto.name.trim(), color: dto.color, system: dto.system, monthlyPrice: dto.monthlyPrice, instructorId: dto.instructorId || null,
          customizedAt: this.differsFromCatalog(d.originId, dto) ? new Date() : null,
        },
      });
      await this.replaceLevels(tx, id, dto.levels.map((l, order) => ({ order, name: l.name, color: l.color, minMonths: l.minMonths ?? null, minClasses: l.minClasses ?? null })));
    });
    return { id };
  }

  async restore(tenantId: string, id: string) {
    const d = await this.own(tenantId, id);
    const c = CATALOG.find((x) => x.id === d.originId);
    if (!c) throw new BadRequestException('Modalidade própria: não há padrão para restaurar.');
    await this.assertLevelsKeepStudents(id, c.levels.length);
    await this.prisma.$transaction(async (tx) => {
      await tx.discipline.update({ where: { id }, data: { name: c.name, color: c.color, ...catalogRules(c), customizedAt: null } });
      await this.replaceLevels(tx, id, catalogLevels(c));
    });
    return { id };
  }

  async remove(tenantId: string, id: string) {
    await this.own(tenantId, id);
    const n = await this.prisma.studentRank.count({ where: { disciplineId: id, student: { status: 'ACTIVE' } } });
    if (n) throw new ConflictException(`Há ${n} alunos ativos nessa modalidade. Mude-os antes de remover.`);
    await this.prisma.discipline.update({ where: { id }, data: { archived: true } });
    return { ok: true };
  }

  private differsFromCatalog(originId: string | null, dto: DisciplineDto) {
    const c = CATALOG.find((x) => x.id === originId);
    if (!c) return true;
    const lv = catalogLevels(c);
    return (
      dto.name.trim() !== c.name || dto.color.toLowerCase() !== c.color.toLowerCase() || dto.system !== c.system || dto.levels.length !== lv.length ||
      dto.levels.some((l, i) => l.name !== lv[i].name || l.color.toLowerCase() !== lv[i].color.toLowerCase() || (l.minMonths ?? null) !== lv[i].minMonths || (l.minClasses ?? null) !== lv[i].minClasses)
    );
  }

  private async assertLevelsKeepStudents(id: string, levelCount: number) {
    const used = await this.prisma.studentRank.count({ where: { disciplineId: id, levelOrder: { gte: Math.max(levelCount, 0) } } });
    if (used && levelCount > 0) throw new BadRequestException(`${used} aluno(s) estão em níveis que seriam removidos.`);
  }

  private async replaceLevels(tx: Prisma.TransactionClient, id: string, levels: { order: number; name: string; color: string; minMonths: number | null; minClasses: number | null }[]) {
    await tx.disciplineLevel.deleteMany({ where: { disciplineId: id } });
    if (levels.length) await tx.disciplineLevel.createMany({ data: levels.map((l) => ({ ...l, disciplineId: id })) });
  }

  private async own(tenantId: string, id: string) {
    const d = await this.prisma.discipline.findFirst({ where: { id, tenantId, archived: false } });
    if (!d) throw new NotFoundException('Modalidade não encontrada.');
    return d;
  }
}

@Roles('ADMIN')
@Controller('disciplines')
export class DisciplinesController {
  constructor(private readonly svc: DisciplinesService) {}

  @Get() list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.tenantId);
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: DisciplineDto) {
    return this.svc.create(u.tenantId, dto);
  }
  @Post('from-catalog/:catalogId') addFromCatalog(@CurrentUser() u: AuthUser, @Param('catalogId') catalogId: string) {
    return this.svc.addFromCatalog(u.tenantId, catalogId);
  }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: DisciplineDto) {
    return this.svc.update(u.tenantId, id, dto);
  }
  @Post(':id/restore') restore(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.restore(u.tenantId, id);
  }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.tenantId, id);
  }
}

@Module({ controllers: [DisciplinesController], providers: [DisciplinesService, CatalogSync] })
export class DisciplinesModule {}
