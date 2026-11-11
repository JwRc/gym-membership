import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export interface AuditEntry {
  tenantId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
}

/** Registro de auditoria ("quem fez o quê"). Falhas ao gravar nunca derrubam a requisição. */
@Injectable()
export class AuditService {
  private readonly log = new Logger(AuditService.name);
  constructor(private readonly prisma: PrismaService) {}

  async record(e: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: { tenantId: e.tenantId, userId: e.userId ?? null, action: e.action, entity: e.entity, entityId: e.entityId ?? null, meta: e.meta },
      });
    } catch (err) {
      this.log.error(`Falha ao gravar auditoria (${e.action}): ${(err as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
