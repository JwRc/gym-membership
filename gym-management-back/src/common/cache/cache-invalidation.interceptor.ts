import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { CacheService } from './cache.module';
import { AuthUser } from '../auth/auth.types';

/** Toda escrita bem-sucedida de um usuário autenticado invalida o cache da academia dele. */
@Injectable()
export class CacheInvalidationInterceptor implements NestInterceptor {
  constructor(private readonly cache: CacheService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{ method: string; user?: AuthUser }>();
    if (req.method === 'GET') return next.handle();
    return next.handle().pipe(
      tap(() => {
        if (req.user?.tenantId) void this.cache.invalidate(req.user.tenantId);
      }),
    );
  }
}
