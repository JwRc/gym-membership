/**
 * Cria uma academia com o usuário administrador (na V1 não há cadastro aberto).
 *
 *   npm run ops:create-academy -- --academy "Academia X" --name "Fulano" --email fulano@x.com --disciplines bjj,mt
 *
 * A senha vem de OPS_PASSWORD; sem ela, uma senha forte é gerada e mostrada uma vez.
 */
import { parseArgs } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { CATALOG } from '../../src/domain/catalog';
import { syncCatalog } from '../../src/modules/disciplines/catalog-sync';
import { createAcademy } from '../../src/modules/tenant/create-academy';
import { passwordFromEnv } from './ops-util';

async function main() {
  const { values } = parseArgs({
    options: {
      academy: { type: 'string' },
      name: { type: 'string' },
      email: { type: 'string' },
      disciplines: { type: 'string' },
    },
  });
  if (!values.academy || !values.name || !values.email || !values.disciplines) {
    console.error('Uso: npm run ops:create-academy -- --academy "Nome" --name "Admin" --email admin@x.com --disciplines bjj,mt');
    console.error(`Modalidades do catálogo: ${CATALOG.map((c) => c.id).join(', ')}`);
    process.exit(1);
  }
  const { password, generated } = passwordFromEnv();
  const prisma = new PrismaClient();
  try {
    await syncCatalog(prisma); // o catálogo precisa existir no banco antes de copiar as modalidades
    const { tenant, user } = await createAcademy(prisma, {
      academyName: values.academy,
      adminName: values.name,
      adminEmail: values.email,
      password,
      disciplines: values.disciplines.split(',').map((d) => d.trim()),
    });
    console.log(`Academia criada: ${tenant.name} (${tenant.id})`);
    console.log(`Administrador: ${user.email}`);
    if (generated) console.log(`Senha gerada (mostrada só agora; peça para trocar no primeiro acesso): ${password}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
