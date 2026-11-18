import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';

export function parseCsv(text) {
  const clean = String(text ?? '').replace(/^\uFEFF/, '');
  if (!clean.trim()) return [];
  return parse(clean, {
    columns: (headers) => headers.map((h) => String(h ?? '').replace(/^\uFEFF/, '').trim()),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}

export function toCsv(rows, fields) {
  return stringify(rows, { header: true, columns: fields });
}

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const h = v.getUTCHours();
    const m = String(v.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? '').join('').trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return cellText(v.result);
    if (v.hyperlink) return String(v.text || v.hyperlink).trim();
  }
  return String(v).trim();
}

export async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const out = {};
  for (const ws of wb.worksheets) {
    let headers = null;
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = [];
      for (let i = 1; i <= row.cellCount; i++) vals.push(cellText(row.getCell(i).value));
      if (!vals.some(Boolean)) return;
      if (!headers) {
        headers = vals.map((h) => h.replace(/^\uFEFF/, '').trim());
        return;
      }
      const obj = {};
      for (let i = 0; i < headers.length; i++) {
        if (headers[i]) obj[headers[i]] = vals[i] ?? '';
      }
      rows.push(obj);
    });
    out[ws.name] = rows;
  }
  return out;
}
