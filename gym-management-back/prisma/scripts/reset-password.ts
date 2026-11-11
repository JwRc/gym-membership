/**
 * Redefine a senha de um usuário e derruba as sessões abertas dele.
 *
 *   npm run ops:reset-password -- --email fulano@x.com
 *
 * A senha vem de OPS_PASSWORD; sem ela, uma senha forte é gerada e mostrada uma vez.
 */
import { parseArgs } from 'node:util';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { passwordFromEnv } from './ops-util';

async function main() {
  const { values } = parseArgs({ options: { email: { type: 'string' } } });
  if (!values.email) {
    console.error('Uso: npm run ops:reset-password -- --email fulano@x.com');
    process.exit(1);
  }
  const { password, generated } = passwordFromEnv();
  const prisma = new PrismaClient();
  try {
    const email = values.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`Usuário não encontrado: ${email}`);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 10), tokenVersion: { increment: 1 } } }),
      prisma.auditLog.create({ data: { tenantId: user.tenantId, userId: null, action: 'ops.reset-password', entity: 'users', entityId: user.id } }),
    ]);
    console.log(`Senha redefinida para ${email}. Sessões abertas foram encerradas.`);
    if (generated) console.log(`Nova senha (mostrada só agora): ${password}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
