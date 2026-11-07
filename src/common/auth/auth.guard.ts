import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC, ROLES } from './decorators';
import { AppRole, AuthUser } from './auth.types';

/** Guard global: exige JWT (exceto rotas @Public) e confere @Roles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Sessão expirada. Entre novamente.');
    try {
      req.user = await this.jwt.verifyAsync<AuthUser>(token);
    } catch {
      throw new UnauthorizedException('Sessão expirada. Entre novamente.');
    }

    const roles = this.reflector.getAllAndOverride<AppRole[] | undefined>(ROLES, targets);
    if (roles?.length && !roles.includes((req.user as AuthUser).role)) {
      throw new ForbiddenException('Acesso restrito.');
    }
    return true;
  }
}
