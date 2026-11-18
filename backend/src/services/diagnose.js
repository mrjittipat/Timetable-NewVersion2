import { buildContext } from './context.js';
import { mergeConfig } from './config.js';
import { solve } from './solver.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export function capacityChecks(ctx) {
  const findings = [];
  for (const w of ctx.warnings) {
    if (w.level === 'error') findings.push({ level: 'error', area: 'ข้อมูล', message: w.message });
  }

  const usablePerWeek = ctx.daySlots.reduce((s, d) => s + d.length, 0);
  const groupHours = new Map([...ctx.groups.keys()].map((g) => [g, 0]));
  const actGroups = new Set();

  for (const reg of ctx.registrations) {
    const h = ctx.hours(reg.subject_id);
    groupHours.set(reg.group_id, (groupHours.get(reg.group_id) || 0) + h);
    if (ctx.isActivity(reg.subject_id) && h > 0) actGroups.add(reg.group_id);
  }

  for (const [gid, h] of groupHours) {
    if (h > usablePerWeek) {
      findings.push({
        level: 'error',
        area: 'กลุ่มเรียน',
        message: `กลุ่ม ${gid} มีคาบเรียนรวม ${h} คาบ เกินจำนวนคาบที่จัดได้ต่อสัปดาห์ (${usablePerWeek} คาบ)`,
      });
    }
    if (!actGroups.has(gid)) {
      findings.push({
        level: 'warn',
        area: 'กิจกรรม',
        message: `กลุ่ม ${gid} ไม่มีรายวิชากิจกรรมในวันพฤหัสบดี คาบ 2–3`,
      });
    }
  }

  if (ctx.thuActivitySlots.length < 2) {
    findings.push({
      level: 'error',
      area: 'คาบเวลา',
      message: 'ไม่พบคาบที่ 2 และ 3 ของวันพฤหัสบดีสำหรับวิชากิจกรรม',
    });
  }

  // Teacher capacity check (counting joint cohorts once)
  const cohortHandled = new Set();
  let totalTeacherPeriods = 0;
  let wutthiwongEligibleHours = 0;

  for (const co of ctx.jointCohorts) {
    totalTeacherPeriods += 2;
    for (const [gid, sid] of co.subjectsByGroup) cohortHandled.add(`${gid}|${sid}`);
    if (ctx.isWutthiwong(co.teacherId)) wutthiwongEligibleHours += 2;
  }

  for (const reg of ctx.registrations) {
    const k = `${reg.group_id}|${reg.subject_id}`;
    if (cohortHandled.has(k)) continue;
    const h = ctx.hours(reg.subject_id);
    if (h === 0) continue;
    totalTeacherPeriods += h;
    const ts = ctx.teachersBySubject.get(reg.subject_id) || [];
    if (ctx.groupMeta(reg.group_id).isItPvs && ts.some(ctx.isWutthiwong)) {
      wutthiwongEligibleHours += h;
    }
  }

  let minSum = 0;
  let maxSum = 0;
  for (const [tid, t] of ctx.teachers) {
    const b = ctx.teacherBounds(tid);
    const enabled = t.role === 'Leader' ? ctx.constraints.S1 : ctx.constraints.S2;
    if (enabled) {
      minSum += b.min;
      maxSum += b.max;
    } else {
      maxSum += usablePerWeek;
    }
  }

  if ((ctx.constraints.S1 || ctx.constraints.S2) && totalTeacherPeriods > maxSum) {
    findings.push({
      level: 'error',
      area: 'ครูผู้สอน',
      message: `ภาระสอนรวมทุกวิชา (${totalTeacherPeriods} คาบ) เกินเพดานสูงสุดรวมของครู (${maxSum} คาบ)`,
    });
  } else if ((ctx.constraints.S1 || ctx.constraints.S2) && totalTeacherPeriods < minSum) {
    findings.push({
      level: 'error',
      area: 'ครูผู้สอน',
      message: `ภาระสอนรวมทุกวิชา (${totalTeacherPeriods} คาบ) น้อยกว่าเกณฑ์ขั้นต่ำรวมของครู (${minSum} คาบ)`,
    });
  }

  const wTeacher = [...ctx.teachers.keys()].find(ctx.isWutthiwong);
  if (wTeacher && ctx.constraints.S1) {
    const wb = ctx.teacherBounds(wTeacher);
    if (wutthiwongEligibleHours < wb.min) {
      findings.push({
        level: 'error',
        area: 'ครูผู้สอน',
        message: `รายวิชา ปวส.1–2 IT ที่ครูวุฒิวงศ์สอนได้มีเพียง ${wutthiwongEligibleHours} คาบ (ต่ำกว่าเกณฑ์ขั้นต่ำ ${wb.min} คาบ)`,
      });
    }
  }

  const thuConcurrent = ctx.jointCohorts.length + Math.max(0, actGroups.size - cohortHandled.size);
  if (ctx.rooms.size < thuConcurrent) {
    findings.push({
      level: 'error',
      area: 'ห้องเรียน',
      message: `จำนวนห้องเรียนที่ใช้ได้ (${ctx.rooms.size} ห้อง) น้อยกว่าจำนวนกลุ่มเรียนพร้อมกันวันพฤหัสบดี คาบ 2–3 (${thuConcurrent} ห้อง)`,
    });
  }

  if (findings.length === 0) {
    findings.push({
      level: 'ok',
      area: 'ความจุ',
      message: 'ความจุครู ห้องเรียน และคาบเวลาเพียงพอสำหรับการจัดตาราง',
    });
  }
  return findings;
}

