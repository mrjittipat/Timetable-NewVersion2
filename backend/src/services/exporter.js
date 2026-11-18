import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { ASSET_DIR, FONT_DIR } from './paths.js';
import { toCsv } from './csv.js';
import { OUTPUT_FIELDS } from './schema.js';
import { DEFAULT_CONFIG } from './config.js';
import { buildGrid, entitiesFor, subjectSummary, VIEWS } from './grid.js';

const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });

function docInfo(ctx) {
  return { ...DEFAULT_CONFIG.document, ...(ctx.config?.document || {}) };
}

function collectTargets(rows, ctx, view = 'group', id = '') {
  const list = [];
  const views = view === 'all' ? VIEWS : VIEWS.includes(view) ? [view] : ['group'];
  for (const v of views) {
    const ents = entitiesFor(v, ctx);
    const filtered = id ? ents.filter((e) => e.id === id) : ents;
    for (const entity of filtered) {
      list.push({
        view: v,
        entity,
        grid: buildGrid(v, entity.id, rows, ctx),
        summary: subjectSummary(v, entity.id, rows, ctx),
      });
    }
  }
  return list;
}

function whoText(view, span) {
  const groups = (span.groups || []).join('+');
  if (view === 'teacher') return groups;
  if (view === 'group') return span.teacher || '';
  return `${groups} ${span.teacher || ''}`.trim();
}

function clipText(doc, text, maxWidth) {
  const str = String(text ?? '');
  if (!str || maxWidth <= 4) return '';
  if (doc.widthOfString(str) <= maxWidth) return str;
  const clusters = [...segmenter.segment(str)].map((s) => s.segment);
  let lo = 0;
  let hi = clusters.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${clusters.slice(0, mid).join('')}…`;
    if (doc.widthOfString(candidate) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${clusters.slice(0, lo).join('')}…` : '…';
}

function signaturesFor(entity, info) {
  return [
    { name: entity.signerName || '', role: entity.signer || '' },
    { name: info.curriculumHeadName || '', role: 'หัวหน้างานพัฒนาหลักสูตร' },
    { name: info.deputyName || '', role: 'รองผู้อำนวยการฝ่ายวิชาการ' },
    { name: info.directorName || '', role: `ผู้อำนวยการ${info.college}` },
  ];
}

export function exportCsv(rows) {
  return toCsv(rows || [], OUTPUT_FIELDS);
}

