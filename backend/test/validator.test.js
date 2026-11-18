import * as store from '../src/services/store.js';
import { mergeConfig, DEFAULT_CONFIG } from '../src/services/config.js';
import { buildContext } from '../src/services/context.js';
import { solve } from '../src/services/solver.js';
import { validate } from '../src/services/validator.js';

store.init();
const data = store.getData();
const cfg = mergeConfig(DEFAULT_CONFIG);
const ctx = buildContext(data, cfg);

const solved = solve(data, cfg);
if (solved.status !== 'success') {
  console.error('FAIL solver failed on default config:', solved.message, solved.errors);
  process.exit(1);
}
const good = solved.rows;

let failed = 0;
function report(ok, label, detail = '') {
  if (ok) console.log(`PASS ${label}${detail ? ` — ${detail}` : ''}`);
  else {
    console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

const baseRes = validate(good, data, cfg, ctx);
report(baseRes.passed, 'baseline (all checks pass)', `${baseRes.checks.length} checks`);

function expectFail(checkId, label, mutator) {
  const copy = good.map((r) => ({ ...r }));
  mutator(copy);
  const res = validate(copy, data, cfg, ctx);
  const ck = res.checks.find((c) => c.id === checkId);
  report(Boolean(ck && !ck.passed && ck.violations.length > 0), `${checkId} ${label}`, ck?.violations?.[0] || 'no violation');
}

expectFail('I1', 'unknown room', (rows) => {
  rows[0].room_id = 'BAD_ROOM';
});

expectFail('I2', 'missing course period', (rows) => {
  const idx = rows.findIndex((r) => !ctx.isActivity(r.subject_id));
  rows.splice(idx, 1);
});

expectFail('I4', 'unauthorized teacher for subject', (rows) => {
  const r = rows.find((x) => !ctx.isActivity(x.subject_id));
  const allowed = new Set(ctx.teachersBySubject.get(r.subject_id) || []);
  const badTeacher = [...ctx.teachers.keys()].find((tid) => !allowed.has(tid));
  r.teacher_id = badTeacher;
});

expectFail('B1', 'scheduled in Period 1 Homeroom', (rows) => {
  const p1 = [...ctx.slotsById.values()].find((s) => s.period === ctx.homeroomPeriod);
  const r = rows.find((x) => !ctx.isActivity(x.subject_id));
  r.timeslot_id = p1.id;
});

expectFail('B2', 'scheduled in Period 6 Lunch Break', (rows) => {
  const p6 = [...ctx.slotsById.values()].find((s) => s.period === ctx.breakPeriod);
  const r = rows.find((x) => !ctx.isActivity(x.subject_id));
  r.timeslot_id = p6.id;
});

expectFail('B3', 'activity moved out of Thu P2-P3', (rows) => {
  const monP2 = [...ctx.slotsById.values()].find((s) => s.day === 'Mon' && s.period === 2);
  const r = rows.find((x) => x.group_id === 'G07' && ctx.isActivity(x.subject_id));
  r.timeslot_id = monP2.id;
});

expectFail('B4', 'Wutthiwong teaching non-IT-PVS group', (rows) => {
  const r = rows.find((x) => !ctx.groupMeta(x.group_id).isItPvs && !ctx.isActivity(x.subject_id));
  const wId = [...ctx.teachers.keys()].find(ctx.isWutthiwong);
  r.teacher_id = wId;
});

expectFail('B5', 'Wutthiwong missing from G04 Thu P2-P3', (rows) => {
  const r = rows.find((x) => x.group_id === 'G04' && ctx.thuActivitySlots.includes(x.timeslot_id));
  const other = [...ctx.teachers.keys()].find((tid) => !ctx.isWutthiwong(tid));
  r.teacher_id = other;
});

expectFail('B6', 'Likhid missing from G02 Thu P2-P3', (rows) => {
  const r = rows.find((x) => x.group_id === 'G02' && ctx.thuActivitySlots.includes(x.timeslot_id));
  const other = [...ctx.teachers.keys()].find((tid) => !ctx.isLikhid(tid) && !ctx.isWutthiwong(tid));
  r.teacher_id = other;
});

expectFail('S1', 'Leader exceeds 30 periods', (rows) => {
  const leaderId = [...ctx.teachers.values()].find((t) => t.role === 'Leader')?.teacher_id;
  const used = new Set(rows.filter((r) => r.teacher_id === leaderId).map((r) => r.timeslot_id));
  for (const r of rows) {
    if (used.size > 30) break;
    if (r.teacher_id !== leaderId && !used.has(r.timeslot_id)) {
      r.teacher_id = leaderId;
      used.add(r.timeslot_id);
    }
  }
});

expectFail('S2', 'Teacher exceeds 35 periods', (rows) => {
  const teacherId = [...ctx.teachers.values()].find((t) => t.role === 'Teacher')?.teacher_id;
  const used = new Set(rows.filter((r) => r.teacher_id === teacherId).map((r) => r.timeslot_id));
  for (const r of rows) {
    if (used.size > 35) break;
    if (r.teacher_id !== teacherId && !used.has(r.timeslot_id)) {
      r.teacher_id = teacherId;
      used.add(r.timeslot_id);
    }
  }
});

expectFail('S3', 'afternoon scheduled while morning not full / gap created', (rows) => {
  // Move a morning slot of a group+day onto a free slot (either creating an afternoon-before-morning-full or leading gap)
  for (const gid of ctx.groups.keys()) {
    for (let d = 0; d < ctx.days.length; d++) {
      const ds = ctx.daySlots[d];
      const morningRow = rows.find((r) => r.group_id === gid && r.timeslot_id === ds[0] && !ctx.isActivity(r.subject_id));
      const freeSlot = ds.slice().reverse().find((sid) => !rows.some((r) => r.group_id === gid && r.timeslot_id === sid));
      if (morningRow && freeSlot) {
        morningRow.timeslot_id = freeSlot;
        return;
      }
    }
  }
});

if (failed > 0) process.exit(1);