export function diagnose(data, config = {}, { probeSeconds = 4, onProgress = () => {} } = {}) {
  const cfg = mergeConfig(config);
  const ctx = buildContext(data, cfg);
  const findings = capacityChecks(ctx);

  const probeCfg = (constraints) =>
    mergeConfig({ ...cfg, constraints, params: { ...cfg.params, timeLimitSec: probeSeconds } });

  onProgress('กำลังทดสอบจัดตารางด้วยเงื่อนไขปัจจุบัน');
  const tBase = Date.now();
  const baseRes = solve(data, probeCfg(cfg.constraints));
  const probes = [
    {
      label: 'เงื่อนไขปัจจุบัน',
      ok: baseRes.status === 'success',
      seconds: round2((Date.now() - tBase) / 1000),
    },
  ];

  const hasBlocking = findings.some((f) => f.level === 'error' && (f.area === 'ข้อมูล' || f.area === 'กลุ่มเรียน'));
  const enabledSpecials = Object.keys(cfg.constraints).filter((k) => cfg.constraints[k]);
  const culprits = [];

  if (baseRes.status !== 'success' && !hasBlocking && enabledSpecials.length > 0) {
    for (const id of enabledSpecials) {
      onProgress(`กำลังทดสอบโดยปิดเงื่อนไข ${id}`);
      const nextC = { ...cfg.constraints, [id]: false };
      const t0 = Date.now();
      const res = solve(data, probeCfg(nextC));
      const ok = res.status === 'success';
      probes.push({ label: `ปิดข้อ ${id}`, ok, seconds: round2((Date.now() - t0) / 1000) });
      if (ok) culprits.push(id);
    }

    if (culprits.length === 0 && enabledSpecials.length > 1) {
      onProgress('กำลังทดสอบโดยปิดเงื่อนไขพิเศษทั้งหมด');
      const allOff = Object.fromEntries(Object.keys(cfg.constraints).map((k) => [k, false]));
      const t0 = Date.now();
      const res = solve(data, probeCfg(allOff));
      probes.push({
        label: 'ปิดเงื่อนไขพิเศษทั้งหมด',
        ok: res.status === 'success',
        seconds: round2((Date.now() - t0) / 1000),
      });
    }
  }

  if (baseRes.status !== 'success' && baseRes.errors?.length) {
    for (const err of baseRes.errors.slice(0, 5)) {
      findings.push({ level: 'error', area: 'การค้นหา', message: err });
    }
  }

  const suggestions = [];
  if (baseRes.status === 'success') {
    suggestions.push('เงื่อนไขปัจจุบันสามารถจัดตารางได้สำเร็จ หากต้องการคุณภาพตารางดีขึ้นให้ลองเพิ่มเวลาสูงสุดหรือค้นหา Seed ที่ดีที่สุด');
  } else if (culprits.length > 0) {
    suggestions.push(`พบว่าเงื่อนไข ${culprits.join(', ')} ทำให้ตารางตึงตัวเกินไป ลองปิดเงื่อนไขดังกล่าวหรือเพิ่มเวลาสูงสุดในการจัดตาราง`);
  } else if (hasBlocking) {
    suggestions.push('พบข้อผิดพลาดในข้อมูลตั้งต้นหรือจำนวนคาบของกลุ่มเรียน กรุณาตรวจสอบที่หน้าจัดการข้อมูลก่อนจัดตาราง');
  } else {
    suggestions.push('ลองเพิ่มเวลาสูงสุด (วินาที) เพิ่มสิทธิ์ครูผู้สอนใน teach.csv หรือทดสอบปิดเงื่อนไขพิเศษบางข้อชั่วคราว');
  }

  return {
    feasible: baseRes.status === 'success',
    culprits,
    probes,
    findings,
    suggestions,
  };
}

export function bestSeed(data, config = {}, { count = 20, seeds, onProgress = () => {} } = {}) {
  const cfg = mergeConfig(config);
  const tStart = Date.now();
  const baseSeed = Number(cfg.params.seed) || 42;
  const rng = mulberry32(baseSeed ^ 0x9e3779b9);

  let seedList;
  if (Array.isArray(seeds) && seeds.length > 0) {
    seedList = [...new Set(seeds.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  } else {
    const target = Math.max(2, Math.min(60, Number(count) || 20));
    const set = new Set([baseSeed]);
    while (set.size < target) {
      set.add(Math.floor(rng() * 99999) + 1);
    }
    seedList = [...set];
  }

  const perSeedSec = Math.min(Number(cfg.params.timeLimitSec) || 10, 10);
  const results = [];
  let best = null;

  for (let i = 0; i < seedList.length; i++) {
    const s = seedList[i];
    onProgress(`กำลังทดสอบ Seed ${s} (${i + 1}/${seedList.length})`);
    const sCfg = mergeConfig({ ...cfg, params: { ...cfg.params, seed: s, timeLimitSec: perSeedSec } });
    const res = solve(data, sCfg);
    const ok = res.status === 'success';
    const softCost = ok ? res.stats.softCostAfter : null;
    const item = { seed: s, ok, softCost, seconds: res.stats.seconds };
    results.push(item);
    if (ok && (!best || softCost < best.softCost)) {
      best = { seed: s, softCost, result: res };
    }
  }

  results.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    if (!a.ok) return a.seed - b.seed;
    return a.softCost - b.softCost;
  });

  return {
    best: best ? { seed: best.seed, softCost: best.softCost, rows: best.result.rows, stats: best.result.stats } : null,
    results,
    seconds: round2((Date.now() - tStart) / 1000),
  };
}
