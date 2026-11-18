import { toCsv } from './csv.js';
import { OUTPUT_FIELDS } from './schema.js';

export function exportCsv(rows) {
  return toCsv(rows || [], OUTPUT_FIELDS);
}

export async function exportPdf() {
  throw new Error('PDF export will be implemented in Step 6');
}

export async function exportXlsx() {
  throw new Error('Excel export will be implemented in Step 6');
}

export async function exportQrPdf() {
  throw new Error('QR PDF export will be implemented in Step 6');
}
