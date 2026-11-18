import { httpError } from './store.js';

function resolveSpanSlots(ctx, day, startPeriod, length) {
  const dayIdx = ctx.days.indexOf(day);
  if (dayIdx === -1) return null;
  const ds = ctx.daySlots[dayIdx];
  const slots = [];
  for (let i = 0; i < ds.length; i++) {
    if (ctx.slotsById.get(ds[i])?.period === Number(startPeriod)) {
      if (i + length > ds.length) return null;
      for (let k = 0; k < length; k++) slots.push(ds[i + k]);
      return slots;
    }
  }
  return null;
}

function matchesEntity(view, id, row) {
  if (view === 'group') return row.group_id === id;
  if (view === 'teacher') return row.teacher_id === id;
  return row.room_id === id;
}

function expandJointIndices(rows, baseIndices, ctx) {
  const idxSet = new Set(baseIndices);
  for (const idx of baseIndices) {
    const r = rows[idx];
    if (!ctx.thuActivitySlots.includes(r.timeslot_id)) continue;
    for (let j = 0; j < rows.length; j++) {
      if (idxSet.has(j)) continue;
      const o = rows[j];
      if (
        o.timeslot_id === r.timeslot_id &&
        o.teacher_id === r.teacher_id &&
        ctx.isJointSlotAllowed(r.timeslot_id, [r.group_id, o.group_id], r.teacher_id)
      ) {
        idxSet.add(j);
      }
    }
  }
  return idxSet;
}

export function moveSpan(rows = [], ctx, { view = 'group', id, fromDay, fromPeriod, length = 1, toDay, toPeriod }) {
  const len = Math.max(1, Number(length) || 1);
  const fromSlots = resolveSpanSlots(ctx, fromDay, fromPeriod, len);
  const toSlots = resolveSpanSlots(ctx, toDay, toPeriod, len);
  if (!fromSlots || !toSlots) {
    throw httpError(400, 'ช่วงคาบปลายทางไม่พอหรือตรงกับคาบพัก');
  }
  if (fromSlots[0] === toSlots[0]) return rows.map((r) => ({ ...r }));

  const fromSet = new Set(fromSlots);
  if (toSlots.some((s) => fromSet.has(s))) {
    throw httpError(400, 'ช่วงต้นทางและปลายทางซ้อนกัน');
  }

  const baseMoving = [];
  for (let i = 0; i < rows.length; i++) {
    if (matchesEntity(view, id, rows[i]) && fromSet.has(rows[i].timeslot_id)) {
      baseMoving.push(i);
    }
  }
  if (baseMoving.length === 0) throw httpError(404, 'ไม่พบคาบที่ต้องการย้าย');

  const movingSet = expandJointIndices(rows, baseMoving, ctx);
  const affectedGroups = new Set([...movingSet].map((i) => rows[i].group_id));

  const toSet = new Set(toSlots);
  const baseSwap = [];
  for (let i = 0; i < rows.length; i++) {
    if (!movingSet.has(i) && affectedGroups.has(rows[i].group_id) && toSet.has(rows[i].timeslot_id)) {
      baseSwap.push(i);
    }
  }
  const swapSet = expandJointIndices(rows, baseSwap, ctx);

  const fromMap = new Map(fromSlots.map((s, k) => [s, toSlots[k]]));
  const toMap = new Map(toSlots.map((s, k) => [s, fromSlots[k]]));

  return rows.map((r, i) => {
    if (movingSet.has(i)) return { ...r, timeslot_id: fromMap.get(r.timeslot_id) || r.timeslot_id };
    if (swapSet.has(i)) return { ...r, timeslot_id: toMap.get(r.timeslot_id) || r.timeslot_id };
    return { ...r };
  });
}

export function editSpan(rows = [], ctx, { view = 'group', id, day, period, length = 1, teacher_id, room_id }) {
  const len = Math.max(1, Number(length) || 1);
  const spanSlots = resolveSpanSlots(ctx, day, period, len);
  if (!spanSlots) throw httpError(400, 'ช่วงคาบที่เลือกไม่ถูกต้อง');

  const spanSet = new Set(spanSlots);
  const baseIndices = [];
  for (let i = 0; i < rows.length; i++) {
    if (matchesEntity(view, id, rows[i]) && spanSet.has(rows[i].timeslot_id)) {
      baseIndices.push(i);
    }
  }
  if (baseIndices.length === 0) throw httpError(404, 'ไม่พบคาบที่ต้องการแก้ไข');

  const targetSet = expandJointIndices(rows, baseIndices, ctx);
  return rows.map((r, i) => {
    if (!targetSet.has(i)) return { ...r };
    return {
      ...r,
      teacher_id: teacher_id ? String(teacher_id).trim() : r.teacher_id,
      room_id: room_id ? String(room_id).trim() : r.room_id,
    };
  });
}
