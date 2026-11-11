import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import * as iconv from 'iconv-lite';
import { Cell, RawSheet } from '../../../domain/student-import';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Lê .xlsx ou .csv para uma grade de células. */
export async function readSheet(file: { buffer: Buffer; originalname: string }): Promise<RawSheet> {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.xlsx')) return readXlsx(file.buffer);
  if (name.endsWith('.csv') || name.endsWith('.txt')) return readCsv(file.buffer);
  throw new BadRequestException('Envie um arquivo .xlsx ou .csv. Arquivos .xls antigos: abra no Excel e salve como .xlsx.');
}

async function readXlsx(buf: Buffer): Promise<RawSheet> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException('Não foi possível ler a planilha. Confira se é um arquivo .xlsx válido.');
  }
  const ws = wb.getWorksheet('Alunos') ?? wb.worksheets.find((w) => w.state === 'visible') ?? wb.worksheets[0];
  if (!ws) throw new BadRequestException('A planilha não tem abas.');
  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const cells: Cell[] = [];
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      cells[c - 1] = cellValue(cell.value);
    });
    rows[n - 1] = cells;
  });
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];
  return { rows };
}

/** Converte os tipos de célula do ExcelJS (fórmula, rich text, hyperlink…) em valor simples. */
function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (v instanceof Date || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return String((v as ExcelJS.CellHyperlinkValue).text);
    if ('error' in v) return null;
  }
  return String(v);
}

/**
 * CSV: aceita UTF-8 (com ou sem BOM) e Windows-1252 (o "CSV" do Excel em
 * português), separado por ; ou , (detectado pelo cabeçalho).
 */
function readCsv(buf: Buffer): RawSheet {
  let txt: string;
  try {
    txt = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    txt = iconv.decode(buf, 'win1252');
  }
  txt = txt.replace(/^﻿/, '');
  const first = txt.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => first.split(ch).length - 1;
  const delimiter = count(';') >= count(',') && count(';') > 0 ? ';' : count('\t') > count(',') ? '\t' : ',';
  try {
    const rows = parse(txt, { delimiter, relax_column_count: true, relax_quotes: true, skip_empty_lines: false, trim: true }) as string[][];
    return { rows };
  } catch (e) {
    throw new BadRequestException(`Não foi possível ler o CSV: ${(e as Error).message}`);
  }
}
