/**
 * Importação de alunos por planilha (XLSX/CSV): regras puras, sem banco.
 *
 * Fluxo: o arquivo vira uma grade de células (RawSheet) → `analyzeSheet`
 * valida linha a linha e aponta duplicados (na planilha e contra o banco).
 * A importação só grava quando não há nenhum erro (corrigir e reenviar).
 */

export type Cell = string | number | boolean | Date | null | undefined;

export interface RawSheet {
  /** linhas da planilha, a primeira é o cabeçalho */
  rows: Cell[][];
}

export type ColumnKey =
  | 'name' | 'email' | 'birthDate' | 'gender' | 'phone' | 'status' | 'plan' | 'monthlyFee' | 'dueDay'
  | 'startDate' | 'medicalNotes' | 'guardianName' | 'guardianRelation' | 'guardianPhone' | 'consent';

export interface ColumnDef {
  key: ColumnKey;
  header: string;
  required: boolean;
  help: string;
  example: string;
  /** nomes alternativos aceitos no cabeçalho */
  aliases?: string[];
}

export const IMPORT_COLUMNS: readonly ColumnDef[] = [
  { key: 'name', header: 'Nome', required: true, help: 'Nome completo (mínimo 3 letras).', example: 'Maria Souza', aliases: ['nome completo', 'aluno'] },
  { key: 'email', header: 'E-mail', required: true, help: 'E-mail do aluno (ou do responsável). Não pode repetir.', example: 'maria.souza@email.com', aliases: ['email'] },
  { key: 'birthDate', header: 'Data de nascimento', required: true, help: 'dd/mm/aaaa.', example: '15/03/2012', aliases: ['nascimento', 'data nascimento'] },
  { key: 'gender', header: 'Sexo', required: false, help: 'M ou F (pode ficar em branco).', example: 'F' },
  { key: 'phone', header: 'Telefone', required: false, help: 'Com DDD. Ex.: (11) 91234-5678.', example: '(11) 91234-5678', aliases: ['celular', 'whatsapp'] },
  { key: 'status', header: 'Status', required: false, help: 'Ativo, Inativo ou Trancado. Em branco = Ativo.', example: 'Ativo', aliases: ['situação', 'situacao'] },
  { key: 'plan', header: 'Plano', required: false, help: 'Nome de um plano cadastrado em Configurações (opcional).', example: '' },
  { key: 'monthlyFee', header: 'Mensalidade (R$)', required: true, help: 'Valor mensal. Em branco = preço do plano informado.', example: '180,00', aliases: ['mensalidade', 'valor', 'valor mensalidade'] },
  { key: 'dueDay', header: 'Dia de vencimento', required: true, help: 'Um dos dias de vencimento configurados na academia.', example: '10', aliases: ['vencimento', 'dia vencimento'] },
  { key: 'startDate', header: 'Data de início', required: false, help: 'dd/mm/aaaa. Em branco = hoje.', example: '01/02/2024', aliases: ['inicio', 'início', 'data matricula', 'data de matrícula', 'matricula'] },
  { key: 'medicalNotes', header: 'Observações médicas', required: false, help: 'Alergias, lesões, restrições (dado sensível).', example: '', aliases: ['observacoes medicas', 'saude', 'saúde'] },
  { key: 'guardianName', header: 'Responsável', required: false, help: 'Nome do responsável (menores de idade).', example: 'Paulo Souza', aliases: ['nome do responsavel', 'responsavel'] },
  { key: 'guardianRelation', header: 'Parentesco', required: false, help: 'Ex.: Pai, Mãe, Avó.', example: 'Pai' },
  { key: 'guardianPhone', header: 'Telefone do responsável', required: false, help: 'Com DDD.', example: '(11) 99876-5432', aliases: ['telefone responsavel'] },
  { key: 'consent', header: 'Consentimento LGPD', required: false, help: 'Sim, se o aluno (ou responsável) autorizou o uso dos dados, inclusive de saúde.', example: 'Sim', aliases: ['consentimento', 'lgpd'] },
];

export const MAX_ROWS = 2000;

export interface ImportContext {
  today: string; // YYYY-MM-DD
  dueDays: number[];
  plans: { id: string; name: string; price: number }[];
  existing: { name: string; email: string; birthDate: string }[];
}

export interface ImportedStudent {
  row: number;
  name: string;
  email: string;
  birthDate: string;
  gender: 'M' | 'F' | null;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  planId: string | null;
  monthlyFee: number;
  dueDay: number;
  startDate: string;
  medicalNotes: string | null;
  guardianName: string | null;
  guardianRelation: string | null;
  guardianPhone: string | null;
  consent: boolean;
}

export interface ImportError {
  /** número da linha na planilha (1 = cabeçalho); null = problema no arquivo todo */
  row: number | null;
  column: string | null;
  message: string;
}

