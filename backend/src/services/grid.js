export const DAY_TH = {
  Mon: 'จันทร์',
  Tue: 'อังคาร',
  Wed: 'พุธ',
  Thu: 'พฤหัสบดี',
  Fri: 'ศุกร์',
  Sat: 'เสาร์',
  Sun: 'อาทิตย์',
};

export const VIEWS = ['group', 'teacher', 'room'];

export function subjectName(id, ctx) {
  return ctx.subjects.get(id)?.subject_name || id;
}

export function entitiesFor(view, ctx) {
  if (view === 'group') {
    return [...ctx.groups.values()].map((g) => ({
      id: g.group_id,
      title: `กลุ่มเรียน ${g.group_id} ${g.group_name}`,
      subtitle: `ครูที่ปรึกษา: ${g.advisor || '-'} · จำนวนนักเรียน ${g.student_count || 0} คน`,
      heading: 'ตารางเรียน',
      info: [
        ['กลุ่มเรียน', `${g.group_name} (${g.group_id})`],
        ['ครูที่ปรึกษา', g.advisor || '-'],
      ],
      signer: 'ครูที่ปรึกษา',
      signerName: String(g.advisor || '').split('/')[0].trim(),
    }));
  }
  if (view === 'teacher') {
    return [...ctx.teachers.values()].map((t) => ({
      id: t.teacher_id,
      title: `ครูผู้สอน ${t.teacher_id} ${t.teacher_name}`,
      subtitle:
        t.role === 'Leader'
          ? `ตำแหน่ง: ${t.special_role || 'หัวหน้าแผนกวิชา'} (Leader)`
          : `ตำแหน่ง: ${t.special_role ? `${t.special_role} · ` : ''}ครูผู้สอน (Teacher)`,
      heading: 'ตารางสอน',
      info: [['ผู้สอน', t.teacher_name]],
      signer: 'ครูผู้สอน',
      signerName: t.teacher_name,
    }));
  }
  return [...ctx.rooms.values()].map((r) => ({
    id: r.room_id,
    title: `ห้องเรียน ${r.room_name} (${r.room_id})`,
    subtitle: `ประเภทห้อง: ${r.room_type || '-'}`,
    heading: 'ตารางการใช้ห้องเรียน',
    info: [
      ['ห้องเรียน', `${r.room_name} (${r.room_id})`],
      ['ประเภทห้อง', r.room_type || '-'],
    ],
    signer: 'ผู้ดูแลห้อง',
    signerName: '',
  }));
}

function filterRows(view, id, rows) {
  if (view === 'group') return rows.filter((r) => r.group_id === id);
  if (view === 'teacher') return rows.filter((r) => r.teacher_id === id);
  return rows.filter((r) => r.room_id === id);
}

export function buildGrid(view, id, rows = [], ctx) {
  const entityRows = filterRows(view, id, rows);
  const periodMeta = new Map();
  for (const s of ctx.slotsById.values()) {
    if (!periodMeta.has(s.period)) {
      periodMeta.set(s.period, {
        period: s.period,
        start: s.start,
        end: s.end,
        isHomeroom: s.period === ctx.homeroomPeriod,
        isBreak: s.period === ctx.breakPeriod,
        breakLabel: s.period === ctx.homeroomPeriod ? 'Homeroom' : s.period === ctx.breakPeriod ? 'พัก' : '',
      });
    }
  }
  const periods = ctx.periods.map((p) => periodMeta.get(p) || { period: p, start: '', end: '', isHomeroom: false, isBreak: false, breakLabel: '' });
  const days = ctx.days.map((k) => ({ key: k, label: DAY_TH[k] || k }));

  const usedSlots = new Set();
  const byDayPeriod = new Map();
  for (const r of entityRows) {
    const slot = ctx.slotsById.get(r.timeslot_id);
    if (!slot) continue;
    usedSlots.add(r.timeslot_id);
    const key = `${slot.day}|${slot.period}`;
    if (!byDayPeriod.has(key)) byDayPeriod.set(key, []);
    byDayPeriod.get(key).push(r);
  }

  const cells = ctx.days.map((day) => {
    const dayCells = [];
    for (const p of ctx.periods) {
      if (p === ctx.homeroomPeriod || p === ctx.breakPeriod) continue;
      const list = byDayPeriod.get(`${day}|${p}`) || [];
      if (list.length === 0) continue;

      const slotId = list[0].timeslot_id;
      const teachersSet = new Set(list.map((r) => r.teacher_id));
      const roomsSet = new Set(list.map((r) => r.room_id));
      const subsSet = new Set(list.map((r) => r.subject_id));
      const groups = [...new Set(list.map((r) => r.group_id))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      let clash = false;
      if (view === 'group') {
        clash = list.length > 1;
      } else if (list.length > 1) {
        const sameTeacher = teachersSet.size === 1;
        const sameRoom = roomsSet.size === 1;
        const jointOk = sameTeacher && sameRoom && ctx.isJointSlotAllowed(slotId, groups, list[0].teacher_id);
        if (!jointOk && subsSet.size > 1) clash = true;
        else if (!jointOk && view === 'teacher' && roomsSet.size > 1) clash = true;
        else if (!jointOk && view === 'room' && teachersSet.size > 1) clash = true;
        else if (!jointOk && !ctx.isJointSlotAllowed(slotId, groups, list[0].teacher_id)) clash = true;
      }

      const subjectIds = [...subsSet];
      const subjectLabel = subjectIds.join(' / ');
      const subjectFull = subjectIds.map((sid) => subjectName(sid, ctx)).join(' / ');
      const teacherId = list[0].teacher_id;
      const teacherName = ctx.teachers.get(teacherId)?.teacher_name || teacherId;
      const room = list[0].room_id;

      const prev = dayCells[dayCells.length - 1];
      const canMerge =
        prev &&
        !clash &&
        !prev.clash &&
        prev.start + prev.span === p &&
        prev.subject_id === subjectLabel &&
        prev.teacher_id === teacherId &&
        prev.room === room &&
        prev.groups.join('+') === groups.join('+');

      if (canMerge) {
        prev.span += 1;
      } else {
        dayCells.push({
          start: p,
          span: 1,
          subject_id: subjectLabel,
          subject_name: subjectFull,
          teacher_id: teacherId,
          teacher: teacherName,
          room,
          groups,
          clash,
        });
      }
    }
    return dayCells;
  });

  return { days, periods, cells, total: usedSlots.size };
}

export function subjectSummary(view, id, rows = [], ctx) {
  const entityRows = filterRows(view, id, rows);
  const seen = new Set();
  const list = [];
  for (const r of entityRows) {
    if (seen.has(r.subject_id)) continue;
    seen.add(r.subject_id);
    const sub = ctx.subjects.get(r.subject_id);
    if (!sub) continue;
    const t = Number(sub.theory) || 0;
    const p = Number(sub.practice) || 0;
    const n = Number(sub.credit) || 0;
    const h = ctx.hours(r.subject_id);
    list.push({ subject_id: r.subject_id, name: sub.subject_name, t, p, n, h });
  }
  list.sort((a, b) => a.subject_id.localeCompare(b.subject_id, undefined, { numeric: true }));
  const total = list.reduce(
    (acc, x) => ({ t: acc.t + x.t, p: acc.p + x.p, n: acc.n + x.n, h: acc.h + x.h }),
    { t: 0, p: 0, n: 0, h: 0 }
  );
  return { list, total };
}
