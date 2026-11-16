import { test } from 'node:test';
import assert from 'node:assert/strict';
import { added, classOutsidePlan, missingDisciplines, planClassTransition } from './plans';

const sorted = (r: { finalIds: string[]; skippedFull: string[] }) => ({ finalIds: [...r.finalIds].sort(), skippedFull: [...r.skippedFull].sort() });

test('aluno novo entra nas turmas do plano, mantendo as escolhidas', () => {
  const r = planClassTransition({ base: ['x'], enrolled: [], oldPlan: [], newPlan: ['a', 'b'], full: [] });
  assert.deepEqual(sorted(r), { finalIds: ['a', 'b', 'x'], skippedFull: [] });
});

test('turma lotada é pulada e avisada', () => {
  const r = planClassTransition({ base: ['a'], enrolled: [], oldPlan: [], newPlan: ['a', 'b'], full: ['a'] });
  assert.deepEqual(sorted(r), { finalIds: ['b'], skippedFull: ['a'] });
});

test('lotada não tira quem já está na turma', () => {
  const r = planClassTransition({ base: ['a'], enrolled: ['a'], oldPlan: [], newPlan: ['a'], full: ['a'] });
  assert.deepEqual(sorted(r), { finalIds: ['a'], skippedFull: [] });
});

test('troca de plano tira das turmas do plano antigo que não estão no novo', () => {
  const r = planClassTransition({ base: ['old1', 'shared', 'free'], enrolled: ['old1', 'shared', 'free'], oldPlan: ['old1', 'shared'], newPlan: ['shared', 'new1'], full: [] });
  assert.deepEqual(sorted(r), { finalIds: ['free', 'new1', 'shared'], skippedFull: [] });
});

test('sair do plano tira das turmas dele', () => {
  const r = planClassTransition({ base: ['p', 'free'], enrolled: ['p', 'free'], oldPlan: ['p'], newPlan: [], full: [] });
  assert.deepEqual(sorted(r), { finalIds: ['free'], skippedFull: [] });
});

test('modalidades que faltam', () => {
  assert.deepEqual(missingDisciplines(['bjj'], ['bjj', 'muay', 'muay']), ['muay']);
  assert.deepEqual(missingDisciplines(['bjj'], []), []);
});

test('turma fora das modalidades do plano', () => {
  assert.equal(classOutsidePlan(['bjj'], [{ name: 'Kids', disciplineId: 'bjj' }]), null);
  assert.equal(classOutsidePlan(['bjj'], [{ name: 'Muay 19h', disciplineId: 'muay' }]), 'Muay 19h');
});

test('o que foi adicionado', () => {
  assert.deepEqual(added(['a', 'b'], ['b', 'c']), ['c']);
});
