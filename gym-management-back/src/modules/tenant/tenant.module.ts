import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma.service';
import { initials, num } from '../../common/util';

class UpdateTenantDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() cnpj?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) @Min(1, { each: true }) @Max(31, { each: true }) dueDays?: number[];
  @IsOptional() @IsInt() @Min(0) @Max(30) lateToleranceDays?: number;
  @IsOptional() @IsBoolean() autoGenerateInvoices?: boolean;
}
class PlanDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) price: number;
}
class InstructorDto {
  @IsString() @MinLength(3) name: string;
}

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenantId: string) {
    const t = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: {
        plans: { orderBy: { price: 'desc' } },
        instructors: { orderBy: { name: 'asc' } },
        disciplines: {
          where: { archived: false },
          include: { instructor: true, _count: { select: { ranks: { where: { student: { status: 'ACTIVE' } } } } } },
          orderBy: { name: 'asc' },
        },
      },
    });
    return {
      id: t.id, name: t.name, initials: t.initials, code: t.code, cnpj: t.cnpj, phone: t.phone, address: t.address,
      dueDays: t.dueDays, lateToleranceDays: t.lateToleranceDays, autoGenerateInvoices: t.autoGenerateInvoices,
      plans: t.plans.map((p) => ({ id: p.id, name: p.name, description: p.description, price: num(p.price) })),
      instructors: t.instructors.map((i) => ({ id: i.id, name: i.name })),
      disciplines: t.disciplines.map((d) => ({ id: d.id, name: d.name, color: d.color, system: d.system, instructor: d.instructor?.name ?? null, students: d._count.ranks })),
    };
  }

  async update(tenantId: string, dto: UpdateTenantDto) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { ...dto, ...(dto.name ? { initials: initials(dto.name) } : {}), ...(dto.dueDays ? { dueDays: [...new Set(dto.dueDays)].sort((a, b) => a - b) } : {}) },
    });
    return this.get(tenantId);
  }

  async addPlan(tenantId: string, dto: PlanDto) {
    const p = await this.prisma.plan.create({ data: { tenantId, ...dto } });
    return { id: p.id };
  }
  async removePlan(tenantId: string, id: string) {
    const r = await this.prisma.plan.deleteMany({ where: { id, tenantId } });
    if (!r.count) throw new NotFoundException('Plano não encontrado.');
    return { ok: true };
  }
  async addInstructor(tenantId: string, dto: InstructorDto) {
    const i = await this.prisma.instructor.create({ data: { tenantId, name: dto.name.trim() } });
    return { id: i.id };
  }

  /** "Primeiros passos" para academias recém-criadas. */
  async onboarding(tenantId: string) {
    const [t, disc, instr, classes, students] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      this.prisma.discipline.count({ where: { tenantId, archived: false } }),
      this.prisma.instructor.findMany({ where: { tenantId }, select: { name: true } }),
      this.prisma.classGroup.count({ where: { tenantId } }),
      this.prisma.student.count({ where: { tenantId } }),
    ]);
    const steps = [
      { key: 'disciplines', title: 'Escolher as modalidades', sub: `${disc} configuradas · do catálogo padrão ou próprias`, done: disc > 0, action: 'disciplines', btn: 'Gerenciar' },
      { key: 'instructors', title: 'Cadastrar professores', sub: instr.map((i) => i.name).join(', ') || 'Nenhum professor ainda', done: instr.length > 0, action: 'settings', btn: 'Cadastrar' },
      { key: 'classes', title: 'Montar a grade de turmas', sub: 'Horários semanais por modalidade', done: classes > 0, action: 'classes', btn: 'Montar grade' },
      { key: 'students', title: 'Cadastrar alunos', sub: 'Dados, plano e dia de vencimento de cada um', done: students > 0, action: 'students', btn: 'Cadastrar' },
    ];
    return { code: t.code, name: t.name, steps, done: steps.filter((s) => s.done).length, total: steps.length, complete: students > 0 && classes > 0 };
  }
}

@Roles('ADMIN')
@Controller('tenant')
export class TenantController {
  constructor(private readonly svc: TenantService) {}

  @Get() get(@CurrentUser() u: AuthUser) {
    return this.svc.get(u.tenantId);
  }
  @Patch() update(@CurrentUser() u: AuthUser, @Body() dto: UpdateTenantDto) {
    return this.svc.update(u.tenantId, dto);
  }
  @Get('onboarding') onboarding(@CurrentUser() u: AuthUser) {
    return this.svc.onboarding(u.tenantId);
  }
  @Post('plans') addPlan(@CurrentUser() u: AuthUser, @Body() dto: PlanDto) {
    return this.svc.addPlan(u.tenantId, dto);
  }
  @Delete('plans/:id') removePlan(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.removePlan(u.tenantId, id);
  }
  @Post('instructors') addInstructor(@CurrentUser() u: AuthUser, @Body() dto: InstructorDto) {
    return this.svc.addInstructor(u.tenantId, dto);
  }
}

@Module({ controllers: [TenantController], providers: [TenantService] })
export class TenantModule {}
