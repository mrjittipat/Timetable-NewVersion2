import { mergeConfig } from './config.js';

function normName(s) {
  return String(s || '')
    .replace(/^(นาย|นางสาว|นาง|ครู)/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

export function buildContext(data = {}, config = {}) {
  const cfg = mergeConfig(config);
  const { params, constraints } = cfg;
  const warnings = [];

  const days = [];
  const dayIndexMap = new Map();
  const slotsById = new Map();
  const periodSet = new Set();

  for (const raw of data.timeslot || []) {
    const id = String(raw.timeslot_id || '').trim();
    const day = String(raw.day || '').trim();
    const period = Number(raw.period);
    if (!id || !day || !Number.isFinite(period)) continue;
    if (!dayIndexMap.has(day)) {
      dayIndexMap.set(day, days.length);
      days.push(day);
    }
    const dayIdx = dayIndexMap.get(day);
    slotsById.set(id, { ...raw, id, day, period, dayIdx });
    periodSet.add(period);
  }

  const periods = [...periodSet].sort((a, b) => a - b);
  const homeroomPeriod = Number(params.homeroomPeriod ?? 1);
  const breakPeriod = Number(params.breakPeriod ?? 6);

  const daySlots = days.map((_, dayIdx) =>
    [...slotsById.values()]
      .filter((s) => s.dayIdx === dayIdx && s.period !== homeroomPeriod && s.period !== breakPeriod)
      .sort((a, b) => a.period - b.period)
      .map((s) => s.id)
  );

  const teachers = new Map();
  for (const t of data.teacher || []) {
    if (t.teacher_id) teachers.set(t.teacher_id, { ...t });
  }

  const groups = new Map();
  for (const g of data.student_group || []) {
    if (g.group_id) groups.set(g.group_id, { ...g });
  }

  const subjects = new Map();
  for (const s of data.subject || []) {
    if (s.subject_id) subjects.set(s.subject_id, { ...s });
  }

  const rooms = new Map();
  for (const r of data.room || []) {
    if (!r.room_id) continue;
    if (!/^[A-Za-z0-9_-]+$/.test(r.room_id)) {
      warnings.push({ level: 'warn', message: `ห้อง "${r.room_id}" มีรหัสไม่ถูกต้อง จึงไม่นำมาใช้จัดตาราง` });
      continue;
    }
    rooms.set(r.room_id, { ...r });
  }

  const teachersBySubject = new Map();
  for (const row of data.teach || []) {
    if (!teachers.has(row.teacher_id)) {
      warnings.push({ level: 'warn', message: `teach.csv อ้างถึงครู ${row.teacher_id} ที่ไม่มีใน teacher.csv` });
      continue;
    }
    if (!teachersBySubject.has(row.subject_id)) teachersBySubject.set(row.subject_id, []);
    const list = teachersBySubject.get(row.subject_id);
    if (!list.includes(row.teacher_id)) list.push(row.teacher_id);
  }

  function hours(subjectId) {
    const s = subjects.get(subjectId);
    if (!s) return 0;
    const tp = (Number(s.theory) || 0) + (Number(s.practice) || 0);
    const h = Number(s.hours) || 0;
    if (tp <= 0) return Math.max(0, h);
    return h > 0 ? Math.min(tp, h) : tp;
  }

  const seenReg = new Set();
  const registrations = [];
  const registeredGroups = new Set();
  for (const row of data.register || []) {
    const k = `${row.group_id}|${row.subject_id}`;
    if (seenReg.has(k)) continue;
    seenReg.add(k);

    if (!groups.has(row.group_id)) {
      warnings.push({ level: 'error', message: `register.csv อ้างถึงกลุ่ม ${row.group_id} ที่ไม่มีใน student_group.csv` });
      continue;
    }
    if (!subjects.has(row.subject_id)) {
      warnings.push({ level: 'error', message: `register.csv อ้างถึงวิชา ${row.subject_id} ที่ไม่มีใน subject.csv` });
      continue;
    }
    registeredGroups.add(row.group_id);
    const h = hours(row.subject_id);
    if (h === 0) {
      warnings.push({ level: 'warn', message: `วิชา ${row.subject_id} มีจำนวนคาบเป็น 0` });
    }
    const ts = teachersBySubject.get(row.subject_id) || [];
    if (h > 0 && ts.length === 0) {
      warnings.push({ level: 'error', message: `วิชา ${row.subject_id} ที่กลุ่ม ${row.group_id} ลงทะเบียน ไม่มีครูผู้สอนใน teach.csv` });
    }
    registrations.push({ group_id: row.group_id, subject_id: row.subject_id });
  }

  for (const gid of groups.keys()) {
    if (!registeredGroups.has(gid)) {
      warnings.push({ level: 'warn', message: `กลุ่ม ${gid} ไม่มีรายวิชาที่ลงทะเบียน` });
    }
  }

  function roomsFor(_subjectId) {
    return [...rooms.keys()];
  }

  function groupMeta(groupId) {
    const g = groups.get(groupId);
    if (!g) return { department: '', level: '', year: 0, isYear1Pvc: false, isItPvs: false };
    const name = g.group_name || '';
    const level = g.level || (name.includes('ปวส') ? 'ปวส' : name.includes('ปวช') ? 'ปวช' : '');
    let year = Number(g.year) || 0;
    if (!year) {
      const m = name.match(/(?:ปวช|ปวส)\.?\s*(\d+)/);
      if (m) year = Number(m[1]);
    }
    const department =
      g.department ||
      (name.includes('เทคโนโลยีสารสนเทศ')
        ? 'เทคโนโลยีสารสนเทศ'
        : name.includes('เทคโนโลยีธุรกิจดิจิทัล')
          ? 'เทคโนโลยีธุรกิจดิจิทัล'
          : '');
    return {
      department,
      level,
      year,
      isYear1Pvc: level === 'ปวช' && year === 1,
      isItPvs: department.includes('เทคโนโลยีสารสนเทศ') && level === 'ปวส' && (year === 1 || year === 2),
    };
  }

  function teacherBounds(teacherId) {
    const t = teachers.get(teacherId);
    if (t?.role === 'Leader') {
      return {
        min: Number(params.leaderMinPeriods ?? 20),
        max: Number(params.leaderMaxPeriods ?? 30),
      };
    }
    return {
      min: Number(params.teacherMinPeriods ?? 25),
      max: Number(params.teacherMaxPeriods ?? 35),
    };
  }

  function isActivity(subjectId) {
    if (subjectId.startsWith('20000-') || subjectId.startsWith('30000-')) return true;
    const s = subjects.get(subjectId);
    return Boolean(s?.subject_name && s.subject_name.startsWith('กิจกรรม'));
  }

  function isScout(subjectId) {
    const s = subjects.get(subjectId);
    return Boolean(s?.subject_name && s.subject_name.includes('ลูกเสือ'));
  }

  function isWutthiwong(teacherId) {
    const t = teachers.get(teacherId);
    return Boolean(t && (t.teacher_name.includes('วุฒิวงศ์') || teacherId === 'T01'));
  }

  function isLikhid(teacherId) {
    const t = teachers.get(teacherId);
    return Boolean(t && (t.teacher_name.includes('ลิขิต') || teacherId === 'T02'));
  }

  const thuDayIdx = days.indexOf('Thu');
  const thuActivitySlots =
    thuDayIdx >= 0
      ? [...slotsById.values()]
          .filter((s) => s.dayIdx === thuDayIdx && (s.period === 2 || s.period === 3))
          .sort((a, b) => a.period - b.period)
          .map((s) => s.id)
      : [];

  function advisorTeacherId(groupId) {
    const g = groups.get(groupId);
    if (!g?.advisor) return null;
    const parts = g.advisor.split('/').map(normName).filter(Boolean);
    for (const part of parts) {
      for (const [tid, t] of teachers) {
        const tn = normName(t.teacher_name);
        if (tn && (tn === part || tn.includes(part) || part.includes(tn))) return tid;
      }
    }
    return null;
  }

  // Build concurrent Thursday P2-P3 activity cohorts (Rule 2 Year-1 Scout, Rule 8 Wutthiwong, Rule 9 Likhid)
  const jointCohorts = [];
  const actByGroup = new Map();
  for (const reg of registrations) {
    if (hours(reg.subject_id) > 0 && isActivity(reg.subject_id)) {
      if (!actByGroup.has(reg.group_id)) actByGroup.set(reg.group_id, []);
      actByGroup.get(reg.group_id).push(reg.subject_id);
    }
  }

  const assignedToCohort = new Set();
  const findByPred = (pred) => [...teachers.keys()].find(pred) || null;
  const wId = findByPred(isWutthiwong);
  const lId = findByPred(isLikhid);

  // Rule 8: Wutthiwong IT PVS 1 & 2
  const wGroups = [...groups.keys()].filter((gid) => {
    const m = groupMeta(gid);
    return m.isItPvs && actByGroup.has(gid);
  });
  if (wId && wGroups.length > 0 && thuActivitySlots.length === 2) {
    const subjectsByGroup = new Map();
    for (const gid of wGroups) {
      subjectsByGroup.set(gid, actByGroup.get(gid)[0]);
      assignedToCohort.add(gid);
    }
    jointCohorts.push({ id: 'C_WUTTHIWONG', teacherId: wId, groups: wGroups, slots: thuActivitySlots, subjectsByGroup });
  }

  // Rule 9: Likhid IT PVC 2 & 3
  const lGroups = [...groups.keys()].filter((gid) => {
    const m = groupMeta(gid);
    return m.department.includes('เทคโนโลยีสารสนเทศ') && m.level === 'ปวช' && (m.year === 2 || m.year === 3) && actByGroup.has(gid);
  });
  if (lId && lGroups.length > 0 && thuActivitySlots.length === 2) {
    const subjectsByGroup = new Map();
    for (const gid of lGroups) {
      subjectsByGroup.set(gid, actByGroup.get(gid)[0]);
      assignedToCohort.add(gid);
    }
    jointCohorts.push({ id: 'C_LIKHID', teacherId: lId, groups: lGroups, slots: thuActivitySlots, subjectsByGroup });
  }

  // Rule 2: Year-1 PVC Scout cohort grouped by shared Scout subject_id
  const scoutGroupsBySub = new Map();
  for (const gid of groups.keys()) {
    if (assignedToCohort.has(gid)) continue;
    const m = groupMeta(gid);
    if (!m.isYear1Pvc || !actByGroup.has(gid)) continue;
    const scoutSid = actByGroup.get(gid).find(isScout);
    if (!scoutSid) continue;
    if (!scoutGroupsBySub.has(scoutSid)) scoutGroupsBySub.set(scoutSid, []);
    scoutGroupsBySub.get(scoutSid).push(gid);
  }
  for (const [scoutSid, gids] of scoutGroupsBySub) {
    const cands = teachersBySubject.get(scoutSid) || [];
    const tid = cands.find((id) => !isWutthiwong(id)) || cands[0] || advisorTeacherId(gids[0]);
    if (tid && gids.length > 1 && thuActivitySlots.length === 2) {
      const subjectsByGroup = new Map();
      for (const gid of gids) {
        subjectsByGroup.set(gid, scoutSid);
        assignedToCohort.add(gid);
      }
      jointCohorts.push({ id: `C_SCOUT_${scoutSid}`, teacherId: tid, groups: gids, slots: thuActivitySlots, subjectsByGroup });
    }
  }

  function isJointSlotAllowed(slotId, groupIds, teacherId) {
    if (!thuActivitySlots.includes(slotId)) return false;
    return jointCohorts.some(
      (c) => c.teacherId === teacherId && groupIds.every((gid) => c.groups.includes(gid))
    );
  }

  return {
    config: cfg,
    params,
    constraints,
    warnings,
    days,
    periods,
    homeroomPeriod,
    breakPeriod,
    daySlots,
    slotsById,
    teachers,
    groups,
    subjects,
    rooms,
    teachersBySubject,
    registrations,
    hours,
    roomsFor,
    groupMeta,
    teacherBounds,
    isActivity,
    isScout,
    isWutthiwong,
    isLikhid,
    thuDayIdx,
    thuActivitySlots,
    advisorTeacherId,
    jointCohorts,
    isJointSlotAllowed,
  };
}
