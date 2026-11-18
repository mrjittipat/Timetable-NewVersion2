import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, OUTPUT_DIR, SEED_DIR } from './paths.js';
import { ENTITIES, OUTPUT_FIELDS, normalizeRow, rowKey } from './schema.js';
import { parseCsv, toCsv } from './csv.js';
import { TERMS, getActiveTerm, loadConfig, normalizeTerm, saveConfig, termConfigPath } from './config.js';

const datasets = new Map();
const timetables = new Map();

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

export function termSeedDir(term) {
  const t = normalizeTerm(term);
  if (t === '1') {
    const t1 = path.join(SEED_DIR, 'term1');
    if (fs.existsSync(t1)) return t1;
  }
  return SEED_DIR;
}

export function termDataDir(term = getActiveTerm()) {
  return path.join(DATA_DIR, 'terms', normalizeTerm(term));
}

export function termOutputDir(term = getActiveTerm()) {
  return path.join(OUTPUT_DIR, 'terms', normalizeTerm(term));
}

function writeEntity(entity, rows, term = getActiveTerm()) {
  const def = ENTITIES[entity];
  const dir = termDataDir(term);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, def.file), toCsv(rows, def.fields), 'utf8');
}

function migrateLegacyTerm2() {
  const t2Data = termDataDir('2');
  const t2Out = termOutputDir('2');
  fs.mkdirSync(t2Data, { recursive: true });
  fs.mkdirSync(t2Out, { recursive: true });

  for (const def of Object.values(ENTITIES)) {
    const legacy = path.join(DATA_DIR, def.file);
    const target = path.join(t2Data, def.file);
    if (!fs.existsSync(target) && fs.existsSync(legacy)) {
      fs.copyFileSync(legacy, target);
    }
  }

  const legacyCfg = path.join(DATA_DIR, 'config.json');
  const t2Cfg = termConfigPath('2');
  if (!fs.existsSync(t2Cfg) && fs.existsSync(legacyCfg)) {
    fs.copyFileSync(legacyCfg, t2Cfg);
  }

  const legacyOut = path.join(OUTPUT_DIR, 'output.csv');
  const targetOut = path.join(t2Out, 'output.csv');
  if (!fs.existsSync(targetOut) && fs.existsSync(legacyOut)) {
    fs.copyFileSync(legacyOut, targetOut);
    const legacyMeta = path.join(OUTPUT_DIR, 'meta.json');
    const targetMeta = path.join(t2Out, 'meta.json');
    if (!fs.existsSync(targetMeta) && fs.existsSync(legacyMeta)) {
      fs.copyFileSync(legacyMeta, targetMeta);
    }
  }
}

function initTerm(term) {
  const t = normalizeTerm(term);
  const dataDir = termDataDir(t);
  const outDir = termOutputDir(t);
  const seedDir = termSeedDir(t);

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const loaded = {};
  for (const [entity, def] of Object.entries(ENTITIES)) {
    const dst = path.join(dataDir, def.file);
    const src = path.join(seedDir, def.file);
    if (!fs.existsSync(dst) && fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
    const text = fs.existsSync(dst) ? fs.readFileSync(dst, 'utf8') : '';
    loaded[entity] = dedupeRows(entity, parseCsv(text));
  }
  datasets.set(t, loaded);

  if (!fs.existsSync(termConfigPath(t))) {
    saveConfig(loadConfig(t), t);
  }

  const outCsv = path.join(outDir, 'output.csv');
  const metaJson = path.join(outDir, 'meta.json');
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
    timetables.set(t, { rows, meta });
  } else {
    timetables.set(t, null);
  }
}

export function init() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  migrateLegacyTerm2();
  for (const t of TERMS) initTerm(t);
}

export function getData(term = getActiveTerm()) {
  const t = normalizeTerm(term);
  if (!datasets.has(t)) initTerm(t);
  return datasets.get(t) || {};
}

export function getEntity(entity, term = getActiveTerm()) {
  const data = getData(term);
  const rows = data[entity];
  if (!rows) throw httpError(404, `ไม่พบประเภทข้อมูล ${entity}`);
  return rows;
}

export function replaceEntity(entity, rawRows, term = getActiveTerm()) {
  if (!ENTITIES[entity]) throw httpError(404, `ไม่พบประเภทข้อมูล ${entity}`);
  const t = normalizeTerm(term);
  const data = getData(t);
  const rows = dedupeRows(entity, rawRows);
  data[entity] = rows;
  writeEntity(entity, rows, t);
  return rows;
}

export function addRow(entity, raw, term = getActiveTerm()) {
  const def = ENTITIES[entity];
  if (!def) throw httpError(404, `ไม่พบประเภทข้อมูล ${entity}`);
  const t = normalizeTerm(term);
  const data = getData(t);
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
  writeEntity(entity, next, t);
  return row;
}

export function updateRow(entity, key, raw, term = getActiveTerm()) {
  const def = ENTITIES[entity];
  if (!def) throw httpError(404, `ไม่พบประเภทข้อมูล ${entity}`);
  const t = normalizeTerm(term);
  const data = getData(t);
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
  writeEntity(entity, next, t);
  return merged;
}

export function deleteRow(entity, key, term = getActiveTerm()) {
  const def = ENTITIES[entity];
  if (!def) throw httpError(404, `ไม่พบประเภทข้อมูล ${entity}`);
  const t = normalizeTerm(term);
  const data = getData(t);
  const existing = data[entity] || [];
  const idx = existing.findIndex((r) => rowKey(entity, r) === key);
  if (idx === -1) throw httpError(404, `ไม่พบข้อมูลรหัส ${key}`);
  const next = existing.filter((_, i) => i !== idx);
  data[entity] = next;
  writeEntity(entity, next, t);
  return true;
}

export function resetData(term = getActiveTerm()) {
  const t = normalizeTerm(term);
  const dataDir = termDataDir(t);
  const seedDir = termSeedDir(t);
  fs.mkdirSync(dataDir, { recursive: true });
  for (const def of Object.values(ENTITIES)) {
    const src = path.join(seedDir, def.file);
    const dst = path.join(dataDir, def.file);
    if (fs.existsSync(src)) fs.copyFileSync(src, dst);
  }
  initTerm(t);
  return getData(t);
}

export function getTimetable(term = getActiveTerm()) {
  const t = normalizeTerm(term);
  if (!timetables.has(t)) initTerm(t);
  return timetables.get(t) || null;
}

export function setTimetable(rows, meta = {}, term = getActiveTerm()) {
  const t = normalizeTerm(term);
  const outDir = termOutputDir(t);
  fs.mkdirSync(outDir, { recursive: true });
  const normalized = (rows || [])
    .map(normalizeOutputRow)
    .sort((a, b) => {
      const g = a.group_id.localeCompare(b.group_id, undefined, { numeric: true });
      if (g !== 0) return g;
      return a.timeslot_id.localeCompare(b.timeslot_id, undefined, { numeric: true });
    });
  const nextMeta = { ...meta, term: t, updatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, 'output.csv'), toCsv(normalized, OUTPUT_FIELDS), 'utf8');
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(nextMeta, null, 2), 'utf8');
  timetables.set(t, { rows: normalized, meta: nextMeta });
  return timetables.get(t);
}
