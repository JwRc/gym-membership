import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma.service';
import { initials } from '../../common/util';
import { findConflicts, slotSummary } from '../../domain/schedule';

const OPEN_MIN = 6 * 60;
const CLOSE_MIN = 22 * 60;

class SlotDto {
  @IsInt() @Min(0) @Max(6) weekday: number;
  @IsInt() @Min(OPEN_MIN) @Max(CLOSE_MIN) startMin: number;
  @IsInt() @Min(OPEN_MIN) @Max(CLOSE_MIN) endMin: number;
}
class CreateClassDto {
  @IsString() @MinLength(2) name: string;
  @IsString() disciplineId: string;
  @IsOptional() @IsString() instructorId?: string;
  @IsInt() @Min(1) capacity: number;
  @IsOptional() @ValidateNested() @Type(() => SlotDto) slot?: SlotDto;
}
class UpdateClassDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() instructorId?: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
}
class EnrollDto {
  @IsString() studentId: string;
}

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  private groups(tenantId: string) {
    return this.prisma.classGroup.findMany({
      where: { tenantId, discipline: { archived: false } },
      include: {
        slots: { orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }] },
        discipline: { select: { id: true, name: true, color: true } },
        instructor: { select: { id: true, name: true } },
        enrollments: { include: { student: { select: { id: true, name: true, status: true } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async list(tenantId: string) {
    const [groups, instructors] = await Promise.all([
      this.groups(tenantId),
      this.prisma.instructor.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    ]);
    return {
      instructors: instructors.map((i) => ({ id: i.id, name: i.name })),
      classes: groups.map((g) => {
        const students = g.enrollments.filter((e) => e.student.status === 'ACTIVE').map((e) => e.student);
        return {
          id: g.id,
          name: g.name,
          discipline: g.discipline,
          instructor: g.instructor,
          capacity: g.capacity,
          count: students.length,
          slots: g.slots.map((s) => ({ id: s.id, weekday: s.weekday, startMin: s.startMin, endMin: s.endMin })),
          ...slotSummary(g.slots),
          students: students.map((s) => ({ id: s.id, name: s.name, initials: initials(s.name) })),
        };
      }),
    };
  }

  async conflicts(tenantId: string, slot: SlotDto, ignoreSlotId?: string) {
    this.checkSlot(slot);
    return findConflicts(await this.groups(tenantId), slot.weekday, slot.startMin, slot.endMin, ignoreSlotId);
  }

  async create(tenantId: string, dto: CreateClassDto) {
    const d = await this.prisma.discipline.findFirst({ where: { id: dto.disciplineId, tenantId } });
    if (!d) throw new BadRequestException('Modalidade inválida.');
    const conflicts = dto.slot ? await this.conflicts(tenantId, dto.slot) : [];
    const g = await this.prisma.classGroup.create({
      data: {
        tenantId, name: dto.name.trim(), disciplineId: d.id, instructorId: dto.instructorId ?? d.instructorId, capacity: dto.capacity,
        ...(dto.slot ? { slots: { create: dto.slot } } : {}),
      },
    });
    return { id: g.id, conflicts };
  }

  async update(tenantId: string, id: string, dto: UpdateClassDto) {
    await this.groupOr404(tenantId, id);
    await this.prisma.classGroup.update({ where: { id }, data: dto });
    return { id };
  }

  async remove(tenantId: string, id: string) {
    await this.groupOr404(tenantId, id);
    await this.prisma.classGroup.delete({ where: { id } });
    return { ok: true };
  }

  async addSlot(tenantId: string, id: string, slot: SlotDto) {
    await this.groupOr404(tenantId, id);
    const conflicts = await this.conflicts(tenantId, slot);
    const s = await this.prisma.classSlot.create({ data: { classGroupId: id, ...slot } });
    return { id: s.id, conflicts };
  }

  async moveSlot(tenantId: string, slotId: string, slot: SlotDto) {
    await this.slotOr404(tenantId, slotId);
    const conflicts = await this.conflicts(tenantId, slot, slotId);
    await this.prisma.classSlot.update({ where: { id: slotId }, data: slot });
    return { id: slotId, conflicts };
  }

  async removeSlot(tenantId: string, slotId: string) {
    await this.slotOr404(tenantId, slotId);
    await this.prisma.classSlot.delete({ where: { id: slotId } });
    return { ok: true };
  }

  async enroll(tenantId: string, id: string, studentId: string) {
    const g = await this.prisma.classGroup.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { enrollments: { where: { student: { status: 'ACTIVE' } } } } } },
    });
    if (!g) throw new NotFoundException('Turma não encontrada.');
    if (g._count.enrollments >= g.capacity) throw new BadRequestException('Turma lotada.');
    const s = await this.prisma.student.findFirst({ where: { id: studentId, tenantId } });
    if (!s) throw new NotFoundException('Aluno não encontrado.');
    await this.prisma.enrollment.upsert({
      where: { studentId_classGroupId: { studentId, classGroupId: id } },
      update: {},
      create: { studentId, classGroupId: id },
    });
    return { ok: true };
  }

  async unenroll(tenantId: string, id: string, studentId: string) {
    await this.groupOr404(tenantId, id);
    await this.prisma.enrollment.deleteMany({ where: { classGroupId: id, studentId } });
    return { ok: true };
  }

  private checkSlot(s: SlotDto) {
    if (s.endMin <= s.startMin) throw new BadRequestException('O horário de término precisa ser depois do início.');
  }
  private async groupOr404(tenantId: string, id: string) {
    const g = await this.prisma.classGroup.findFirst({ where: { id, tenantId } });
    if (!g) throw new NotFoundException('Turma não encontrada.');
    return g;
  }
  private async slotOr404(tenantId: string, slotId: string) {
    const s = await this.prisma.classSlot.findFirst({ where: { id: slotId, classGroup: { tenantId } } });
    if (!s) throw new NotFoundException('Horário não encontrado.');
    return s;
  }
}