export function exportPdf(rows, ctx, { view = 'group', id = '' } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24, autoFirstPage: false });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const regFont = path.join(FONT_DIR, 'Sarabun-Regular.ttf');
    const boldFont = path.join(FONT_DIR, 'Sarabun-Bold.ttf');
    doc.registerFont('th', regFont);
    doc.registerFont('th-bold', boldFont);

    const logoPath = path.join(ASSET_DIR, 'logo.png');
    const hasLogo = fs.existsSync(logoPath);
    const info = docInfo(ctx);
    const semesterText = `${info.semester}/${info.year}`;
    const targets = collectTargets(rows, ctx, view, id);
    const printTime = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    if (targets.length === 0) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 24 });
      doc.page.margins.bottom = 0;
      doc.font('th-bold').fontSize(16).fillColor('#000').text('ไม่พบข้อมูลตาราง', 0, 260, { align: 'center' });
      doc.end();
      return;
    }

    for (const { view: v, entity, grid, summary } of targets) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 24 });
      doc.page.margins.bottom = 0;
      doc.lineWidth(0.7).strokeColor('#000').fillColor('#000');

      const x0 = 24;
      const y0 = 24;
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const W = pageW - 48;

      const subList = summary.list;
      const per = Math.max(8, Math.ceil(subList.length / 2));
      const rowH = Math.min(15, 150 / per);
      const topH = 18 + per * rowH + 16;

      // Left info box (230 pt)
      const leftW = 230;
      doc.rect(x0, y0, leftW, topH).stroke();

      const infoLines = [['ภาคเรียน', semesterText], ...entity.info];
      if (hasLogo) {
        doc.image(logoPath, x0 + (leftW - 38) / 2, y0 + 5, { width: 38, height: 38 });
        doc.font('th-bold').fontSize(13.5).text(clipText(doc, info.college, leftW - 12), x0 + 6, y0 + 45, {
          width: leftW - 12,
          align: 'center',
          lineBreak: false,
        });
        doc.font('th-bold').fontSize(11.5).text(clipText(doc, entity.heading, leftW - 12), x0 + 6, y0 + 62, {
          width: leftW - 12,
          align: 'center',
          lineBreak: false,
        });
        let iy = y0 + 80;
        const valX = x0 + 76;
        const valW = leftW - 84;
        for (const [lbl, val] of infoLines) {
          const valStr = String(val || '-');
          doc.font('th-bold').fontSize(10).text(lbl, x0 + 10, iy, { width: 64, lineBreak: false });
          doc.font('th').fontSize(10);
          const hUsed = Math.min(26, doc.heightOfString(valStr, { width: valW, lineGap: -2 }));
          doc.text(valStr, valX, iy, { width: valW, height: 26, lineGap: -2 });
          iy += Math.max(15, hUsed + 4);
        }
      } else {
        doc.font('th-bold').fontSize(16).text(clipText(doc, info.college, leftW - 12), x0 + 6, y0 + 14, {
          width: leftW - 12,
          align: 'center',
          lineBreak: false,
        });
        doc.font('th-bold').fontSize(13).text(clipText(doc, entity.heading, leftW - 12), x0 + 6, y0 + 36, {
          width: leftW - 12,
          align: 'center',
          lineBreak: false,
        });
        let iy = y0 + 60;
        const valX = x0 + 76;
        const valW = leftW - 84;
        for (const [lbl, val] of infoLines) {
          const valStr = String(val || '-');
          doc.font('th-bold').fontSize(10.5).text(lbl, x0 + 10, iy, { width: 64, lineBreak: false });
          doc.font('th').fontSize(10.5);
          const hUsed = Math.min(28, doc.heightOfString(valStr, { width: valW, lineGap: -2 }));
          doc.text(valStr, valX, iy, { width: valW, height: 28, lineGap: -2 });
          iy += Math.max(18, hUsed + 5);
        }
      }

      // Right side: 2 subject-table halves
      const halfW = (W - leftW) / 2;
      const codeW = 64;
      const numW = 19;
      const nameW = halfW - codeW - 4 * numW;
      const colWidths = [codeW, nameW, numW, numW, numW, numW];
      const headers = ['รหัสวิชา', 'ชื่อรายวิชา', 'ท.', 'ป.', 'น.', 'ช.'];

      for (let h = 0; h < 2; h++) {
        const hx = x0 + leftW + h * halfW;
        // Header row
        let cx = hx;
        doc.font('th-bold').fontSize(8.5);
        for (let ci = 0; ci < colWidths.length; ci++) {
          doc.rect(cx, y0, colWidths[ci], 18).stroke();
          doc.text(headers[ci], cx + 2, y0 + 4, { width: colWidths[ci] - 4, align: 'center', lineBreak: false });
          cx += colWidths[ci];
        }
        // Data rows
        doc.font('th').fontSize(8);
        for (let r = 0; r < per; r++) {
          const ry = y0 + 18 + r * rowH;
          const item = subList[h * per + r];
          cx = hx;
          for (let ci = 0; ci < colWidths.length; ci++) {
            doc.rect(cx, ry, colWidths[ci], rowH).stroke();
            if (item) {
              const vals = [item.subject_id, item.name, item.t, item.p, item.n, item.h];
              const pad = ci === 1 ? 3 : 2;
              const align = ci === 1 ? 'left' : 'center';
              const txt = clipText(doc, vals[ci], colWidths[ci] - pad * 2);
              doc.text(txt, cx + pad, ry + (rowH - 9) / 2, { width: colWidths[ci] - pad * 2, align, lineBreak: false });
            }
            cx += colWidths[ci];
          }
        }
        // Total row
        const ty = y0 + 18 + per * rowH;
        doc.font('th-bold').fontSize(8.5);
        if (h === 0) {
          const lblW = codeW + nameW;
          doc.rect(hx, ty, lblW, 16).stroke();
          doc.text('รวม', hx + 4, ty + 3, { width: lblW - 8, align: 'right', lineBreak: false });
          let nx = hx + lblW;
          for (const val of [summary.total.t, summary.total.p, summary.total.n, summary.total.h]) {
            doc.rect(nx, ty, numW, 16).stroke();
            doc.text(String(val), nx + 2, ty + 3, { width: numW - 4, align: 'center', lineBreak: false });
            nx += numW;
          }
        } else {
          doc.rect(hx, ty, halfW, 16).stroke();
          doc.text(`รวม ${grid.total} คาบ/สัปดาห์`, hx + 4, ty + 3, {
            width: halfW - 8,
            align: 'center',
            lineBreak: false,
          });
        }
      }

      // Day Grid
      const gridTop = y0 + topH + 8;
      const dayW = 58;
      const pCount = grid.periods.length;
      const colW = (W - dayW) / Math.max(1, pCount);
      const rowHeight = Math.min(70, (pageH - 24 - 54 - 14 - (gridTop + 32)) / Math.max(1, grid.days.length));

      // Header row 1: เวลา
      doc.rect(x0, gridTop, dayW, 16).stroke();
      doc.font('th-bold').fontSize(8.5).text('เวลา', x0 + 2, gridTop + 3, { width: dayW - 4, align: 'center', lineBreak: false });
      doc.font('th').fontSize(7.5);
      for (let pi = 0; pi < pCount; pi++) {
        const px = x0 + dayW + pi * colW;
        const p = grid.periods[pi];
        doc.rect(px, gridTop, colW, 16).stroke();
        doc.text(clipText(doc, `${p.start}-${p.end}`, colW - 4), px + 2, gridTop + 4, {
          width: colW - 4,
          align: 'center',
          lineBreak: false,
        });
      }

      // Header row 2: วัน/คาบ
      const r2y = gridTop + 16;
      doc.rect(x0, r2y, dayW, 16).stroke();
      doc.font('th-bold').fontSize(9).text('วัน/คาบ', x0 + 2, r2y + 3, { width: dayW - 4, align: 'center', lineBreak: false });
      for (let pi = 0; pi < pCount; pi++) {
        const px = x0 + dayW + pi * colW;
        doc.rect(px, r2y, colW, 16).stroke();
        doc.text(String(grid.periods[pi].period), px + 2, r2y + 3, {
          width: colW - 4,
          align: 'center',
          lineBreak: false,
        });
      }

      // Day rows
      const pIndex = new Map(grid.periods.map((p, idx) => [p.period, idx]));
      for (let di = 0; di < grid.days.length; di++) {
        const dy = gridTop + 32 + di * rowHeight;
        doc.rect(x0, dy, dayW, rowHeight).stroke();
        doc.font('th-bold').fontSize(11).text(grid.days[di].label, x0 + 2, dy + (rowHeight - 13) / 2, {
          width: dayW - 4,
          align: 'center',
          lineBreak: false,
        });

        const daySpans = grid.cells[di] || [];
        const covered = new Set();
        for (const sp of daySpans) {
          const startIdx = pIndex.get(sp.start);
          if (startIdx === undefined) continue;
          for (let k = 0; k < sp.span; k++) covered.add(startIdx + k);
          const sx = x0 + dayW + startIdx * colW;
          const sw = sp.span * colW;
          doc.rect(sx, dy, sw, rowHeight).stroke();

          const lines = [{ text: sp.subject_id, font: 'th-bold', size: 9 }];
          const who = whoText(v, sp);
          if (who) lines.push({ text: who, font: 'th', size: 7.5 });
          if (v !== 'room' && sp.room) lines.push({ text: sp.room, font: 'th', size: 7.5 });

          const blockH = (lines.length - 1) * 11 + 10;
          let ly = dy + (rowHeight - blockH) / 2;
          for (const ln of lines) {
            doc.font(ln.font).fontSize(ln.size);
            doc.text(clipText(doc, ln.text, sw - 6), sx + 3, ly, {
              width: sw - 6,
              align: 'center',
              lineBreak: false,
            });
            ly += 11;
          }
        }

        for (let pi = 0; pi < pCount; pi++) {
          if (covered.has(pi)) continue;
          const px = x0 + dayW + pi * colW;
          const pMeta = grid.periods[pi];
          doc.rect(px, dy, colW, rowHeight).stroke();
          if (pMeta.isHomeroom) {
            doc.font('th-bold').fontSize(8).text('Homeroom', px + 2, dy + (rowHeight - 10) / 2, {
              width: colW - 4,
              align: 'center',
              lineBreak: false,
            });
          } else if (pMeta.isBreak) {
            doc.font('th-bold').fontSize(11).text('พัก', px + 2, dy + (rowHeight - 13) / 2, {
              width: colW - 4,
              align: 'center',
              lineBreak: false,
            });
          }
        }
      }

      // Signatures (4 equal columns)
      const sigTop = gridTop + 32 + grid.days.length * rowHeight + 16;
      const sigW = W / 4;
      const sigs = signaturesFor(entity, info);
      doc.font('th').fontSize(10.5);
      for (let i = 0; i < 4; i++) {
        const sx = x0 + i * sigW;
        const nm = sigs[i].name || '........................................';
        doc.text('ลงชื่อ .......................................', sx + 4, sigTop, {
          width: sigW - 8,
          align: 'center',
          lineBreak: false,
        });
        doc.text(clipText(doc, `( ${nm} )`, sigW - 8), sx + 4, sigTop + 16, {
          width: sigW - 8,
          align: 'center',
          lineBreak: false,
        });
        doc.text(clipText(doc, sigs[i].role, sigW - 8), sx + 4, sigTop + 32, {
          width: sigW - 8,
          align: 'center',
          lineBreak: false,
        });
      }

      // Footer
      doc.font('th').fontSize(7).fillColor('#444').text(`พิมพ์เมื่อ ${printTime}`, x0, pageH - 18, {
        width: W,
        align: 'right',
        lineBreak: false,
      });
    }

    doc.end();
  });
}

