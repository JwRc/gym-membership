import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser } from './auth.types';
import { Permission } from './permissions';

export const IS_PUBLIC = 'isPublic';
/** Rota aberta, sem login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const IS_AUTHENTICATED = 'isAuthenticated';
/** Qualquer usuário logado (ex.: /auth/me, trocar senha). */
export const Authenticated = () => SetMetadata(IS_AUTHENTICATED, true);

export const PERMS = 'permissions';
/**
 * Permissões exigidas. Pode ir na classe (vale para todas as rotas) e ser
 * sobrescrito na rota. Rotas sem @Public, @Authenticated ou @Can são negadas.
 */
export const Can = (...perms: Permission[]) => SetMetadata(PERMS, perms);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

export const NO_AUTO_AUDIT = 'noAutoAudit';
/** A rota grava a própria auditoria (com detalhes); o interceptor genérico não registra de novo. */
export const NoAutoAudit = () => SetMetadata(NO_AUTO_AUDIT, true);
