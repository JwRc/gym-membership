import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beltVisual, DisciplineRules, nextRank, progress, rankLabel, requirementFor } from './graduation';

const bjj: DisciplineRules = {
  system: 'Faixas e graus',
  degreesPerLevel: 4,
  lastLevelMaxDegrees: 6,
  degreeMinMonths: 4,
  degreeMinClasses: 40,
  levels: [
    { order: 0, name: 'Branca', color: '#EDEDEA', minMonths: 18, minClasses: 150 },
    { order: 1, name: 'Azul', color: '#2F5FD0', minMonths: 24, minClasses: 220 },
    { order: 2, name: 'Roxa', color: '#7440C0', minMonths: 18, minClasses: 200 },
    { order: 3, name: 'Marrom', color: '#6E4426', minMonths: 12, minClasses: 150 },
    { order: 4, name: 'Preta', color: '#121212', minMonths: 36, minClasses: 300 },
  ],
};
const boxe: DisciplineRules = {
  system: 'Níveis',
  degreesPerLevel: 0,
  lastLevelMaxDegrees: 0,
  degreeMinMonths: null,
  degreeMinClasses: null,
  levels: [
    { order: 0, name: 'Iniciante', color: '#C9CED6', minMonths: 4, minClasses: 32 },
    { order: 1, name: 'Intermediário', color: '#2EC4B6', minMonths: 8, minClasses: 64 },
    { order: 2, name: 'Avançado', color: '#17877D', minMonths: null, minClasses: null },
  ],
};
const T = new Date('2026-10-30T00:00:00Z');
const ago = (days: number) => new Date(T.getTime() - days * 86_400_000);

test('BJJ: grau dentro da faixa usa requisito de grau', () => {
  const r = { levelOrder: 1, degree: 2, levelSince: ago(400), lastPromotionAt: ago(130), classesSince: 45 };
  assert.deepEqual(requirementFor(bjj, r), { months: 4, classes: 40, kind: 'degree' });
  assert.deepEqual(nextRank(bjj, r), { levelOrder: 1, degree: 3 });
  assert.equal(progress(bjj, r, T).eligible, true);
});

test('BJJ: com 4 graus, próxima é a faixa; tempo conta desde a faixa', () => {
  const r = { levelOrder: 1, degree: 4, levelSince: ago(700), lastPromotionAt: ago(60), classesSince: 230 };
  assert.deepEqual(nextRank(bjj, r), { levelOrder: 2, degree: 0 });
  const p = progress(bjj, r, T);
  assert.equal(p.requirement?.kind, 'level');
  assert.equal(p.eligible, false);
  assert.match(p.status, /^Faltam/);
});

test('BJJ: faixa preta continua em graus até o 6º', () => {
  assert.deepEqual(nextRank(bjj, { levelOrder: 4, degree: 1, levelSince: T, lastPromotionAt: T, classesSince: 0 }), { levelOrder: 4, degree: 2 });
  assert.equal(nextRank(bjj, { levelOrder: 4, degree: 6, levelSince: T, lastPromotionAt: T, classesSince: 0 }), null);
});

test('Níveis simples e topo', () => {
  const r = { levelOrder: 0, degree: 0, levelSince: ago(200), lastPromotionAt: ago(200), classesSince: 10 };
  const p = progress(boxe, r, T);
  assert.equal(p.status, 'Faltam 22 aulas');
  assert.deepEqual(p.next, { levelOrder: 1, degree: 0 });
  assert.equal(progress(boxe, { ...r, levelOrder: 2 }, T).status, 'Topo');
});

test('rótulo com graus', () => {
  assert.equal(rankLabel(bjj, 1, 0), 'Azul');
  assert.equal(rankLabel(bjj, 1, 1), 'Azul · 1 grau');
  assert.equal(rankLabel(bjj, 0, 3), 'Branca · 3 graus');
});

test('faixa bicolor: beltVisual devolve a 2ª cor; faixa simples devolve null', () => {
  const mt: DisciplineRules = {
    ...boxe,
    system: 'Prajied',
    levels: [
      { order: 0, name: 'Branco', color: '#EDEDEA', minMonths: 4, minClasses: 30 },
      { order: 1, name: 'Branco e amarelo', color: '#EDEDEA', color2: '#EAC02E', minMonths: null, minClasses: null },
    ],
  };
  assert.equal(beltVisual(mt, 0, 0).color2, null);
  const b = beltVisual(mt, 1, 0);
  assert.equal(b.color, '#EDEDEA');
  assert.equal(b.color2, '#EAC02E');
});
