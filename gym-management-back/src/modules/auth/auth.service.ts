import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.service';
import { AuthUser } from '../../common/auth/auth.types';
import { LoginDto } from './auth.dto';

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
}
