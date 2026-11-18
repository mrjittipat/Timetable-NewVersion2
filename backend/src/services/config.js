import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

export const TERMS = ['1', '2'];

export function normalizeTerm(term) {
  return String(term ?? '').trim() === '1' ? '1' : '2';
}

export const DEFAULT_CONFIG = {
  constraints: {
    S1: true,
    S2: true,
    S3: true,
  },
  params: {
    homeroomPeriod: 1,
    breakPeriod: 6,
    maxPerDay: 8,
    maxBlock: 4,
    latestPreferredPeriod: 10,
    leaderMinPeriods: 20,
    leaderMaxPeriods: 30,
    teacherMinPeriods: 25,
    teacherMaxPeriods: 35,
    timeLimitSec: 20,
    seed: 42,
  },
  document: {
    college: 'วิทยาลัยเทคนิคพังงา',
    semester: '2',
    year: '2569',
    curriculumHeadName: '',
    deputyName: '',
    directorName: '',
    publicEnabled: true,
    publicBaseUrl: '',
  },
};

const TERM_DOC_DEFAULTS = {
  '1': { semester: '1', year: '2570' },
  '2': { semester: '2', year: '2569' },
};

const STATE_PATH = path.join(DATA_DIR, 'app-state.json');
let activeTermCache = null;

export function getActiveTerm() {
  if (activeTermCache) return activeTermCache;
  try {
    if (fs.existsSync(STATE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
      if (parsed?.activeTerm) {
        activeTermCache = normalizeTerm(parsed.activeTerm);
        return activeTermCache;
      }
    }
  } catch {
    // fallback to default
  }
  activeTermCache = '2';
  return activeTermCache;
}

export function setActiveTerm(term) {
  const next = normalizeTerm(term);
  activeTermCache = next;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify({ activeTerm: next }, null, 2), 'utf8');
  return next;
}

export function termConfigPath(term = getActiveTerm()) {
  const t = normalizeTerm(term);
  return path.join(DATA_DIR, 'terms', t, 'config.json');
}

export function mergeConfig(cfg = {}, term = null) {
  const safe = cfg && typeof cfg === 'object' ? cfg : {};
  const tDoc = term ? TERM_DOC_DEFAULTS[normalizeTerm(term)] || {} : {};
  return {
    savedSeeds: Array.isArray(safe.savedSeeds) ? safe.savedSeeds : [],
    constraints: { ...DEFAULT_CONFIG.constraints, ...(safe.constraints || {}) },
    params: { ...DEFAULT_CONFIG.params, ...(safe.params || {}) },
    document: { ...DEFAULT_CONFIG.document, ...tDoc, ...(safe.document || {}) },
  };
}

export function loadConfig(term = getActiveTerm()) {
  const t = normalizeTerm(term);
  const cfgPath = termConfigPath(t);
  const legacyPath = path.join(DATA_DIR, 'config.json');
  try {
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      return mergeConfig(parsed, t);
    }
    if (t === '2' && fs.existsSync(legacyPath)) {
      const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      return mergeConfig(parsed, t);
    }
    return mergeConfig({}, t);
  } catch {
    return mergeConfig({}, t);
  }
}

export function saveConfig(cfg, term = getActiveTerm()) {
  const t = normalizeTerm(term);
  const cfgPath = termConfigPath(t);
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  const merged = mergeConfig(cfg, t);
  fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}
