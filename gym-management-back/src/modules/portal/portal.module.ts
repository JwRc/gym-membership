import { BadRequestException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { Can, CurrentUser } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma.service';
import { WEEKDAYS, hm, nowMinutes, num, today, weekdayMon0 } from '../../common/util';
import { StudentsModule } from '../students/students.module';
import { StudentsService } from '../students/students.service';
import { InvoicesService } from '../students/invoices.service';

/** Área do aluno: só enxerga os próprios dados. */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly students: StudentsService,
    private readonly invoices: InvoicesService,
  ) {}

  private sid(u: AuthUser) {
    if (!u.studentId) throw new ForbiddenException('Conta sem matrícula vinculada.');
    return u.studentId;
  }

  async home(u: AuthUser) {
    const id = this.sid(u);
    const detail = await this.students.detail(u.tenantId, id);
    const slots = await this.prisma.classSlot.findMany({
      where: { classGroup: { enrollments: { some: { studentId: id } } } },
      include: { classGroup: { include: { instructor: true, discipline: true } } },
    });
    // Próxima aula: menor distância em minutos a partir de agora, na semana
    const nowAbs = weekdayMon0(today()) * 1440 + nowMinutes();
    const next = slots
      .map((s) => {
        let d = s.weekday * 1440 + s.startMin - nowAbs;
        if (d < 0) d += 7 * 1440;
        return { s, d };
      })
      .sort((a, b) => a.d - b.d)[0];
    const nextClass = next
      ? {
          name: next.s.classGroup.name,
          color: next.s.classGroup.discipline.color,
          instructor: next.s.classGroup.instructor?.name ?? null,
          when: `${next.d < 1440 - nowMinutes() ? 'Hoje' : next.d < 2 * 1440 - nowMinutes() ? 'Amanhã' : WEEKDAYS[next.s.weekday]} · ${hm(next.s.startMin)}–${hm(next.s.endMin)}`,
          inText: next.d < 60 ? `em ${next.d} min` : next.d < 1440 ? `em ${Math.round(next.d / 60)}h` : `em ${Math.round(next.d / 1440)} ${Math.round(next.d / 1440) > 1 ? 'dias' : 'dia'}`,
        }
      : null;
    return { ...detail, nextClass };
  }

  invoicesOf(u: AuthUser) {
    return this.invoices.forStudent(u.tenantId, this.sid(u));
  }

  /** Cobrança Pix (stub): devolve um "copia e cola" de demonstração. Integrar com o PSP aqui. */
  async pix(u: AuthUser, invoiceId: string) {
    const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId, studentId: this.sid(u), tenantId: u.tenantId } });
    if (!inv) throw new NotFoundException('Mensalidade não encontrada.');
    if (inv.status === 'PAID' || inv.status === 'EXEMPT') throw new BadRequestException('Essa mensalidade não está em aberto.');
    const amount = num(inv.amount).toFixed(2);
    return {
      amount: num(inv.amount),
      copyPaste: `00020126580014BR.GOV.BCB.PIX0136demo-${inv.id}5204000053039865406${amount}5802BR5909ACADEMIA6009SAO PAULO62070503***6304DEMO`,
      demo: true,
    };
  }
}

@Can('portal.self')
@Controller('me')
export class PortalController {
  constructor(private readonly svc: PortalService) {}

  @Get() home(@CurrentUser() u: AuthUser) {
    return this.svc.home(u);
  }
  @Get('invoices') invoices(@CurrentUser() u: AuthUser) {
    return this.svc.invoicesOf(u);
  }
  @Post('invoices/:id/pix') pix(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.pix(u, id);
  }
}

@Module({ imports: [StudentsModule], controllers: [PortalController], providers: [PortalService] })
export class PortalModule {}
