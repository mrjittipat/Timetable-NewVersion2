import crypto from 'node:crypto';
import * as store from '../src/services/store.js';
import { loadConfig, mergeConfig } from '../src/services/config.js';
import { solve } from '../src/services/solver.js';
import { validate } from '../src/services/validator.js';

store.init();
const data = store.getData();
const base = loadConfig();
const runAll = process.argv.includes('--all');

const combos = runAll
  ? [
      { label: 'all-on (S1+S2+S3)', constraints: { S1: true, S2: true, S3: true } },
      { label: 'basic-only (all off)', constraints: { S1: false, S2: false, S3: false } },
      { label: 'load-only (S1+S2)', constraints: { S1: true, S2: true, S3: false } },
      { label: 'no-gap-only (S3)', constraints: { S1: false, S2: false, S3: true } },
    ]
  : [{ label: 'default', constraints: base.constraints }];

let failed = 0;
for (const combo of combos) {
  const cfg = mergeConfig({ ...base, constraints: combo.constraints });
  const res = solve(data, cfg);
  const val = res.status === 'success' ? validate(res.rows, data, cfg) : null;
  const ok = res.status === 'success' && val?.passed;
  if (ok) {
    console.log(
      `PASS ${combo.label}: rows=${res.rows.length}, restarts=${res.stats.restarts}, cost=${res.stats.softCostBefore}->${res.stats.softCostAfter}, time=${res.stats.seconds}s`
    );
  } else {
    failed++;
    const errs = res.status !== 'success' ? res.errors : val?.checks.filter((c) => !c.passed).map((c) => `${c.id}: ${c.violations[0]}`);
    console.log(`FAIL ${combo.label}: ${res.message}`, errs);
  }
}

// Determinism check (same seed -> identical hash, different seed -> different hash)
const cfg42 = mergeConfig({ ...base, params: { ...base.params, seed: 42 } });
const cfg99 = mergeConfig({ ...base, params: { ...base.params, seed: 99 } });
const a = solve(data, cfg42);
const b = solve(data, cfg42);
const c = solve(data, cfg99);
const hash = (rows) => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16);
const ha = hash(a.rows);
const hb = hash(b.rows);
const hc = hash(c.rows);
if (a.status === 'success' && b.status === 'success' && c.status === 'success' && ha === hb && ha !== hc) {
  console.log(`PASS determinism: seed42=${ha} === seed42=${hb}, seed99=${hc}`);
} else {
  failed++;
  console.log(`FAIL determinism: seed42=${ha}, seed42_2=${hb}, seed99=${hc}`);
}

if (failed > 0) process.exit(1);
