import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, OUTPUT_DIR, SEED_DIR } from './paths.js';
import { ENTITIES, OUTPUT_FIELDS, normalizeRow, rowKey } from './schema.js';
import { parseCsv, toCsv } from './csv.js';

let data = {};
let timetable = null;

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function normalizeOutputRow(r) {
  const out = {};
  for (const f of OUTPUT_FIELDS) {
    out[f] = r?.[f] === undefined || r?.[f] === null ? '' : String(r[f]).trim();
  }
  return out;
}

function dedupeRows(entity, rawRows) {
  const seen = new Set();
  const rows = [];
  for (const raw of rawRows) {
    const row = normalizeRow(entity, raw);
    const key = rowKey(entity, row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

function writeEntity(entity, rows) {
  const def = ENTITIES[entity];
  const filePath = path.join(DATA_DIR, def.file);
  fs.writeFileSync(filePath, toCsv(rows, def.fields), 'utf8');
}

export function init() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const loaded = {};
  for (const [entity, def] of Object.entries(ENTITIES)) {
    const dst = path.join(DATA_DIR, def.file);
    const src = path.join(SEED_DIR, def.file);
    if (!fs.existsSync(dst) && fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
    const text = fs.existsSync(dst) ? fs.readFileSync(dst, 'utf8') : '';
    loaded[entity] = dedupeRows(entity, parseCsv(text));
  }
  data = loaded;

  const outCsv = path.join(OUTPUT_DIR, 'output.csv');
  const metaJson = path.join(OUTPUT_DIR, 'meta.json');
  if (fs.existsSync(outCsv)) {
    const rows = parseCsv(fs.readFileSync(outCsv, 'utf8')).map(normalizeOutputRow);
    let meta = {};
    if (fs.existsSync(metaJson)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaJson, 'utf8'));
      } catch {
        meta = {};
      }
    }
    timetable = { rows, meta };
  } else {
    timetable = null;
  }
}

export function getData() {
  return data;
}

export function getEntity(entity) {
  const rows = data[entity];
  if (!rows) throw httpError(404, `ไม่พบประเภทข้อมูล ${entity}`);
  return rows;
}

export function replaceEntity(entity, rawRows) {
  if (!ENTITIES[entity]) throw httpError(404, `ไม่พบประเภทข้อมูล ${entity}`);
  const rows = dedupeRows(entity, rawRows);
  data[entity] = rows;
  writeEntity(entity, rows);
  return rows;
}

export function addRow(entity, raw) {
  const def = ENTITIES[entity];
  if (!def) throw httpError(404, `ไม่พบประเภทข้อมูล ${entity}`);
  const row = normalizeRow(entity, raw);
  for (const k of def.key) {
    if (!row[k]) throw httpError(400, `ต้องระบุ ${def.key.join(', ')}`);
  }
  const key = rowKey(entity, row);
  const existing = data[entity] || [];
  if (existing.some((r) => rowKey(entity, r) === key)) {
    throw httpError(409, `มีข้อมูลรหัส ${key} อยู่แล้ว`);
  }
  const next = [...existing, row];
  data[entity] = next;
  writeEntity(entity, next);
  return row;
}

export function updateRow(entity, key, raw) {
  const def = ENTITIES[entity];
  if (!def) throw httpError(404, `ไม่พบประเภทข้อมูล ${entity}`);
  const existing = data[entity] || [];
  const idx = existing.findIndex((r) => rowKey(entity, r) === key);
  if (idx === -1) throw httpError(404, `ไม่พบข้อมูลรหัส ${key}`);
  const merged = normalizeRow(entity, { ...existing[idx], ...raw });
  for (const k of def.key) {
    if (!merged[k]) throw httpError(400, `ต้องระบุ ${def.key.join(', ')}`);
  }
  const nextKey = rowKey(entity, merged);
  if (nextKey !== key && existing.some((r, i) => i !== idx && rowKey(entity, r) === nextKey)) {
    throw httpError(409, `มีข้อมูลรหัส ${nextKey} อยู่แล้ว`);
  }
  const next = existing.map((r, i) => (i === idx ? merged : r));
  data[entity] = next;
  writeEntity(entity, next);
  return merged;
}

export function deleteRow(entity, key) {
  const def = ENTITIES[entity];
  if (!def) throw httpError(404, `ไม่พบประเภทข้อมูล ${entity}`);
  const existing = data[entity] || [];
  const idx = existing.findIndex((r) => rowKey(entity, r) === key);
  if (idx === -1) throw httpError(404, `ไม่พบข้อมูลรหัส ${key}`);
  const next = existing.filter((_, i) => i !== idx);
  data[entity] = next;
  writeEntity(entity, next);
  return true;
}

export function resetData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const def of Object.values(ENTITIES)) {
    const src = path.join(SEED_DIR, def.file);
    const dst = path.join(DATA_DIR, def.file);
    if (fs.existsSync(src)) fs.copyFileSync(src, dst);
  }
  init();
  return data;
}

export function getTimetable() {
  return timetable;
}

export function setTimetable(rows, meta = {}) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const normalized = (rows || [])
    .map(normalizeOutputRow)
    .sort((a, b) => {
      const g = a.group_id.localeCompare(b.group_id, undefined, { numeric: true });
      if (g !== 0) return g;
      return a.timeslot_id.localeCompare(b.timeslot_id, undefined, { numeric: true });
    });
  const nextMeta = { ...meta, updatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'output.csv'), toCsv(normalized, OUTPUT_FIELDS), 'utf8');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'meta.json'), JSON.stringify(nextMeta, null, 2), 'utf8');
  timetable = { rows: normalized, meta: nextMeta };
  return timetable;
}
