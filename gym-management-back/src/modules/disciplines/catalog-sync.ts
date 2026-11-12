import { PrismaClient } from '@prisma/client';
import { CATALOG, CatalogEntry } from '../../domain/catalog';

export function catalogLevels(c: CatalogEntry) {
  return c.levels.map(([name, color, minMonths, minClasses, color2], order) => ({ order, name, color, color2: color2 ?? null, minMonths, minClasses }));
}
export function catalogRules(c: CatalogEntry) {
  return {
    system: c.system,
    degreesPerLevel: c.degreesPerLevel ?? 0,
    lastLevelMaxDegrees: c.lastLevelMaxDegrees ?? 0,
    degreeMinMonths: c.degreeMinMonths ?? null,
    degreeMinClasses: c.degreeMinClasses ?? null,
  };
}

/** Mantém a tabela do catálogo padrão igual ao código. */
export async function syncCatalog(prisma: PrismaClient) {
  for (const c of CATALOG) {
    const data = { name: c.name, color: c.color, ...catalogRules(c) };
    await prisma.catalogDiscipline.upsert({ where: { id: c.id }, update: data, create: { id: c.id, ...data } });
    await prisma.catalogLevel.deleteMany({ where: { disciplineId: c.id } });
    await prisma.catalogLevel.createMany({ data: catalogLevels(c).map((l) => ({ ...l, disciplineId: c.id })) });
  }
}