function thinBorder() {
  const side = { style: 'thin', color: { argb: 'FF000000' } };
  return { top: side, left: side, bottom: side, right: side };
}

function boxOutline(ws, r1, c1, r2, c2) {
  const b = { style: 'thin', color: { argb: 'FF000000' } };
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      cell.border = {
        top: r === r1 ? b : cell.border?.top,
        bottom: r === r2 ? b : cell.border?.bottom,
        left: c === c1 ? b : cell.border?.left,
        right: c === c2 ? b : cell.border?.right,
      };
    }
  }
}

export async function exportXlsx(rows, ctx, { view = 'all', id = '' } = {}) {
  const wb = new ExcelJS.Workbook();
  const info = docInfo(ctx);
  const semesterText = `${info.semester}/${info.year}`;
  const targets = collectTargets(rows, ctx, view, id);
  const usedNames = new Set();

  for (const { view: v, entity, grid, summary } of targets) {
    const prefix = v === 'group' ? 'กลุ่ม' : v === 'teacher' ? 'ครู' : 'ห้อง';
    let sName = `${prefix} ${entity.id}`.replace(/[\\/*?:[\]]/g, '-').slice(0, 31);
    let n = 2;
    while (usedNames.has(sName)) {
      sName = `${prefix} ${entity.id}-${n++}`.replace(/[\\/*?:[\]]/g, '-').slice(0, 31);
    }
    usedNames.add(sName);

    const pCount = grid.periods.length;
    const k = Math.max(3, Math.ceil(36 / Math.max(1, pCount)));
    const cols = 2 + k * pCount;

    const ws = wb.addWorksheet(sName, {
      views: [{ showGridLines: false }],
      pageSetup: {
        orientation: 'landscape',
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        horizontalCentered: true,
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      },
    });

    for (let c = 1; c <= cols; c++) {
      ws.getColumn(c).width = c <= 2 ? 6 : 4.6;
    }

    const subList = summary.list;
    const per = Math.max(8, Math.ceil(subList.length / 2));
    const headerRows = per + 2;
    for (let r = 1; r <= headerRows; r++) ws.getRow(r).height = 18;

    // Left box
    const leftU = Math.max(8, cols - 26);
    boxOutline(ws, 1, 1, headerRows, leftU);

    ws.mergeCells(1, 1, 2, leftU);
    ws.getCell(1, 1).value = info.college;
    ws.getCell(1, 1).font = { name: 'TH SarabunPSK', size: 18, bold: true };
    ws.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.mergeCells(3, 1, 3, leftU);
    ws.getCell(3, 1).value = entity.heading;
    ws.getCell(3, 1).font = { name: 'TH SarabunPSK', size: 15, bold: true };
    ws.getCell(3, 1).alignment = { horizontal: 'center', vertical: 'middle' };

    const infoLines = [['ภาคเรียน', semesterText], ...entity.info];
    infoLines.forEach(([lbl, val], idx) => {
      const r = 5 + idx;
      if (r <= headerRows) {
        ws.mergeCells(r, 1, r, leftU);
        const cell = ws.getCell(r, 1);
        cell.value = {
          richText: [
            { text: `  ${lbl}: `, font: { name: 'TH SarabunPSK', size: 13, bold: true } },
            { text: String(val || '-'), font: { name: 'TH SarabunPSK', size: 13 } },
          ],
        };
        cell.alignment = { horizontal: 'left', vertical: 'middle', shrinkToFit: true };
      }
    });

    // Right 2 halves (13 units each: code 3, name 6, ท ป น ช 1 each)
    const halfCols = [
      { label: 'รหัสวิชา', span: 3 },
      { label: 'ชื่อรายวิชา', span: 6 },
      { label: 'ท.', span: 1 },
      { label: 'ป.', span: 1 },
      { label: 'น.', span: 1 },
      { label: 'ช.', span: 1 },
    ];
    for (let h = 0; h < 2; h++) {
      const startCol = leftU + 1 + h * 13;
      let cc = startCol;
      for (const col of halfCols) {
        if (col.span > 1) ws.mergeCells(1, cc, 1, cc + col.span - 1);
        const cell = ws.getCell(1, cc);
        cell.value = col.label;
        cell.font = { name: 'TH SarabunPSK', size: 12, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        for (let i = 0; i < col.span; i++) ws.getCell(1, cc + i).border = thinBorder();
        cc += col.span;
      }

      for (let r = 0; r < per; r++) {
        const rr = 2 + r;
        const item = subList[h * per + r];
        const vals = item ? [item.subject_id, item.name, item.t, item.p, item.n, item.h] : ['', '', '', '', '', ''];
        cc = startCol;
        halfCols.forEach((col, ci) => {
          if (col.span > 1) ws.mergeCells(rr, cc, rr, cc + col.span - 1);
          const cell = ws.getCell(rr, cc);
          cell.value = vals[ci];
          cell.font = { name: 'TH SarabunPSK', size: 11 };
          cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle', shrinkToFit: true };
          for (let i = 0; i < col.span; i++) ws.getCell(rr, cc + i).border = thinBorder();
          cc += col.span;
        });
      }

      const totRow = headerRows;
      if (h === 0) {
        ws.mergeCells(totRow, startCol, totRow, startCol + 8);
        const lblCell = ws.getCell(totRow, startCol);
        lblCell.value = 'รวม';
        lblCell.font = { name: 'TH SarabunPSK', size: 12, bold: true };
        lblCell.alignment = { horizontal: 'right', vertical: 'middle' };
        for (let i = 0; i < 9; i++) ws.getCell(totRow, startCol + i).border = thinBorder();
        [summary.total.t, summary.total.p, summary.total.n, summary.total.h].forEach((val, idx) => {
          const cell = ws.getCell(totRow, startCol + 9 + idx);
          cell.value = val;
          cell.font = { name: 'TH SarabunPSK', size: 12, bold: true };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = thinBorder();
        });
      } else {
        ws.mergeCells(totRow, startCol, totRow, startCol + 12);
        const cell = ws.getCell(totRow, startCol);
        cell.value = `รวม ${grid.total} คาบ/สัปดาห์`;
        cell.font = { name: 'TH SarabunPSK', size: 12, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        for (let i = 0; i < 13; i++) ws.getCell(totRow, startCol + i).border = thinBorder();
      }
    }

    // Grid rows
    const gStart = per + 4;
    ws.getRow(gStart).height = 20;
    ws.getRow(gStart + 1).height = 20;

    ws.mergeCells(gStart, 1, gStart, 2);
    ws.getCell(gStart, 1).value = 'เวลา';
    ws.getCell(gStart, 1).font = { name: 'TH SarabunPSK', size: 11, bold: true };
    ws.getCell(gStart, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(gStart, 1).border = thinBorder();
    ws.getCell(gStart, 2).border = thinBorder();

    ws.mergeCells(gStart + 1, 1, gStart + 1, 2);
    ws.getCell(gStart + 1, 1).value = 'วัน/คาบ';
    ws.getCell(gStart + 1, 1).font = { name: 'TH SarabunPSK', size: 12, bold: true };
    ws.getCell(gStart + 1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(gStart + 1, 1).border = thinBorder();
    ws.getCell(gStart + 1, 2).border = thinBorder();

    grid.periods.forEach((p, pi) => {
      const c1 = 3 + pi * k;
      const c2 = c1 + k - 1;
      ws.mergeCells(gStart, c1, gStart, c2);
      const tCell = ws.getCell(gStart, c1);
      tCell.value = `${p.start}-${p.end}`;
      tCell.font = { name: 'TH SarabunPSK', size: 10 };
      tCell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };

      ws.mergeCells(gStart + 1, c1, gStart + 1, c2);
      const pCell = ws.getCell(gStart + 1, c1);
      pCell.value = p.period;
      pCell.font = { name: 'TH SarabunPSK', size: 12, bold: true };
      pCell.alignment = { horizontal: 'center', vertical: 'middle' };

      for (let c = c1; c <= c2; c++) {
        ws.getCell(gStart, c).border = thinBorder();
        ws.getCell(gStart + 1, c).border = thinBorder();
      }
    });

    const pIndex = new Map(grid.periods.map((p, idx) => [p.period, idx]));
    grid.days.forEach((day, di) => {
      const rr = gStart + 2 + di;
      ws.getRow(rr).height = 72;
      ws.mergeCells(rr, 1, rr, 2);
      const dCell = ws.getCell(rr, 1);
      dCell.value = day.label;
      dCell.font = { name: 'TH SarabunPSK', size: 13, bold: true };
      dCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(rr, 1).border = thinBorder();
      ws.getCell(rr, 2).border = thinBorder();

      const covered = new Set();
      for (const sp of grid.cells[di] || []) {
        const startIdx = pIndex.get(sp.start);
        if (startIdx === undefined) continue;
        for (let s = 0; s < sp.span; s++) covered.add(startIdx + s);
        const c1 = 3 + startIdx * k;
        const c2 = c1 + sp.span * k - 1;
        ws.mergeCells(rr, c1, rr, c2);
        const cell = ws.getCell(rr, c1);
        const richText = [{ text: sp.subject_id, font: { name: 'TH SarabunPSK', size: 12, bold: true } }];
        const who = whoText(v, sp);
        if (who) richText.push({ text: `\n${who}`, font: { name: 'TH SarabunPSK', size: 11 } });
        if (v !== 'room' && sp.room) richText.push({ text: `\n${sp.room}`, font: { name: 'TH SarabunPSK', size: 11 } });
        cell.value = { richText };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, shrinkToFit: true };
        for (let c = c1; c <= c2; c++) ws.getCell(rr, c).border = thinBorder();
      }

      grid.periods.forEach((p, pi) => {
        if (covered.has(pi)) return;
        const c1 = 3 + pi * k;
        const c2 = c1 + k - 1;
        ws.mergeCells(rr, c1, rr, c2);
        const cell = ws.getCell(rr, c1);
        if (p.isHomeroom) {
          cell.value = 'Homeroom';
          cell.font = { name: 'TH SarabunPSK', size: 11, bold: true };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (p.isBreak) {
          cell.value = 'พัก';
          cell.font = { name: 'TH SarabunPSK', size: 13, bold: true };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
        for (let c = c1; c <= c2; c++) ws.getCell(rr, c).border = thinBorder();
      });
    });

    // Signatures 2 rows below grid
    const sigRow = gStart + 2 + grid.days.length + 2;
    const sigGroupW = Math.floor(cols / 4);
    const sigs = signaturesFor(entity, info);
    for (let r = sigRow; r <= sigRow + 2; r++) ws.getRow(r).height = 20;

    for (let i = 0; i < 4; i++) {
      const c1 = 1 + i * sigGroupW;
      const c2 = i === 3 ? cols : c1 + sigGroupW - 1;
      const nm = sigs[i].name || '....................................';
      ws.mergeCells(sigRow, c1, sigRow, c2);
      ws.getCell(sigRow, c1).value = 'ลงชื่อ ....................................';
      ws.getCell(sigRow, c1).font = { name: 'TH SarabunPSK', size: 14 };
      ws.getCell(sigRow, c1).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(sigRow + 1, c1, sigRow + 1, c2);
      ws.getCell(sigRow + 1, c1).value = `( ${nm} )`;
      ws.getCell(sigRow + 1, c1).font = { name: 'TH SarabunPSK', size: 14 };
      ws.getCell(sigRow + 1, c1).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(sigRow + 2, c1, sigRow + 2, c2);
      ws.getCell(sigRow + 2, c1).value = sigs[i].role;
      ws.getCell(sigRow + 2, c1).font = { name: 'TH SarabunPSK', size: 14 };
      ws.getCell(sigRow + 2, c1).alignment = { horizontal: 'center', vertical: 'middle' };
    }

    const lastColLetter = ws.getColumn(cols).letter;
    ws.pageSetup.printArea = `A1:${lastColLetter}${sigRow + 2}`;
  }

  // Raw output sheet
  const outWs = wb.addWorksheet('output');
  const hdrRow = outWs.addRow(OUTPUT_FIELDS);
  hdrRow.eachCell((cell) => {
    cell.font = { name: 'TH SarabunPSK', size: 13, bold: true };
    cell.border = thinBorder();
  });
  for (const r of rows) {
    const row = outWs.addRow(OUTPUT_FIELDS.map((f) => r[f]));
    row.eachCell((cell) => {
      cell.font = { name: 'TH SarabunPSK', size: 12 };
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function exportQrPdf(items = [], ctx) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 24, autoFirstPage: false });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('th', path.join(FONT_DIR, 'Sarabun-Regular.ttf'));
    doc.registerFont('th-bold', path.join(FONT_DIR, 'Sarabun-Bold.ttf'));

    const info = docInfo(ctx);
    if (items.length === 0) {
      doc.addPage({ size: 'A4', layout: 'portrait', margin: 24 });
      doc.font('th-bold').fontSize(14).text('ไม่พบข้อมูล QR', 0, 300, { align: 'center' });
      doc.end();
      return;
    }

    const perPage = 6;
    const cols = 2;
    const rowsPerPage = 3;
    const margin = 24;
    const gap = 14;

    for (let i = 0; i < items.length; i += perPage) {
      doc.addPage({ size: 'A4', layout: 'portrait', margin });
      doc.page.margins.bottom = 0;
      const cw = (doc.page.width - margin * 2 - gap) / cols;
      const ch = (doc.page.height - margin * 2 - gap * (rowsPerPage - 1)) / rowsPerPage;

      for (let k = 0; k < perPage && i + k < items.length; k++) {
        const item = items[i + k];
        const col = k % cols;
        const row = Math.floor(k / cols);
        const cx = margin + col * (cw + gap);
        const cy = margin + row * (ch + gap);

        doc.save();
        doc.dash(4, { space: 3 }).strokeColor('#999').lineWidth(0.8).rect(cx, cy, cw, ch).stroke();
        doc.undash().restore();

        doc.fillColor('#000').font('th-bold').fontSize(11).text(clipText(doc, info.college, cw - 16), cx + 8, cy + 12, {
          width: cw - 16,
          align: 'center',
          lineBreak: false,
        });
        doc.font('th-bold').fontSize(12.5).text(clipText(doc, item.title, cw - 16), cx + 8, cy + 30, {
          width: cw - 16,
          align: 'center',
          lineBreak: false,
        });

        const qrSize = Math.min(124, ch - 108);
        doc.image(item.qrPng, cx + (cw - qrSize) / 2, cy + 54, { width: qrSize, height: qrSize });

        doc.font('th').fontSize(9.5).fillColor('#222').text('สแกนเพื่อดูตารางเรียนล่าสุด', cx + 8, cy + 54 + qrSize + 8, {
          width: cw - 16,
          align: 'center',
          lineBreak: false,
        });
        doc.font('th').fontSize(7.5).fillColor('#666').text(clipText(doc, item.url, cw - 16), cx + 8, cy + 54 + qrSize + 24, {
          width: cw - 16,
          align: 'center',
          lineBreak: false,
        });
      }
    }

    doc.end();
  });
}