@Roles('ADMIN')
@Controller('classes')
export class ClassesController {
  constructor(private readonly svc: ClassesService) {}

  @Get() list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.tenantId);
  }
  @Get('conflicts') conflicts(
    @CurrentUser() u: AuthUser,
    @Query('weekday') weekday: string,
    @Query('startMin') startMin: string,
    @Query('endMin') endMin: string,
    @Query('ignoreSlotId') ignoreSlotId?: string,
  ) {
    return this.svc.conflicts(u.tenantId, { weekday: +weekday, startMin: +startMin, endMin: +endMin }, ignoreSlotId);
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateClassDto) {
    return this.svc.create(u.tenantId, dto);
  }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateClassDto) {
    return this.svc.update(u.tenantId, id, dto);
  }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.tenantId, id);
  }
  @Post(':id/slots') addSlot(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SlotDto) {
    return this.svc.addSlot(u.tenantId, id, dto);
  }
  @Patch('slots/:slotId') moveSlot(@CurrentUser() u: AuthUser, @Param('slotId') slotId: string, @Body() dto: SlotDto) {
    return this.svc.moveSlot(u.tenantId, slotId, dto);
  }
  @Delete('slots/:slotId') removeSlot(@CurrentUser() u: AuthUser, @Param('slotId') slotId: string) {
    return this.svc.removeSlot(u.tenantId, slotId);
  }
  @Post(':id/students') enroll(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: EnrollDto) {
    return this.svc.enroll(u.tenantId, id, dto.studentId);
  }
  @Delete(':id/students/:studentId') unenroll(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.svc.unenroll(u.tenantId, id, studentId);
  }
}

@Module({ controllers: [ClassesController], providers: [ClassesService], exports: [ClassesService] })
export class ClassesModule {}
