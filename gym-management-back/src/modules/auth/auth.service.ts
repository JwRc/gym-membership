import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit/audit.module';
import { AuthUser } from '../../common/auth/auth.types';
import { permissionsOf } from '../../common/auth/permissions';
import { ChangePasswordDto, LoginDto } from './auth.dto';

// Hash fixo para comparar quando o e-mail não existe: o tempo de resposta não revela se a conta existe.
const DUMMY_HASH = '$2b$10$7Lo9671lSiTZAwhChFWEuOEU3czP1POV6N9s00dEE6UrHPI/yFY52';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('E-mail ou senha incorretos.');
    await this.audit.record({ tenantId: user.tenantId, userId: user.id, action: 'auth.login', entity: 'auth' });
    return this.session(user);
  }

  async me(u: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: u.sub } });
    if (!user) throw new UnauthorizedException();
    return this.profile(user);
  }

  /** Troca a senha, derruba as outras sessões e devolve uma sessão nova para quem trocou. */
  async changePassword(u: AuthUser, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: u.sub } });
    if (!user) throw new UnauthorizedException();
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) throw new BadRequestException('A senha atual está incorreta.');
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException('A nova senha precisa ser diferente da atual.');
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10), tokenVersion: { increment: 1 } },
    });
    return this.session(updated);
  }

  private async session(user: User) {
    const payload: AuthUser = { sub: user.id, tenantId: user.tenantId, role: user.role, studentId: user.studentId, name: user.name, ver: user.tokenVersion };
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
      permissions: permissionsOf(user.role),
      studentId: user.studentId,
      tenant: { id: tenant.id, name: tenant.name, initials: tenant.initials, code: tenant.code, disciplines: tenant.disciplines.map((d) => d.name) },
    };
  }
}
