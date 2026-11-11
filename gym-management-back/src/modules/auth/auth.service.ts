import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.service';
import { AuthUser } from '../../common/auth/auth.types';
import { initials } from '../../common/util';
import { CATALOG } from '../../domain/catalog';
import { LoginDto, RegisterAcademyDto, RegisterStudentDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash)))
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    return this.session(user);
  }

  async tenantByCode(code: string) {
    const t = await this.prisma.tenant.findUnique({ where: { code: code.trim().toUpperCase() }, select: { name: true } });
    if (!t) throw new NotFoundException('Código não encontrado.');
    return t;
  }

  async registerAcademy(dto: RegisterAcademyDto) {
    const email = dto.email.trim().toLowerCase();
    await this.ensureEmailFree(email);
    const picks = CATALOG.filter((c) => dto.disciplines.includes(c.id));
    if (!picks.length) throw new BadRequestException('Escolha pelo menos uma modalidade.');

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.academyName.trim(), initials: initials(dto.academyName), code: await this.newCode(tx, dto.academyName) },
      });
      const instructor = await tx.instructor.create({ data: { tenantId: tenant.id, name: dto.name.trim() } });
      for (const c of picks) {
        await tx.discipline.create({
          data: {
            tenantId: tenant.id,
            originId: c.id,
            name: c.name,
            color: c.color,
            system: c.system,
            degreesPerLevel: c.degreesPerLevel ?? 0,
            lastLevelMaxDegrees: c.lastLevelMaxDegrees ?? 0,
            degreeMinMonths: c.degreeMinMonths ?? null,
            degreeMinClasses: c.degreeMinClasses ?? null,
            monthlyPrice: c.defaultPrice,
            instructorId: instructor.id,
            levels: { create: c.levels.map(([name, color, minMonths, minClasses], order) => ({ order, name, color, minMonths, minClasses })) },
          },
        });
      }
      return tx.user.create({
        data: { tenantId: tenant.id, email, name: dto.name.trim(), role: 'ADMIN', passwordHash: await bcrypt.hash(dto.password, 10) },
      });
    });
    return this.session(user);
  }

  async registerStudent(dto: RegisterStudentDto) {
    const email = dto.email.trim().toLowerCase();
    const tenant = await this.prisma.tenant.findUnique({ where: { code: dto.code.trim().toUpperCase() } });
    if (!tenant) throw new BadRequestException('Código da academia não encontrado.');
    await this.ensureEmailFree(email);
    const student = await this.prisma.student.findFirst({
      where: { tenantId: tenant.id, email: { equals: email, mode: 'insensitive' } },
      include: { user: true },
    });
    if (!student)
      throw new BadRequestException(`Não encontramos uma matrícula com esse e-mail na ${tenant.name}. Use o e-mail que a recepção cadastrou.`);
    if (student.user) throw new ConflictException('Essa matrícula já tem acesso. Use "Entrar".');

    const user = await this.prisma.user.create({
      data: { tenantId: tenant.id, email, name: student.name, role: 'STUDENT', studentId: student.id, passwordHash: await bcrypt.hash(dto.password, 10) },
    });
    return this.session(user);
  }

  async me(u: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: u.sub } });
    if (!user) throw new UnauthorizedException();
    return this.profile(user);
  }

  private async session(user: User) {
    const payload: AuthUser = { sub: user.id, tenantId: user.tenantId, role: user.role, studentId: user.studentId, name: user.name };
    return { token: await this.jwt.signAsync(payload), user: await this.profile(user) };
  }

  private async profile(user: User) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      include: { disciplines: { where: { archived: false }, select: { name: true }, orderBy: { name: 'asc' } } },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      studentId: user.studentId,
      tenant: { id: tenant.id, name: tenant.name, initials: tenant.initials, code: tenant.code, disciplines: tenant.disciplines.map((d) => d.name) },
    };
  }

  private async ensureEmailFree(email: string) {
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Já existe uma conta com esse e-mail.');
  }

  private async newCode(tx: Prisma.TransactionClient, name: string) {
    const base =
      name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/^(CT|ACADEMIA|CENTRO DE TREINAMENTO)\s+/, '')
        .replace(/[^A-Z]/g, '')
        .slice(0, 8) || 'ACAD';
    for (;;) {
      const code = `${base}-${1000 + Math.floor(Math.random() * 9000)}`;
      if (!(await tx.tenant.findUnique({ where: { code } }))) return code;
    }
  }
}
