import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { initials } from '../../common/util';
import { CATALOG } from '../../domain/catalog';

export interface CreateAcademyInput {
  academyName: string;
  adminName: string;
  adminEmail: string;
  password: string;
  /** ids do catálogo padrão (bjj, mt, box…) */
  disciplines: string[];
}

/**
 * Cria uma academia com o usuário administrador e as modalidades escolhidas do
 * catálogo. Na V1 não há cadastro aberto: é usado pelo script de operação
 * `npm run ops:create-academy`.
 */
export async function createAcademy(prisma: PrismaClient, input: CreateAcademyInput) {
  const email = input.adminEmail.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw new Error('Já existe uma conta com esse e-mail.');
  const picks = CATALOG.filter((c) => input.disciplines.includes(c.id));
  if (!picks.length) throw new Error(`Escolha pelo menos uma modalidade do catálogo: ${CATALOG.map((c) => c.id).join(', ')}`);
  const passwordHash = await bcrypt.hash(input.password, 10);

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: input.academyName.trim(), initials: initials(input.academyName), code: await newCode(tx, input.academyName) },
    });
    const instructor = await tx.instructor.create({ data: { tenantId: tenant.id, name: input.adminName.trim() } });
    for (const c of picks) {
      await tx.discipline.create({
        data: {
          tenantId: tenant.id,
          originId: c.id,
          name: c.name,
          color: c.color,
          system: c.system,
          degreesPerLevel: c.degreesPerLevel ?? 0,
          lastLevelMaxDegrees: c.lastLevelMaxDegrees ?? 0,
          degreeMinMonths: c.degreeMinMonths ?? null,
          degreeMinClasses: c.degreeMinClasses ?? null,
          monthlyPrice: c.defaultPrice,
          instructorId: instructor.id,
          levels: { create: c.levels.map(([name, color, minMonths, minClasses], order) => ({ order, name, color, minMonths, minClasses })) },
        },
      });
    }
    const user = await tx.user.create({
      data: { tenantId: tenant.id, email, name: input.adminName.trim(), role: 'ADMIN', passwordHash },
    });
    return { tenant, user };
  });
}

async function newCode(tx: Prisma.TransactionClient, name: string) {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/^(CT|ACADEMIA|CENTRO DE TREINAMENTO)\s+/, '')
      .replace(/[^A-Z]/g, '')
      .slice(0, 8) || 'ACAD';
  for (;;) {
    const code = `${base}-${1000 + Math.floor(Math.random() * 9000)}`;
    if (!(await tx.tenant.findUnique({ where: { code } }))) return code;
  }
}
