import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { AuditService } from '../../../common/audit/audit.module';
import { AuthUser } from '../../../common/auth/auth.types';
import { dateOnly, iso, num, todayISO } from '../../../common/util';
import { analyzeSheet, ImportAnalysis, ImportContext } from '../../../domain/student-import';
import { readSheet } from './sheet-reader';
import { buildTemplate } from './template';

type UploadedFile = { buffer: Buffer; originalname: string };

@Injectable()
export class StudentImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async template(tenantId: string) {
    const [tenant, plans] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, dueDays: true } }),
      this.prisma.plan.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, select: { name: true } }),
    ]);
    return buildTemplate({ academy: tenant.name, plans: plans.map((p) => p.name), dueDays: tenant.dueDays });
  }

  /** Lê e valida o arquivo, sem gravar nada. */
  async analyze(tenantId: string, file: UploadedFile | undefined): Promise<ImportAnalysis> {
    if (!file?.buffer?.length) throw new BadRequestException('Envie o arquivo da planilha.');
    const sheet = await readSheet(file);
    return analyzeSheet(sheet, await this.context(tenantId));
  }

  /** Importa só se a planilha não tiver nenhum erro (corrigir e reenviar). */
  async import(user: AuthUser, file: UploadedFile | undefined) {
    const analysis = await this.analyze(user.tenantId, file);
    if (analysis.errors.length) {
      throw new BadRequestException({ message: 'A planilha tem erros. Corrija as linhas indicadas e envie de novo.', analysis: this.summary(analysis) });
    }
    const consentAt = new Date();
    const data = analysis.students.map((s) => ({
      tenantId: user.tenantId,
      name: s.name,
      email: s.email,
      birthDate: dateOnly(s.birthDate),
      gender: s.gender,
      phone: s.phone,
      status: s.status,
      planId: s.planId,
      monthlyFee: s.monthlyFee,
      dueDay: s.dueDay,
      startDate: dateOnly(s.startDate),
      medicalNotes: s.medicalNotes,
      guardianName: s.guardianName,
      guardianRelation: s.guardianRelation,
      guardianPhone: s.guardianPhone,
      consentAt: s.consent ? consentAt : null,
    }));
    const created = await this.prisma.$transaction(async (tx) => (await tx.student.createMany({ data })).count);
    await this.audit.record({
      tenantId: user.tenantId,
      userId: user.sub,
      action: 'students.import',
      entity: 'students',
      meta: { file: file!.originalname, created, withConsent: data.filter((d) => d.consentAt).length },
    });
    return { created };
  }

  /** Resposta da análise para o front (sem repetir todos os dados de cada aluno). */
  summary(a: ImportAnalysis) {
    return {
      total: a.total,
      valid: a.valid,
      errors: a.errors,
      preview: a.students.slice(0, 5).map((s) => ({ row: s.row, name: s.name, email: s.email, birthDate: s.birthDate, monthlyFee: s.monthlyFee, dueDay: s.dueDay })),
    };
  }

  private async context(tenantId: string): Promise<ImportContext> {
    const [tenant, plans, existing] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { dueDays: true } }),
      this.prisma.plan.findMany({ where: { tenantId }, select: { id: true, name: true, price: true } }),
      this.prisma.student.findMany({ where: { tenantId, anonymizedAt: null }, select: { name: true, email: true, birthDate: true } }),
    ]);
    return {
      today: todayISO(),
      dueDays: tenant.dueDays,
      plans: plans.map((p) => ({ id: p.id, name: p.name, price: num(p.price) })),
      existing: existing.map((s) => ({ name: s.name, email: s.email, birthDate: iso(s.birthDate)! })),
    };
  }
}
