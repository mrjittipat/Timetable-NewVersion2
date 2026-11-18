export function timetableStats(rows = [], ctx) {
  const days = [...ctx.days];
  const periods = [...ctx.periods];
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const periodIndex = new Map(periods.map((p, i) => [p, i]));
  const usablePerWeek = ctx.daySlots.reduce((s, d) => s + d.length, 0);
  const maxPerDay = Number(ctx.params.maxPerDay) || 8;

  // Teacher load (distinct timeslot_ids = actual time taught) & perDay
  const teacherSlots = new Map([...ctx.teachers.keys()].map((id) => [id, new Set()]));
  const teacherDaySlots = new Map([...ctx.teachers.keys()].map((id) => [id, days.map(() => new Set())]));
  const teacherPvcSlots = new Map([...ctx.teachers.keys()].map((id) => [id, new Set()]));
  const teacherPvsSlots = new Map([...ctx.teachers.keys()].map((id) => [id, new Set()]));
  const teacherRowsMap = new Map([...ctx.teachers.keys()].map((id) => [id, []]));

  const roomSlots = new Map([...ctx.rooms.keys()].map((id) => [id, new Set()]));
  const groupDayCounts = new Map([...ctx.groups.keys()].map((id) => [id, Array(days.length).fill(0)]));
  const heatGroups = days.map(() => periods.map(() => new Set()));

  for (const r of rows) {
    const slot = ctx.slotsById.get(r.timeslot_id);
    if (!slot) continue;
    const di = dayIndex.get(slot.day);
    const pi = periodIndex.get(slot.period);

    if (teacherSlots.has(r.teacher_id)) {
      teacherSlots.get(r.teacher_id).add(r.timeslot_id);
      teacherDaySlots.get(r.teacher_id)[di].add(r.timeslot_id);
      const gm = ctx.groupMeta(r.group_id);
      if (gm.level === 'ปวช') teacherPvcSlots.get(r.teacher_id).add(r.timeslot_id);
      else if (gm.level === 'ปวส') teacherPvsSlots.get(r.teacher_id).add(r.timeslot_id);
      teacherRowsMap.get(r.teacher_id).push(r);
    }

    if (roomSlots.has(r.room_id)) roomSlots.get(r.room_id).add(r.timeslot_id);
    if (groupDayCounts.has(r.group_id)) groupDayCounts.get(r.group_id)[di] += 1;
    if (di !== undefined && pi !== undefined) heatGroups[di][pi].add(r.group_id);
  }

  const teacherLoad = [...ctx.teachers.values()]
    .map((t) => ({
      id: t.teacher_id,
      name: t.teacher_name,
      role: t.role,
      periods: teacherSlots.get(t.teacher_id)?.size || 0,
      perDay: (teacherDaySlots.get(t.teacher_id) || []).map((s) => s.size),
    }))
    .sort((a, b) => b.periods - a.periods || a.id.localeCompare(b.id, undefined, { numeric: true }));

  // Individual Teacher Summary (Rule 6)
  const teacherSummary = [...ctx.teachers.values()].map((t) => {
    const tid = t.teacher_id;
    const tRows = teacherRowsMap.get(tid) || [];
    const bounds = ctx.teacherBounds(tid);
    const totalPeriods = teacherSlots.get(tid)?.size || 0;
    const pvcPeriods = teacherPvcSlots.get(tid)?.size || 0;
    const pvsPeriods = teacherPvsSlots.get(tid)?.size || 0;

    // Group rows by (subject_id, group_id) to display every course taught, and cluster concurrent slot-sets to avoid double-counting T/P/C on joint sessions
    const byCourse = new Map();
    const slotGroups = new Map();
    for (const r of tRows) {
      if (!slotGroups.has(r.timeslot_id)) slotGroups.set(r.timeslot_id, new Set());
      slotGroups.get(r.timeslot_id).add(r.group_id);
      const ck = `${r.group_id}|${r.subject_id}`;
      if (!byCourse.has(ck)) byCourse.set(ck, { group_id: r.group_id, subject_id: r.subject_id, slots: new Set() });
      byCourse.get(ck).slots.add(r.timeslot_id);
    }

    const courses = [...byCourse.values()]
      .map((entry) => {
        const sub = ctx.subjects.get(entry.subject_id);
        const gm = ctx.groupMeta(entry.group_id);
        const isJoint = [...entry.slots].some((sid) => (slotGroups.get(sid)?.size || 0) > 1);
        return {
          subject_id: entry.subject_id,
          subject_name: sub?.subject_name || entry.subject_id,
          group_id: entry.group_id,
          group_name: ctx.groups.get(entry.group_id)?.group_name || entry.group_id,
          level: gm.level || '-',
          theory: Number(sub?.theory) || 0,
          practice: Number(sub?.practice) || 0,
          credit: Number(sub?.credit) || 0,
          periods: entry.slots.size,
          isJoint,
          slotKey: [...entry.slots].sort().join(','),
        };
      })
      .sort((a, b) => a.group_id.localeCompare(b.group_id, undefined, { numeric: true }) || a.subject_id.localeCompare(b.subject_id));

    // Sum T / P / Credit per distinct teaching session (same slotKey counts once when taught jointly)
    let theory = 0;
    let practice = 0;
    let credit = 0;
    const countedSessions = new Set();
    for (const c of courses) {
      const sessionKey = c.isJoint ? `JOINT|${c.slotKey}` : `COURSE|${c.group_id}|${c.subject_id}`;
      if (countedSessions.has(sessionKey)) continue;
      countedSessions.add(sessionKey);
      theory += c.theory;
      practice += c.practice;
      credit += c.credit;
    }

    return {
      id: tid,
      name: t.teacher_name,
      role: t.role,
      department: t.department || '-',
      specialRole: t.special_role || '',
      theory,
      practice,
      credit,
      pvcPeriods,
      pvsPeriods,
      totalPeriods,
      minLoad: bounds.min,
      maxLoad: bounds.max,
      inRange: totalPeriods >= bounds.min && totalPeriods <= bounds.max,
      subjects: courses,
    };
  });

  const roomUsage = [...ctx.rooms.values()]
    .map((r) => {
      const p = roomSlots.get(r.room_id)?.size || 0;
      const pct = usablePerWeek > 0 ? Math.round((p / usablePerWeek) * 1000) / 10 : 0;
      return { id: r.room_id, name: r.room_name, type: r.room_type, periods: p, pct };
    })
    .sort((a, b) => b.pct - a.pct || a.id.localeCompare(b.id, undefined, { numeric: true }));

  const heat = days.map((_, di) =>
    periods.map((p, pi) => {
      if (p === ctx.homeroomPeriod || p === ctx.breakPeriod) return null;
      return heatGroups[di][pi].size;
    })
  );

  const groupDaily = [...ctx.groups.values()].map((g) => {
    const perDay = groupDayCounts.get(g.group_id) || Array(days.length).fill(0);
    return {
      id: g.group_id,
      name: g.group_name,
      total: perDay.reduce((a, b) => a + b, 0),
      perDay,
    };
  });

  return {
    days,
    periods,
    homeroomPeriod: ctx.homeroomPeriod,
    breakPeriod: ctx.breakPeriod,
    maxPerDay,
    groups: ctx.groups.size,
    usablePerWeek,
    teacherLoad,
    teacherSummary,
    roomUsage,
    heat,
    groupDaily,
  };
}
