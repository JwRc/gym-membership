import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuthUser } from '../auth/auth.types';
import { NO_AUTO_AUDIT } from '../auth/decorators';
import { AuditService } from './audit.module';

interface Req {
  method: string;
  user?: AuthUser;
  route?: { path?: string };
  params?: Record<string, string>;
}

/**
 * Toda escrita bem-sucedida de um usuário logado vira uma linha de auditoria:
 * ação = método + rota (ex.: "POST /invoices/:id/pay"), entidade = primeiro
 * segmento da rota e os parâmetros da URL. O corpo não é gravado, para não
 * duplicar dados pessoais.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Req>();
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next.handle();
    if (this.reflector.getAllAndOverride<boolean>(NO_AUTO_AUDIT, [ctx.getHandler(), ctx.getClass()])) return next.handle();
    return next.handle().pipe(
      tap(() => {
        if (!req.user?.tenantId) return;
        const path = (req.route?.path ?? '').replace(/^\/api/, '') || '/';
        const params = req.params ?? {};
        void this.audit.record({
          tenantId: req.user.tenantId,
          userId: req.user.sub,
          action: `${req.method} ${path}`,
          entity: path.split('/')[1] || 'unknown',
          entityId: params.id ?? params.slotId ?? params.studentId ?? null,
          meta: Object.keys(params).length ? params : undefined,
        });
      }),
    );
  }
}
