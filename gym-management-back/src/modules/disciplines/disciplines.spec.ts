import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CATALOG } from '../../domain/catalog';
import { catalogLevels } from './catalog-sync';
import { DisciplinesService, LevelDto } from './disciplines.module';

const errs = (o: object) => validateSync(plainToInstance(LevelDto, o)).map((e) => e.property);
const base = { name: 'Branco e amarelo', color: '#EDEDEA' };

test('LevelDto: 2ª cor é opcional, aceita null e hex válido', () => {
  assert.deepEqual(errs(base), []);
  assert.deepEqual(errs({ ...base, color2: null }), []);
  assert.deepEqual(errs({ ...base, color2: '#EAC02E' }), []);
});

test('LevelDto: rejeita 2ª cor inválida', () => {
  assert.deepEqual(errs({ ...base, color2: 'amarelo' }), ['color2']);
  assert.deepEqual(errs({ ...base, color2: '#FFF' }), ['color2']);
});

test('adicionar 2ª cor a um nível do catálogo marca a modalidade como personalizada', () => {
  const svc = new DisciplinesService(null as never) as unknown as { differsFromCatalog: (o: string, d: object) => boolean };
  const c = CATALOG.find((x) => x.id === 'mt')!;
  const dto = { name: c.name, color: c.color, system: c.system, monthlyPrice: 0, levels: catalogLevels(c) };
  assert.equal(svc.differsFromCatalog('mt', dto), false);
  const levels = dto.levels.map((l, i) => (i === 1 ? { ...l, color2: '#EE8424' } : l));
  assert.equal(svc.differsFromCatalog('mt', { ...dto, levels }), true);
});