export interface ImportAnalysis {
  total: number;
  valid: number;
  errors: ImportError[];
  students: ImportedStudent[];
}

/* ── Normalização ─────────────────────────────────────────── */

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Chave para comparar nomes: sem acento, minúsculas, espaços únicos. */
export function nameKey(s: string): string {
  return stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function headerKey(s: string): string {
  return stripAccents(s).toLowerCase().replace(/\*/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function text(v: Cell): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, ' ').trim();
}

const pad = (n: number) => String(n).padStart(2, '0');

function validYmd(y: number, m: number, d: number): string | null {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Data em dd/mm/aaaa (ou dd-mm-aaaa, dd.mm.aaaa, ano com 2 dígitos), ISO
 * aaaa-mm-dd, número serial do Excel ou célula de data. Devolve YYYY-MM-DD,
 * '' se vazia ou null se inválida.
 */
export function parseDate(v: Cell): string | null {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return validYmd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === 'number') {
    // serial do Excel: dias desde 1899-12-30
    if (!(v > 0 && v < 80000)) return null;
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000);
    return validYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const s = text(v);
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    let y = +m[3];
    if (m[3].length === 2) y += y > 30 ? 1900 : 2000;
    return validYmd(y, +m[2], +m[1]);
  }
  if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s));
  return null;
}

/** Valor em reais: "R$ 1.234,56", "1234,56", "1234.56", "150". NaN se inválido; null se vazio. */
export function parseMoney(v: Cell): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
  let s = text(v).replace(/R\$/i, '').replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100) / 100;
}

