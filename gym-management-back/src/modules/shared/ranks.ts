import { Prisma } from '@prisma/client';
import { promotionTitle } from '../../domain/graduation';
import { DisciplineWithLevels, toRules } from '../../domain/rules-mapper';

/** Matricula o aluno numa modalidade: graduação atual + entrada "Início" no histórico. */
export async function addRank(
  tx: Prisma.TransactionClient, studentId: string, d: DisciplineWithLevels, levelOrder: number, degree: number, date: Date,
) {
  await tx.studentRank.create({ data: { studentId, disciplineId: d.id, levelOrder, degree, levelSince: date, lastPromotionAt: date } });
  if (d.levels.length)
    await tx.promotion.create({
      data: { studentId, disciplineId: d.id, levelOrder, degree, date, title: promotionTitle(toRules(d), levelOrder, degree, true) },
    });
}

/** Primeira graduação da modalidade (menor nível). */
export function initialLevel(d: DisciplineWithLevels): number {
  return d.levels.length ? Math.min(...d.levels.map((l) => l.order)) : 0;
}
