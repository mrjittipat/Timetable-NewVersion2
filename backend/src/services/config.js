import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

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
    latestPreferredPeriod: 9,
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

const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

export function mergeConfig(cfg = {}) {
  const safe = cfg && typeof cfg === 'object' ? cfg : {};
  return {
    savedSeeds: Array.isArray(safe.savedSeeds) ? safe.savedSeeds : [],
    constraints: { ...DEFAULT_CONFIG.constraints, ...(safe.constraints || {}) },
    params: { ...DEFAULT_CONFIG.params, ...(safe.params || {}) },
    document: { ...DEFAULT_CONFIG.document, ...(safe.document || {}) },
  };
}

export function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return mergeConfig();
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return mergeConfig(parsed);
  } catch {
    return mergeConfig();
  }
}

export function saveConfig(cfg) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const merged = mergeConfig(cfg);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}
