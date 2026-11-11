import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { IS_AUTHENTICATED, IS_PUBLIC, PERMS } from './decorators';
import { AuthUser } from './auth.types';
import { hasAll, Permission } from './permissions';

const EXPIRED = 'Sessão expirada. Entre novamente.';

/**
 * Guard global:
 * - @Public: passa direto;
 * - demais rotas exigem JWT válido e com a versão de credenciais atual do usuário;
 * - @Authenticated: basta estar logado;
 * - @Can(...): o perfil precisa ter todas as permissões;
 * - sem nenhum dos três: negado (403), para nenhuma rota nova ficar aberta por esquecimento.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException(EXPIRED);
    let payload: AuthUser;
    try {
      payload = await this.jwt.verifyAsync<AuthUser>(token);
    } catch {
      throw new UnauthorizedException(EXPIRED);
    }

    // Confere no banco: usuário existe e a senha não mudou desde a emissão do token.
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { role: true, tenantId: true, tokenVersion: true } });
    if (!user || user.tokenVersion !== payload.ver || user.tenantId !== payload.tenantId) throw new UnauthorizedException(EXPIRED);
    req.user = { ...payload, role: user.role } satisfies AuthUser;

    const perms = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMS, targets);
    if (perms?.length) {
      if (!hasAll(user.role, perms)) throw new ForbiddenException('Acesso restrito.');
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED, targets)) return true;
    throw new ForbiddenException('Acesso restrito.');
  }
}
