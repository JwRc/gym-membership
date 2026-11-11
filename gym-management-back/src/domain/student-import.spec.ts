import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSheet, Cell, ImportContext, nameKey, parseDate, parseMoney, parsePhone } from './student-import';

const CTX: ImportContext = {
  today: '2026-11-11',
  dueDays: [5, 10, 20],
  plans: [{ id: 'p1', name: 'Mensal Jiu-Jitsu', price: 180 }],
  existing: [{ name: 'Carlos Pereira', email: 'carlos@x.com', birthDate: '2000-01-02' }],
};
const HEADER = ['Nome *', 'E-mail *', 'Data de nascimento *', 'Mensalidade (R$) *', 'Dia de vencimento *', 'Plano', 'Telefone', 'Status', 'Consentimento LGPD'];
const sheet = (...rows: Cell[][]) => ({ rows: [HEADER, ...rows] });
const ok: Cell[] = ['Maria Souza', 'maria@x.com', '15/03/2012', '180,00', '10', '', '11912345678', '', 'Sim'];

test('datas: dd/mm/aaaa, ISO, ano com 2 dígitos, serial do Excel e célula de data', () => {
  assert.equal(parseDate('15/03/2012'), '2012-03-15');
  assert.equal(parseDate('5-3-2012'), '2012-03-05');
  assert.equal(parseDate('2012-03-15'), '2012-03-15');
  assert.equal(parseDate('15/03/12'), '2012-03-15');
  assert.equal(parseDate('15/03/95'), '1995-03-15');
  assert.equal(parseDate(40983), '2012-03-15');
  assert.equal(parseDate(new Date(Date.UTC(2012, 2, 15))), '2012-03-15');
  assert.equal(parseDate(''), '');
  assert.equal(parseDate(null), '');
  assert.equal(parseDate('31/02/2012'), null);
  assert.equal(parseDate('ontem'), null);
});

test('valores: R$, vírgula decimal, milhar com ponto e número', () => {
  assert.equal(parseMoney('R$ 1.234,56'), 1234.56);
  assert.equal(parseMoney('150,00'), 150);
  assert.equal(parseMoney('150'), 150);
  assert.equal(parseMoney('99.90'), 99.9);
  assert.equal(parseMoney('1.500'), 1500);
  assert.equal(parseMoney(180.5), 180.5);
  assert.equal(parseMoney(''), null);
  assert.ok(Number.isNaN(parseMoney('cento e oitenta')));
});

test('telefone com DDD é formatado; sem DDD é inválido', () => {
  assert.equal(parsePhone('11912345678'), '(11) 91234-5678');
  assert.equal(parsePhone('+55 (11) 3456-7890'), '(11) 3456-7890');
  assert.equal(parsePhone(''), '');
  assert.equal(parsePhone('91234-5678'), null);
});

test('nome normalizado ignora acento, caixa e espaços', () => {
  assert.equal(nameKey('  JOÃO   da Silva '), 'joao da silva');
});

test('linha válida vira aluno', () => {
  const a = analyzeSheet(sheet(ok), CTX);
  assert.deepEqual(a.errors, []);
  assert.equal(a.valid, 1);
  const s = a.students[0];
  assert.equal(s.row, 2);
  assert.equal(s.birthDate, '2012-03-15');
  assert.equal(s.monthlyFee, 180);
  assert.equal(s.dueDay, 10);
  assert.equal(s.phone, '(11) 91234-5678');
  assert.equal(s.status, 'ACTIVE');
  assert.equal(s.startDate, '2026-11-11');
  assert.equal(s.consent, true);
});

test('cabeçalho sem acento/asterisco e com apelidos é reconhecido', () => {
  const a = analyzeSheet({ rows: [['nome', 'email', 'nascimento', 'valor', 'vencimento'], ['Maria Souza', 'maria@x.com', '15/03/2012', '180', '10']] }, CTX);
  assert.deepEqual(a.errors, []);
  assert.equal(a.valid, 1);
});

test('coluna obrigatória ausente é erro do arquivo', () => {
  const a = analyzeSheet({ rows: [['Nome', 'E-mail'], ['Maria', 'm@x.com']] }, CTX);
  assert.ok(a.errors.some((e) => e.row === null && e.column === 'Data de nascimento'));
  assert.equal(a.valid, 0);
});

test('erros por linha apontam linha e coluna', () => {
  const a = analyzeSheet(sheet(['Ma', 'sem-arroba', '31/02/2012', 'abc', '7', 'Plano X', '1234', 'Talvez', 'Talvez']), CTX);
  const cols = a.errors.map((e) => `${e.row}:${e.column}`);
  for (const c of ['Nome', 'E-mail', 'Data de nascimento', 'Mensalidade (R$)', 'Dia de vencimento', 'Plano', 'Telefone', 'Status', 'Consentimento LGPD'])
    assert.ok(cols.includes(`2:${c}`), `esperava erro em ${c}`);
  assert.equal(a.valid, 0);
});

test('mensalidade em branco usa o preço do plano', () => {
  const a = analyzeSheet(sheet(['Maria Souza', 'maria@x.com', '15/03/2012', '', '10', 'mensal jiu-jitsu']), CTX);
  assert.deepEqual(a.errors, []);
  assert.equal(a.students[0].monthlyFee, 180);
  assert.equal(a.students[0].planId, 'p1');
});

test('duplicado contra o banco: mesmo e-mail ou mesmo nome + nascimento', () => {
  const a = analyzeSheet(
    sheet(['Outro Nome', 'CARLOS@x.com', '01/01/1990', '100', '5'], ['Carlos  Pereira', 'novo@x.com', '02/01/2000', '100', '5']),
    CTX,
  );
  assert.ok(a.errors.some((e) => e.row === 2 && /Já existe um aluno com esse e-mail/.test(e.message)));
  assert.ok(a.errors.some((e) => e.row === 3 && /já cadastrado/.test(e.message)));
});

test('duplicado dentro da planilha aponta a linha anterior', () => {
  const a = analyzeSheet(sheet(ok, ['Outra Pessoa', 'maria@x.com', '01/01/1990', '100', '5'], ['maria souza', 'm2@x.com', '15/03/2012', '100', '5']), CTX);
  assert.ok(a.errors.some((e) => e.row === 3 && /linha 2/.test(e.message)));
  assert.ok(a.errors.some((e) => e.row === 4 && /linha 2/.test(e.message)));
  assert.equal(a.valid, 1);
});

test('linhas em branco são ignoradas; planilha sem alunos é erro', () => {
  assert.equal(analyzeSheet(sheet([], ['', null], ok), CTX).valid, 1);
  assert.ok(analyzeSheet(sheet(), CTX).errors.some((e) => /Nenhum aluno/.test(e.message)));
  assert.ok(analyzeSheet({ rows: [] }, CTX).errors.some((e) => /vazia/.test(e.message)));
});