/** Telefone com DDD → "(11) 91234-5678". '' se vazio; null se inválido. */
export function parsePhone(v: Cell): string | null {
  let d = text(v).replace(/\D/g, '');
  if (!d) return '';
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUS: Record<string, ImportedStudent['status']> = { ativo: 'ACTIVE', inativo: 'INACTIVE', trancado: 'LOCKED' };
const GENDER: Record<string, 'M' | 'F'> = { m: 'M', masculino: 'M', f: 'F', feminino: 'F' };
const YES = new Set(['sim', 's', 'yes', 'x', 'true', '1']);
const NO = new Set(['nao', 'n', 'no', 'false', '0']);

/* ── Análise ──────────────────────────────────────────────── */

function mapHeaders(header: Cell[]): { map: Map<ColumnKey, number>; errors: ImportError[] } {
  const lookup = new Map<string, ColumnKey>();
  for (const c of IMPORT_COLUMNS) for (const h of [c.header, ...(c.aliases ?? [])]) lookup.set(headerKey(h), c.key);
  const map = new Map<ColumnKey, number>();
  const errors: ImportError[] = [];
  header.forEach((h, i) => {
    const key = lookup.get(headerKey(text(h)));
    if (!key) return;
    if (map.has(key)) errors.push({ row: 1, column: text(h), message: `Coluna "${text(h)}" aparece mais de uma vez.` });
    else map.set(key, i);
  });
  for (const c of IMPORT_COLUMNS)
    if (c.required && !map.has(c.key)) errors.push({ row: null, column: c.header, message: `Coluna obrigatória "${c.header}" não encontrada. Use o modelo para baixar.` });
  return { map, errors };
}

export function analyzeSheet(sheet: RawSheet, ctx: ImportContext): ImportAnalysis {
  // primeira linha não vazia é o cabeçalho
  const start = sheet.rows.findIndex((r) => r.some((c) => text(c) !== ''));
  if (start < 0) return { total: 0, valid: 0, errors: [{ row: null, column: null, message: 'A planilha está vazia.' }], students: [] };
  const { map, errors } = mapHeaders(sheet.rows[start]);
  if (errors.some((e) => e.row === null)) return { total: 0, valid: 0, errors, students: [] };

  const plans = new Map(ctx.plans.map((p) => [nameKey(p.name), p]));
  const byEmail = new Map(ctx.existing.map((e) => [e.email.toLowerCase(), e.name]));
  const byNameBirth = new Map(ctx.existing.map((e) => [`${nameKey(e.name)}|${e.birthDate}`, e.name]));
  const seenEmail = new Map<string, number>();
  const seenNameBirth = new Map<string, number>();

  const students: ImportedStudent[] = [];
  let total = 0;
  for (let i = start + 1; i < sheet.rows.length; i++) {
    const r = sheet.rows[i];
    if (!r.some((c) => text(c) !== '')) continue; // linha em branco
    total++;
    const row = i + 1; // numeração da planilha
    if (total > MAX_ROWS) {
      errors.push({ row: null, column: null, message: `A planilha passa de ${MAX_ROWS} alunos. Divida em arquivos menores.` });
      break;
    }
    const cell = (k: ColumnKey) => (map.has(k) ? r[map.get(k)!] : undefined);
    const col = (k: ColumnKey) => IMPORT_COLUMNS.find((c) => c.key === k)!.header;
    const rowErrors: ImportError[] = [];
    const err = (k: ColumnKey | null, message: string) => rowErrors.push({ row, column: k ? col(k) : null, message });

    const name = text(cell('name'));
    if (name.length < 3) err('name', name ? 'Nome muito curto.' : 'Informe o nome.');

    const email = text(cell('email')).toLowerCase();
    if (!email) err('email', 'Informe o e-mail.');
    else if (!EMAIL.test(email)) err('email', `E-mail inválido: "${email}".`);

    const birthDate = parseDate(cell('birthDate'));
    if (birthDate === '') err('birthDate', 'Informe a data de nascimento.');
    else if (birthDate === null) err('birthDate', `Data inválida: "${text(cell('birthDate'))}". Use dd/mm/aaaa.`);
    else if (birthDate > ctx.today) err('birthDate', 'Data de nascimento no futuro.');

    const g = nameKey(text(cell('gender')));
    const gender = g ? GENDER[g] ?? null : null;
    if (g && !gender) err('gender', `Sexo inválido: "${text(cell('gender'))}". Use M ou F.`);

    const phone = parsePhone(cell('phone'));
    if (phone === null) err('phone', `Telefone inválido: "${text(cell('phone'))}". Inclua o DDD.`);

    const st = nameKey(text(cell('status')));
    const status = st ? STATUS[st] : 'ACTIVE';
    if (!status) err('status', `Status inválido: "${text(cell('status'))}". Use Ativo, Inativo ou Trancado.`);

    const planName = text(cell('plan'));
    const plan = planName ? plans.get(nameKey(planName)) : undefined;
    if (planName && !plan)
      err('plan', `Plano "${planName}" não cadastrado.${ctx.plans.length ? ` Planos: ${ctx.plans.map((p) => p.name).join(', ')}.` : ' Cadastre em Configurações ou deixe em branco.'}`);

    let fee = parseMoney(cell('monthlyFee'));
    if (fee === null && plan) fee = plan.price;
    if (fee === null) err('monthlyFee', 'Informe a mensalidade (ou um plano).');
    else if (Number.isNaN(fee) || fee < 0) err('monthlyFee', `Valor inválido: "${text(cell('monthlyFee'))}".`);

    const dueText = text(cell('dueDay'));
    const dueDay = Number(dueText);
    if (!dueText) err('dueDay', 'Informe o dia de vencimento.');
    else if (!Number.isInteger(dueDay) || !ctx.dueDays.includes(dueDay))
      err('dueDay', `Dia de vencimento "${dueText}" não está entre os dias da academia (${ctx.dueDays.join(', ')}).`);

    let startDate = parseDate(cell('startDate'));
    if (startDate === null) err('startDate', `Data inválida: "${text(cell('startDate'))}". Use dd/mm/aaaa.`);
    else if (startDate === '') startDate = ctx.today;

    const guardianPhone = parsePhone(cell('guardianPhone'));
    if (guardianPhone === null) err('guardianPhone', `Telefone inválido: "${text(cell('guardianPhone'))}". Inclua o DDD.`);

    const c = nameKey(text(cell('consent')));
    if (c && !YES.has(c) && !NO.has(c)) err('consent', `Use Sim ou Não (veio "${text(cell('consent'))}").`);

    // duplicados: mesmo e-mail OU mesmo nome + nascimento
    if (email && EMAIL.test(email)) {
      const db = byEmail.get(email);
      if (db) err('email', `Já existe um aluno com esse e-mail: ${db}.`);
      const prev = seenEmail.get(email);
      if (prev) err('email', `E-mail repetido na planilha (linha ${prev}).`);
      else seenEmail.set(email, row);
    }
    if (name.length >= 3 && birthDate) {
      const k = `${nameKey(name)}|${birthDate}`;
      const db = byNameBirth.get(k);
      if (db) err('name', `Aluno já cadastrado: ${db} (mesmo nome e nascimento).`);
      const prev = seenNameBirth.get(k);
      if (prev) err('name', `Aluno repetido na planilha (linha ${prev}, mesmo nome e nascimento).`);
      else seenNameBirth.set(k, row);
    }

    if (rowErrors.length) {
      errors.push(...rowErrors);
      continue;
    }
    students.push({
      row,
      name,
      email,
      birthDate: birthDate!,
      gender,
      phone: phone || null,
      status: status!,
      planId: plan?.id ?? null,
      monthlyFee: fee!,
      dueDay,
      startDate: startDate!,
      medicalNotes: text(cell('medicalNotes')) || null,
      guardianName: text(cell('guardianName')) || null,
      guardianRelation: text(cell('guardianRelation')) || null,
      guardianPhone: guardianPhone || null,
      consent: YES.has(c),
    });
  }
  if (total === 0 && !errors.length) errors.push({ row: null, column: null, message: 'Nenhum aluno encontrado na planilha.' });
  return { total, valid: students.length, errors, students };
}
