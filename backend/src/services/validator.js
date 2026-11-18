import { buildContext } from './context.js';

function slotLabel(slot) {
  if (!slot) return '?';
  return `${slot.day} คาบ ${slot.period}`;
}

function makeCheck(id, no, name, type, enabled) {
  return { id, no, name, type, enabled, violations: [] };
}

function pushViolation(check, msg) {
  check.violations.push(msg);
}

export function validate(rows = [], data = {}, config = {}, ctx = buildContext(data, config)) {
  const c = ctx.constraints || {};
  const checks = [
    makeCheck('I1', 1, 'ข้อมูลอ้างอิงครบถ้วนและถูกต้อง', 'integrity', true),
    makeCheck('I2', 2, 'จำนวนคาบครบตามรายวิชาที่ลงทะเบียน', 'integrity', true),
    makeCheck('I3', 3, 'ไม่มีกลุ่มเรียน ครู หรือห้องเรียนซ้อนทับกัน', 'integrity', true),
    makeCheck('I4', 4, 'ครูผู้สอนมีสิทธิ์สอนรายวิชาตาม teach.csv', 'integrity', true),
    makeCheck('B1', 5, 'คาบที่ 1 (08:00–08:30) เป็นคาบ Homeroom ห้ามจัดวิชาลง', 'basic', true),
    makeCheck('B2', 6, 'คาบพักเที่ยง (คาบ 6) ห้ามจัดรายวิชาลง', 'basic', true),
    makeCheck('B3', 7, 'วันพฤหัสบดี คาบ 2–3 เป็นรายวิชากิจกรรม (ปวช.1 เป็นลูกเสือวิสามัญ)', 'basic', true),
    makeCheck('B4', 8, 'ครูวุฒิวงศ์สอนเฉพาะ ปวส.1–2 สาขาเทคโนโลยีสารสนเทศเท่านั้น', 'basic', true),
    makeCheck('B5', 9, 'ครูวุฒิวงศ์สอนกิจกรรม ปวส.1 และ ปวส.2 IT พร้อมกัน พฤหัสบดี คาบ 2–3', 'basic', true),
    makeCheck('B6', 10, 'ครูลิขิตสอนกิจกรรม ปวช.2 และ ปวช.3 IT พร้อมกัน พฤหัสบดี คาบ 2–3', 'basic', true),
    makeCheck('S1', 11, 'หัวหน้าแผนกวิชา (Leader) สอน 20–30 คาบต่อสัปดาห์', 'special', Boolean(c.S1)),
    makeCheck('S2', 12, 'ครูธรรมดา (Teacher) สอน 25–35 คาบต่อสัปดาห์', 'special', Boolean(c.S2)),
    makeCheck('S3', 13, 'ตารางเรียนของนักเรียนห้ามมีช่องว่างในแต่ละวัน', 'special', Boolean(c.S3)),
  ];

  const byId = Object.fromEntries(checks.map((ck) => [ck.id, ck]));
  const validRows = [];

  // I1, I4, B1, B2, B4 row-level checks
  for (const r of rows) {
    const g = ctx.groups.get(r.group_id);
    const slot = ctx.slotsById.get(r.timeslot_id);
    const sub = ctx.subjects.get(r.subject_id);
    const teacher = ctx.teachers.get(r.teacher_id);
    const room = ctx.rooms.get(r.room_id);

    if (!g || !slot || !sub || !teacher || !room) {
      pushViolation(
        byId.I1,
        `แถวข้อมูลอ้างอิงไม่ถูกต้อง: กลุ่ม=${r.group_id || '-'} คาบ=${r.timeslot_id || '-'} วิชา=${r.subject_id || '-'} ครู=${r.teacher_id || '-'} ห้อง=${r.room_id || '-'}`
      );
      continue;
    }
    validRows.push({ ...r, slot });

    const allowedTeachers = ctx.teachersBySubject.get(r.subject_id) || [];
    if (!allowedTeachers.includes(r.teacher_id)) {
      pushViolation(byId.I4, `${teacher.teacher_name} ไม่มีสิทธิ์สอนวิชา ${r.subject_id} (กลุ่ม ${r.group_id} ${slotLabel(slot)})`);
    }

    if (slot.period === ctx.homeroomPeriod) {
      pushViolation(byId.B1, `กลุ่ม ${r.group_id} จัดวิชา ${r.subject_id} ลงคาบ Homeroom (${slotLabel(slot)})`);
    }

    if (slot.period === ctx.breakPeriod) {
      pushViolation(byId.B2, `กลุ่ม ${r.group_id} จัดวิชา ${r.subject_id} ลงคาบพักเที่ยง (${slotLabel(slot)})`);
    }

    if (ctx.isWutthiwong(r.teacher_id)) {
      const meta = ctx.groupMeta(r.group_id);
      if (!meta.isItPvs) {
        pushViolation(
          byId.B4,
          `${teacher.teacher_name} สอนกลุ่ม ${r.group_id} (${g.group_name}) ซึ่งไม่ใช่ ปวส.1–2 เทคโนโลยีสารสนเทศ (${slotLabel(slot)})`
        );
      }
    }
  }

  // I2: Course hours completeness
  const regMap = new Map();
  for (const reg of ctx.registrations) {
    const h = ctx.hours(reg.subject_id);
    if (h > 0) regMap.set(`${reg.group_id}|${reg.subject_id}`, h);
  }
  const actualCount = new Map();
  for (const r of validRows) {
    const k = `${r.group_id}|${r.subject_id}`;
    actualCount.set(k, (actualCount.get(k) || 0) + 1);
  }
  for (const [k, need] of regMap) {
    const got = actualCount.get(k) || 0;
    if (got !== need) {
      const [gid, sid] = k.split('|');
      pushViolation(byId.I2, `กลุ่ม ${gid} วิชา ${sid} ต้องจัด ${need} คาบ แต่จัดไว้ ${got} คาบ`);
    }
  }
  for (const [k, got] of actualCount) {
    if (!regMap.has(k)) {
      const [gid, sid] = k.split('|');
      pushViolation(byId.I2, `กลุ่ม ${gid} มีวิชา ${sid} (${got} คาบ) ที่ไม่ได้ลงทะเบียนหรือจำนวนคาบเป็น 0`);
    }
  }

  // I3: Group / Teacher / Room clashes (allowing joint Thu P2-P3 cohorts)
  const byGroupSlot = new Map();
  const byTeacherSlot = new Map();
  const byRoomSlot = new Map();
  for (const r of validRows) {
    const gs = `${r.group_id}|${r.timeslot_id}`;
    if (!byGroupSlot.has(gs)) byGroupSlot.set(gs, []);
    byGroupSlot.get(gs).push(r);

    const ts = `${r.teacher_id}|${r.timeslot_id}`;
    if (!byTeacherSlot.has(ts)) byTeacherSlot.set(ts, []);
    byTeacherSlot.get(ts).push(r);

    const rs = `${r.room_id}|${r.timeslot_id}`;
    if (!byRoomSlot.has(rs)) byRoomSlot.set(rs, []);
    byRoomSlot.get(rs).push(r);
  }

  for (const [, list] of byGroupSlot) {
    if (list.length > 1) {
      const r0 = list[0];
      pushViolation(byId.I3, `กลุ่ม ${r0.group_id} เรียนซ้อน ${list.length} วิชาใน ${slotLabel(r0.slot)}`);
    }
  }

  for (const [, list] of byTeacherSlot) {
    if (list.length > 1) {
      const r0 = list[0];
      const gids = list.map((x) => x.group_id);
      if (!ctx.isJointSlotAllowed(r0.timeslot_id, gids, r0.teacher_id)) {
        const t = ctx.teachers.get(r0.teacher_id);
        pushViolation(
          byId.I3,
          `${t?.teacher_name || r0.teacher_id} สอนซ้อนกัน (${gids.join(', ')}) ใน ${slotLabel(r0.slot)}`
        );
      }
    }
  }

  for (const [, list] of byRoomSlot) {
    if (list.length > 1) {
      const r0 = list[0];
      const sameTeacher = list.every((x) => x.teacher_id === r0.teacher_id);
      const gids = list.map((x) => x.group_id);
      if (!(sameTeacher && ctx.isJointSlotAllowed(r0.timeslot_id, gids, r0.teacher_id))) {
        pushViolation(
          byId.I3,
          `ห้อง ${r0.room_id} ใช้งานซ้อนกัน (${gids.join(', ')}) ใน ${slotLabel(r0.slot)}`
        );
      }
    }
  }

  // B3: Thu P2-P3 activities & Year-1 Scout
  const thuSet = new Set(ctx.thuActivitySlots);
  for (const r of validRows) {
    if (ctx.isActivity(r.subject_id) && !thuSet.has(r.timeslot_id)) {
      pushViolation(byId.B3, `กลุ่ม ${r.group_id} จัดวิชากิจกรรม ${r.subject_id} นอกวันพฤหัสบดี คาบ 2–3 (${slotLabel(r.slot)})`);
    }
    if (thuSet.has(r.timeslot_id) && !ctx.isActivity(r.subject_id)) {
      pushViolation(byId.B3, `กลุ่ม ${r.group_id} จัดวิชา ${r.subject_id} (ไม่ใช่วิชากิจกรรม) ลงวันพฤหัสบดี คาบ 2–3 (${slotLabel(r.slot)})`);
    }
    if (thuSet.has(r.timeslot_id) && ctx.groupMeta(r.group_id).isYear1Pvc && !ctx.isScout(r.subject_id)) {
      pushViolation(byId.B3, `กลุ่ม ${r.group_id} (ปวช.1) ใน ${slotLabel(r.slot)} ต้องเป็นวิชาลูกเสือวิสามัญ แต่พบ ${r.subject_id}`);
    }
  }
  for (const [k] of regMap) {
    const [gid, sid] = k.split('|');
    if (ctx.isActivity(sid) && thuSet.size === 2) {
      const gThu = validRows.filter((r) => r.group_id === gid && r.subject_id === sid && thuSet.has(r.timeslot_id));
      if (gThu.length !== 2) {
        pushViolation(byId.B3, `กลุ่ม ${gid} วิชากิจกรรม ${sid} ไม่ครบ 2 คาบในวันพฤหัสบดี คาบ 2–3 (พบ ${gThu.length} คาบ)`);
      }
    }
  }

  // B5 & B6: Concurrent advisor activities Thu P2-P3
  const checkCohort = (check, cohortGroups, matchTeacherFn, label) => {
    const targetTid = [...ctx.teachers.keys()].find(matchTeacherFn);
    if (!targetTid || cohortGroups.length === 0 || ctx.thuActivitySlots.length !== 2) return;
    for (const sid of ctx.thuActivitySlots) {
      const slot = ctx.slotsById.get(sid);
      const found = validRows.filter((r) => cohortGroups.includes(r.group_id) && r.timeslot_id === sid);
      if (found.length !== cohortGroups.length) {
        pushViolation(check, `${label} ใน ${slotLabel(slot)} พบเพียง ${found.length}/${cohortGroups.length} กลุ่ม`);
        continue;
      }
      for (const r of found) {
        if (r.teacher_id !== targetTid) {
          pushViolation(check, `กลุ่ม ${r.group_id} ใน ${slotLabel(slot)} ไม่ได้ระบุครูที่ปรึกษาตามเงื่อนไข (${r.teacher_id})`);
        }
        if (!ctx.isActivity(r.subject_id)) {
          pushViolation(check, `กลุ่ม ${r.group_id} ใน ${slotLabel(slot)} ไม่ใช่วิชากิจกรรม (${r.subject_id})`);
        }
      }
      const roomsUsed = new Set(found.map((r) => r.room_id));
      if (roomsUsed.size > 1) {
        pushViolation(check, `${label} ใน ${slotLabel(slot)} ใช้คนละห้อง (${[...roomsUsed].join(', ')})`);
      }
    }
  };

  const wGroups = [...ctx.groups.keys()].filter((gid) => ctx.groupMeta(gid).isItPvs);
  checkCohort(byId.B5, wGroups, ctx.isWutthiwong, 'ครูวุฒิวงศ์ ปวส.1–2 IT');

  const lGroups = [...ctx.groups.keys()].filter((gid) => {
    const m = ctx.groupMeta(gid);
    return m.department.includes('เทคโนโลยีสารสนเทศ') && m.level === 'ปวช' && (m.year === 2 || m.year === 3);
  });
  checkCohort(byId.B6, lGroups, ctx.isLikhid, 'ครูลิขิต ปวช.2–3 IT');

  // S1 & S2: Weekly teacher load bounds (distinct timeslots)
  const teacherSlots = new Map([...ctx.teachers.keys()].map((id) => [id, new Set()]));
  for (const r of validRows) {
    teacherSlots.get(r.teacher_id)?.add(r.timeslot_id);
  }
  for (const [tid, t] of ctx.teachers) {
    const load = teacherSlots.get(tid)?.size || 0;
    const { min, max } = ctx.teacherBounds(tid);
    const isLeader = t.role === 'Leader';
    const ck = isLeader ? byId.S1 : byId.S2;
    if (!ck.enabled) continue;
    if (load < min || load > max) {
      pushViolation(ck, `${t.teacher_name} (${t.role}) สอน ${load} คาบ/สัปดาห์ (เกณฑ์ ${min}–${max} คาบ)`);
    }
  }

  // S3: Student no-gap daily schedule
  if (byId.S3.enabled) {
    const groupSlotSet = new Map([...ctx.groups.keys()].map((id) => [id, new Set()]));
    for (const r of validRows) groupSlotSet.get(r.group_id)?.add(r.timeslot_id);

    for (const [gid] of ctx.groups) {
      const occ = groupSlotSet.get(gid);
      for (let d = 0; d < ctx.days.length; d++) {
        const ds = ctx.daySlots[d];
        const idxs = [];
        for (let i = 0; i < ds.length; i++) {
          if (occ.has(ds[i])) idxs.push(i);
        }
        if (idxs.length === 0) continue;
        const first = idxs[0];
        const last = idxs[idxs.length - 1];
        if (last - first + 1 !== idxs.length) {
          const missing = [];
          for (let i = first; i <= last; i++) {
            if (!occ.has(ds[i])) missing.push(slotLabel(ctx.slotsById.get(ds[i])));
          }
          pushViolation(byId.S3, `กลุ่ม ${gid} วัน${ctx.days[d]} มีช่องว่างระหว่างคาบ (${missing.join(', ')})`);
        }
      }
    }
  }

  const formattedChecks = checks.map((ck) => {
    const violationCount = ck.enabled ? ck.violations.length : 0;
    return {
      id: ck.id,
      no: ck.no,
      name: ck.name,
      type: ck.type,
      enabled: ck.enabled,
      passed: !ck.enabled || violationCount === 0,
      violationCount,
      violations: ck.enabled ? ck.violations.slice(0, 50) : [],
    };
  });

  const passed = formattedChecks.every((ck) => ck.passed);
  return {
    passed,
    checks: formattedChecks,
    stats: {
      rows: rows.length,
      groups: new Set(validRows.map((r) => r.group_id)).size,
    },
  };
}
