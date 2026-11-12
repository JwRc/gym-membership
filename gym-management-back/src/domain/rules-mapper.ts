import { Discipline, DisciplineLevel } from '@prisma/client';
import { DisciplineRules } from './graduation';

export type DisciplineWithLevels = Discipline & { levels: DisciplineLevel[] };

export function toRules(d: DisciplineWithLevels): DisciplineRules {
  return {
    system: d.system,
    degreesPerLevel: d.degreesPerLevel,
    lastLevelMaxDegrees: d.lastLevelMaxDegrees,
    degreeMinMonths: d.degreeMinMonths,
    degreeMinClasses: d.degreeMinClasses,
    levels: [...d.levels]
      .sort((a, b) => a.order - b.order)
      .map((l) => ({ order: l.order, name: l.name, color: l.color, color2: l.color2, minMonths: l.minMonths, minClasses: l.minClasses })),
  };
}
