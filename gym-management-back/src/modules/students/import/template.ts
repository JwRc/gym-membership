import ExcelJS from 'exceljs';
import { IMPORT_COLUMNS } from '../../../domain/student-import';

const LISTS: Partial<Record<(typeof IMPORT_COLUMNS)[number]['key'], string[]>> = {
  gender: ['M', 'F'],
  status: ['Ativo', 'Inativo', 'Trancado'],
  consent: ['Sim', 'Não'],
};
const LAST_ROW = 2001;

/** Modelo .xlsx: aba "Alunos" (cabeçalho + listas suspensas), "Instruções" e "Listas" (oculta). */
export async function buildTemplate(opts: { academy: string; plans: string[]; dueDays: number[] }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestão de Academias';
  const ws = wb.addWorksheet('Alunos', { views: [{ state: 'frozen', ySplit: 1 }] });
  const info = wb.addWorksheet('Instruções');
  const lists = wb.addWorksheet('Listas', { state: 'veryHidden' });

  // listas suspensas ficam numa aba oculta (nomes de plano podem ter vírgula)
  const listCols: Record<string, string> = {};
  const values: Record<string, string[]> = {
    ...LISTS,
    plan: opts.plans,
    dueDay: opts.dueDays.map(String),
  } as Record<string, string[]>;
  let li = 1;
  for (const [key, vals] of Object.entries(values)) {
    if (!vals.length) continue;
    const col = lists.getColumn(li);
    vals.forEach((v, i) => (lists.getCell(i + 1, li).value = v));
    listCols[key] = `Listas!$${col.letter}$1:$${col.letter}$${vals.length}`;
    li++;
  }

  ws.columns = IMPORT_COLUMNS.map((c) => ({
    header: c.required ? `${c.header} *` : c.header,
    key: c.key,
    width: Math.max(14, c.header.length + 6),
  }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  head.height = 20;
  IMPORT_COLUMNS.forEach((c, i) => {
    head.getCell(i + 1).note = c.help;
    const col = ws.getColumn(i + 1);
    if (c.key === 'birthDate' || c.key === 'startDate') col.numFmt = 'dd/mm/yyyy';
    if (c.key === 'monthlyFee') col.numFmt = '#,##0.00';
    if (c.key === 'phone' || c.key === 'guardianPhone' || c.key === 'email' || c.key === 'name') col.numFmt = '@';
    const range = listCols[c.key];
    if (range)
      for (let r = 2; r <= LAST_ROW; r++)
        ws.getCell(r, i + 1).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [range],
          showErrorMessage: true,
          errorTitle: c.header,
          error: 'Escolha um valor da lista.',
        };
  });

  info.columns = [{ width: 28 }, { width: 14 }, { width: 70 }, { width: 22 }];
  info.addRow([`Importação de alunos · ${opts.academy}`]).font = { bold: true, size: 14 };
  info.addRow(['Preencha a aba "Alunos", uma linha por aluno, sem mudar os nomes das colunas. Colunas com * são obrigatórias.']);
  info.addRow(['Salve como .xlsx (ou .csv) e envie em Alunos › Importar. Se houver erros, o sistema mostra as linhas; corrija e envie de novo.']);
  info.addRow(['A importação só cadastra os alunos: não gera mensalidades nem matrícula em modalidades/turmas.']);
  info.addRow([]);
  const h = info.addRow(['Coluna', 'Obrigatória', 'Como preencher', 'Exemplo']);
  h.font = { bold: true };
  for (const c of IMPORT_COLUMNS) info.addRow([c.header, c.required ? 'Sim' : 'Não', c.help, c.example]);
  info.addRow([]);
  info.addRow(['Dias de vencimento da academia', '', opts.dueDays.join(', ')]);
  info.addRow(['Planos cadastrados', '', opts.plans.length ? opts.plans.join(', ') : 'Nenhum (deixe "Plano" em branco)']);
  info.getColumn(3).alignment = { wrapText: true, vertical: 'top' };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
