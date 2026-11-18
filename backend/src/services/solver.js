import { buildContext } from './context.js';

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

function splitHours(h, maxBlock, checkS3 = false) {
  if (checkS3) {
    const cap = Math.min(2, Math.max(1, maxBlock));
    const lens = [];
    let rem = h;
    while (rem > 0) {
      const take = Math.min(cap, rem);
      lens.push(take);
      rem -= take;
    }
    return lens;
  }
  const n = Math.ceil(h / Math.max(1, maxBlock));
  const base = Math.floor(h / n);
  const rem = h % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export function buildBlocks(ctx) {
  const errors = ctx.warnings.filter((w) => w.level === 'error').map((w) => w.message);
  if (errors.length > 0) return { errors, courses: [], blocks: [] };

  const maxBlock = Math.max(1, Number(ctx.params.maxBlock) || 4);
  const checkS3 = Boolean(ctx.constraints.S3);
  const courses = [];
  const blocks = [];
  const handled = new Set();

  function addCourse({ subjectId, groups, hours, teachers, rooms, kind, subByGroup = null, fixed = null }) {
    const label = groups.join('+');
    if (teachers.length === 0) {
      errors.push(`${subjectId} (${label}) ไม่มีครูที่สอนได้`);
      return;
    }
    if (rooms.length === 0) {
      errors.push(`${subjectId} (${label}) ไม่มีห้องที่ใช้ได้ตามเงื่อนไข`);
      return;
    }
    const course = { id: courses.length, subjectId, groups, hours, teachers, rooms, kind, subByGroup, blockIds: [] };
    courses.push(course);
    const lens = fixed ? [hours] : splitHours(hours, maxBlock, checkS3);
    for (const len of lens) {
      const block = { id: blocks.length, course, len, fixed };
      blocks.push(block);
      course.blockIds.push(block.id);
    }
  }

  // 1. Concurrent Thursday P2-P3 cohorts (Rule 2 Year-1 Scout, Rule 8 Wutthiwong, Rule 9 Likhid)
  for (const cohort of ctx.jointCohorts) {
    const subIds = [...cohort.subjectsByGroup.values()];
    const rooms = ctx.roomsFor(subIds[0]);
    for (const [gid, sid] of cohort.subjectsByGroup) handled.add(`${gid}|${sid}`);
    addCourse({
      subjectId: subIds.join('/'),
      groups: cohort.groups,
      hours: 2,
      teachers: [cohort.teacherId],
      rooms,
      kind: 'activity',
      subByGroup: cohort.subjectsByGroup,
      fixed: { day: ctx.thuDayIdx, slots: cohort.slots, teacher: cohort.teacherId },
    });
  }

  // 2. Remaining registrations
  for (const reg of ctx.registrations) {
    const key = `${reg.group_id}|${reg.subject_id}`;
    if (handled.has(key)) continue;
    const h = ctx.hours(reg.subject_id);
    if (h === 0) continue;

    const rawTeachers = ctx.teachersBySubject.get(reg.subject_id) || [];
    const isItPvs = ctx.groupMeta(reg.group_id).isItPvs;
    let eligible = rawTeachers.filter((tid) => !ctx.isWutthiwong(tid) || isItPvs);
    const rooms = ctx.roomsFor(reg.subject_id);

    if (ctx.isActivity(reg.subject_id) && ctx.thuDayIdx >= 0 && ctx.thuActivitySlots.length === 2) {
      const adv = ctx.advisorTeacherId(reg.group_id);
      if (adv && eligible.includes(adv)) eligible = [adv];
      addCourse({
        subjectId: reg.subject_id,
        groups: [reg.group_id],
        hours: h,
        teachers: eligible,
        rooms,
        kind: 'activity',
        fixed: { day: ctx.thuDayIdx, slots: ctx.thuActivitySlots, teacher: eligible.length === 1 ? eligible[0] : null },
      });
    } else {
      addCourse({
        subjectId: reg.subject_id,
        groups: [reg.group_id],
        hours: h,
        teachers: eligible,
        rooms,
        kind: 'normal',
      });
    }
  }

  return { errors, courses, blocks };
}

class Board {
  constructor(ctx, courses, blocks) {
    this.ctx = ctx;
    this.courses = courses;
    this.blocks = blocks;

    this.groupList = [...ctx.groups.keys()];
    this.teacherList = [...ctx.teachers.keys()];
    this.roomList = [...ctx.rooms.keys()];
    this.slotList = [...ctx.slotsById.keys()];

    this.gIdx = new Map(this.groupList.map((id, i) => [id, i]));
    this.tIdx = new Map(this.teacherList.map((id, i) => [id, i]));
    this.rIdx = new Map(this.roomList.map((id, i) => [id, i]));
    this.sIdx = new Map(this.slotList.map((id, i) => [id, i]));

    this.G = this.groupList.length;
    this.T = this.teacherList.length;
    this.R = this.roomList.length;
    this.S = this.slotList.length;
    this.D = ctx.days.length;

    // Precompute integer indices on courses/blocks/daySlots
    this.daySlotIdx = ctx.daySlots.map((arr) => arr.map((id) => this.sIdx.get(id)));
    this.slotPeriods = this.slotList.map((id) => ctx.slotsById.get(id).period);
    this.slotPeriodMap = new Map(this.slotList.map((id, i) => [id, this.slotPeriods[i]]));
    this.breakPeriod = Number(ctx.params.breakPeriod) || 6;
    this.morningCount = this.daySlotIdx.map(
      (ds) => ds.filter((si) => this.slotPeriods[si] < this.breakPeriod).length
    );

    this.tDept = this.teacherList.map((id) => ctx.teachers.get(id)?.department || '');
    this.tIsIt = this.teacherList.map((id) => (ctx.teachers.get(id)?.department || '').includes('เทคโนโลยีสารสนเทศ'));
    this.tIsLeader = this.teacherList.map((id) => ctx.teachers.get(id)?.role === 'Leader');
    this.tMin = this.teacherList.map((id) => ctx.teacherBounds(id).min);
    this.tMax = this.teacherList.map((id) => ctx.teacherBounds(id).max);
    this.tIsWutthiwong = this.teacherList.map((id) => ctx.isWutthiwong(id));
    this.gDept = this.groupList.map((id) => ctx.groupMeta(id).department);
    this.gIsItPvs = this.groupList.map((id) => ctx.groupMeta(id).isItPvs);

    for (const c of this.courses) {
      c.gIdxs = c.groups.map((id) => this.gIdx.get(id));
      c.tIdxs = c.teachers.map((id) => this.tIdx.get(id));
      c.rIdxs = c.rooms.map((id) => this.rIdx.get(id));
    }
    for (const b of this.blocks) {
      if (b.fixed) {
        b.fixedSlotIdxs = b.fixed.slots.map((id) => this.sIdx.get(id));
        b.fixedTIdx = b.fixed.teacher ? this.tIdx.get(b.fixed.teacher) : -1;
      }
    }

    this.groupOcc = new Int32Array(this.G * this.S);
    this.teacherOcc = new Int32Array(this.T * this.S);
    this.roomOcc = new Int32Array(this.R * this.S);
    this.dayLoad = new Int32Array(this.G * this.D);
    this.groupTotalRem = new Int32Array(this.G);
    this.teacherLoad = new Int32Array(this.T);

    this.place = Array(blocks.length).fill(null);
    this.courseTeacher = new Map();
    this.unplaced = new Set();

    this.groupBlocks = new Map(this.groupList.map((g) => [g, []]));
    for (const b of blocks) {
      for (const g of b.course.groups) this.groupBlocks.get(g).push(b.id);
    }
    this.groupBlockIdxs = this.groupList.map((g) => this.groupBlocks.get(g));

    this.checkS1 = Boolean(ctx.constraints.S1);
    this.checkS2 = Boolean(ctx.constraints.S2);
    this.checkS3 = Boolean(ctx.constraints.S3);
    this.maxPerDay = Number(ctx.params.maxPerDay) || 8;
    this.latestPreferred = Number(ctx.params.latestPreferredPeriod) || 10;

    this.clear();
  }

  clear() {
    this.groupOcc.fill(-1);
    this.teacherOcc.fill(-1);
    this.roomOcc.fill(-1);
    this.dayLoad.fill(0);
    this.groupTotalRem.fill(0);
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      for (let gi = 0; gi < b.course.gIdxs.length; gi++) {
        this.groupTotalRem[b.course.gIdxs[gi]] += b.len;
      }
    }
    this.teacherLoad.fill(0);
    this.place.fill(null);
    this.courseTeacher.clear();
    this.unplaced.clear();
    for (let i = 0; i < this.blocks.length; i++) this.unplaced.add(i);
  }

  teacherMaxEnabled(ti) {
    return this.tIsLeader[ti] ? this.checkS1 : this.checkS2;
  }

  courseRemHours(c) {
    let s = 0;
    for (const bid of c.blockIds) if (!this.place[bid]) s += this.blocks[bid].len;
    return s;
  }

  pickRoom(c, slotIdxs, rng) {
    for (const bid of c.blockIds) {
      const p = this.place[bid];
      if (!p) continue;
      const base = p.rIdx * this.S;
      let free = true;
      for (let i = 0; i < slotIdxs.length; i++) {
        if (this.roomOcc[base + slotIdxs[i]] !== -1) {
          free = false;
          break;
        }
      }
      if (free) return p.rIdx;
    }
    const rIdxs = c.rIdxs;
    const len = rIdxs.length;
    if (len === 0) return -1;
    const start = Math.floor(rng() * len);
    for (let k = 0; k < len; k++) {
      const ri = rIdxs[(start + k) % len];
      const base = ri * this.S;
      let free = true;
      for (let i = 0; i < slotIdxs.length; i++) {
        if (this.roomOcc[base + slotIdxs[i]] !== -1) {
          free = false;
          break;
        }
      }
      if (free) return ri;
    }
    return -1;
  }

  options(b, rng) {
    const c = b.course;
    const held = this.courseTeacher.get(c.id);
    const ts = held !== undefined ? [held.tIdx] : c.tIdxs;
    const positions = [];

    if (b.fixed) {
      positions.push({ day: b.fixed.day, slotIdxs: b.fixedSlotIdxs, cur: 0 });
    } else if (this.checkS3) {
      const g = c.gIdxs[0];
      for (let d = 0; d < this.D; d++) {
        const cur = this.dayLoad[g * this.D + d];
        const mCount = this.morningCount[d] ?? 4;
        const ds = this.daySlotIdx[d];
        if (cur < mCount && cur + b.len > mCount) continue;
        if (cur + b.len > ds.length || cur + b.len > this.maxPerDay) continue;
        positions.push({ day: d, slotIdxs: ds.slice(cur, cur + b.len), cur });
      }
    } else {
      const usedDays = c.blockIds.length <= this.D ? new Set() : null;
      if (usedDays) {
        for (const bid of c.blockIds) {
          const p = this.place[bid];
          if (p) usedDays.add(p.day);
        }
      }
      for (let d = 0; d < this.D; d++) {
        if (usedDays && usedDays.has(d)) continue;
        const ds = this.daySlotIdx[d];
        for (let i = 0; i <= ds.length - b.len; i++) {
          positions.push({ day: d, slotIdxs: ds.slice(i, i + b.len), cur: i });
        }
      }
    }

    const out = [];
    const needHours = held !== undefined ? b.len : this.courseRemHours(c);

    for (const pos of positions) {
      let gOk = true;
      for (let gi = 0; gi < c.gIdxs.length; gi++) {
        const g = c.gIdxs[gi];
        if (this.dayLoad[g * this.D + pos.day] + b.len > this.maxPerDay) {
          gOk = false;
          break;
        }
        const gBase = g * this.S;
        for (let k = 0; k < pos.slotIdxs.length; k++) {
          if (this.groupOcc[gBase + pos.slotIdxs[k]] !== -1) {
            gOk = false;
            break;
          }
        }
        if (!gOk) break;
      }
      if (!gOk) continue;

      for (let tiIdx = 0; tiIdx < ts.length; tiIdx++) {
        const ti = ts[tiIdx];
        if (b.fixed && b.fixedTIdx !== -1 && ti !== b.fixedTIdx) continue;
        if (this.teacherMaxEnabled(ti) && this.teacherLoad[ti] + needHours > this.tMax[ti]) continue;

        const tBase = ti * this.S;
        let tOk = true;
        for (let k = 0; k < pos.slotIdxs.length; k++) {
          if (this.teacherOcc[tBase + pos.slotIdxs[k]] !== -1) {
            tOk = false;
            break;
          }
        }
        if (!tOk) continue;

        const ri = this.pickRoom(c, pos.slotIdxs, rng);
        if (ri !== -1) {
          out.push({ day: pos.day, slotIdxs: pos.slotIdxs, tIdx: ti, rIdx: ri, cur: pos.cur ?? 0 });
        }
      }
    }
    return out;
  }

  assign(b, opt) {
    this.place[b.id] = opt;
    this.unplaced.delete(b.id);
    const c = b.course;
    for (let gi = 0; gi < c.gIdxs.length; gi++) {
      const g = c.gIdxs[gi];
      this.groupTotalRem[g] -= b.len;
      this.dayLoad[g * this.D + opt.day] += b.len;
      const gBase = g * this.S;
      for (let k = 0; k < opt.slotIdxs.length; k++) {
        this.groupOcc[gBase + opt.slotIdxs[k]] = b.id;
      }
    }
    const tBase = opt.tIdx * this.S;
    const rBase = opt.rIdx * this.S;
    for (let k = 0; k < opt.slotIdxs.length; k++) {
      const s = opt.slotIdxs[k];
      this.teacherOcc[tBase + s] = b.id;
      this.roomOcc[rBase + s] = b.id;
    }
    this.teacherLoad[opt.tIdx] += b.len;
    const ct = this.courseTeacher.get(c.id);
    if (ct) ct.refs++;
    else this.courseTeacher.set(c.id, { tIdx: opt.tIdx, refs: 1 });
  }

  unassign(b) {
    const opt = this.place[b.id];
    this.place[b.id] = null;
    this.unplaced.add(b.id);
    const c = b.course;
    for (let gi = 0; gi < c.gIdxs.length; gi++) {
      const g = c.gIdxs[gi];
      this.groupTotalRem[g] += b.len;
      this.dayLoad[g * this.D + opt.day] -= b.len;
      const gBase = g * this.S;
      for (let k = 0; k < opt.slotIdxs.length; k++) {
        this.groupOcc[gBase + opt.slotIdxs[k]] = -1;
      }
    }
    const tBase = opt.tIdx * this.S;
    const rBase = opt.rIdx * this.S;
    for (let k = 0; k < opt.slotIdxs.length; k++) {
      const s = opt.slotIdxs[k];
      this.teacherOcc[tBase + s] = -1;
      this.roomOcc[rBase + s] = -1;
    }
    this.teacherLoad[opt.tIdx] -= b.len;
    const ct = this.courseTeacher.get(c.id);
    ct.refs--;
    if (ct.refs === 0) this.courseTeacher.delete(c.id);
  }

  wasteAfter(g, b, opt) {
    const bids = this.groupBlockIdxs[g];
    let minLen = Infinity;
    for (let i = 0; i < bids.length; i++) {
      const bid = bids[i];
      if (bid === b.id || this.place[bid] || this.blocks[bid].fixed) continue;
      if (this.blocks[bid].len < minLen) minLen = this.blocks[bid].len;
    }
    if (!Number.isFinite(minLen)) return 0;
    const ds = this.daySlotIdx[opt.day];
    const gBase = g * this.S;
    let waste = 0;
    let run = 0;
    for (let i = 0; i < ds.length; i++) {
      const s = ds[i];
      let inOpt = false;
      for (let k = 0; k < opt.slotIdxs.length; k++) {
        if (opt.slotIdxs[k] === s) {
          inOpt = true;
          break;
        }
      }
      if (!inOpt && this.groupOcc[gBase + s] === -1) run++;
      else {
        if (run > 0 && run < minLen) waste += run;
        run = 0;
      }
    }
    if (run > 0 && run < minLen) waste += run;
    return waste;
  }

  score(b, opt) {
    let sc = 0;
    const c = b.course;
    if (this.checkS3) {
      const g = c.gIdxs[0];
      const mCount = this.morningCount[opt.day] ?? 4;
      const cur = opt.cur ?? this.dayLoad[g * this.D + opt.day];
      if (cur >= mCount) sc -= 40 + (cur - mCount) * 3;
      else if (cur > 0) sc -= cur * 6;
      else sc += 15;
      if (cur > 0 && cur !== mCount) {
        const prevBid = this.groupOcc[g * this.S + this.daySlotIdx[opt.day][cur - 1]];
        if (prevBid >= 0 && this.blocks[prevBid].course.id === c.id) sc -= 12;
      }
      const ti = opt.tIdx;
      if (this.tIsWutthiwong[ti]) sc -= 25;
      sc -= (this.tMax[ti] - this.teacherLoad[ti]) * 0.25;
      const gd = this.gDept[g];
      const td = this.tDept[ti];
      if (gd && td && gd !== td) sc += 12;
      return sc;
    }
    for (let k = 0; k < opt.slotIdxs.length; k++) {
      if (this.slotPeriods[opt.slotIdxs[k]] > this.latestPreferred) sc += 3;
    }
    for (let gi = 0; gi < c.gIdxs.length; gi++) {
      const g = c.gIdxs[gi];
      sc += this.dayLoad[g * this.D + opt.day] * 0.3;
      sc += this.wasteAfter(g, b, opt) * 4;
    }
    const ti = opt.tIdx;
    const slack = this.tMax[ti] - this.teacherLoad[ti];
    sc -= slack * 0.25;
    const gd = this.gDept[c.gIdxs[0]];
    const td = this.tDept[ti];
    if (gd && td && gd !== td) sc += 25;
    if (this.tIsWutthiwong[ti]) sc -= 2;
    return sc;
  }

  minMorningForGroup(g) {
    let rem = this.groupTotalRem[g];
    if (rem <= 0) return 0;
    const optsD = [];
    for (let d = 0; d < this.D; d++) {
      const cur = this.dayLoad[g * this.D + d];
      const mCount = this.morningCount[d] ?? 4;
      const dMax = Math.min(this.maxPerDay, this.daySlotIdx[d].length);
      if (cur >= mCount) {
        rem -= Math.max(0, dMax - cur);
      } else {
        const p = mCount - cur;
        const aft = Math.max(0, dMax - mCount);
        optsD.push({ p, aft });
      }
    }
    if (rem <= 0) return 0;
    optsD.sort((a, b) => a.p - b.p);
    let need = 0;
    for (const { p, aft } of optsD) {
      if (rem <= 0) break;
      if (rem <= p) {
        need += rem;
        rem = 0;
      } else if (rem <= p + aft) {
        need += p;
        rem = 0;
      } else {
        need += p;
        rem -= p + aft;
      }
    }
    return rem > 0 ? 9999 : need;
  }

  morningBudgetOk() {
    if (!this.checkS3) return true;
    for (const id of this.unplaced) {
      if (this.blocks[id].fixed) return true;
    }
    let freeAllM = 0;
    let freeNonWM = 0;
    for (let ti = 0; ti < this.T; ti++) {
      const base = ti * this.S;
      let f = 0;
      for (let d = 0; d < this.D; d++) {
        const ds = this.daySlotIdx[d];
        const mCount = this.morningCount[d] ?? 4;
        for (let i = 0; i < mCount; i++) {
          if (this.teacherOcc[base + ds[i]] === -1) f++;
        }
      }
      freeAllM += f;
      if (!this.tIsWutthiwong[ti]) freeNonWM += f;
    }
    let needAll = 0;
    let needNonItPvs = 0;
    for (let g = 0; g < this.G; g++) {
      const m = this.minMorningForGroup(g);
      if (m >= 9999) return false;
      needAll += m;
      if (!this.gIsItPvs[g]) needNonItPvs += m;
    }
    return needAll <= freeAllM && needNonItPvs <= freeNonWM;
  }

  canStillFit(g) {
    const bids = this.groupBlockIdxs[g];
    const lens = [];
    let remSum = 0;
    for (let i = 0; i < bids.length; i++) {
      const bid = bids[i];
      if (!this.place[bid] && !this.blocks[bid].fixed) {
        const l = this.blocks[bid].len;
        lens.push(l);
        remSum += l;
      }
    }

    const minRem = lens.length > 0 ? Math.min(...lens) : 0;
    const gBase = g * this.S;
    const runs = [];
    let gapSum = 0;

    for (let d = 0; d < this.D; d++) {
      const ds = this.daySlotIdx[d];
      if (!this.checkS3) {
        let run = 0;
        for (let i = 0; i < ds.length; i++) {
          if (this.groupOcc[gBase + ds[i]] === -1) run++;
          else {
            if (run > 0) runs.push(run);
            run = 0;
          }
        }
        if (run > 0) runs.push(run);
        continue;
      }

      let first = -1;
      let last = -1;
      for (let i = 0; i < ds.length; i++) {
        if (this.groupOcc[gBase + ds[i]] !== -1) {
          if (first === -1) first = i;
          last = i;
        }
      }
      if (first === -1) {
        if (lens.length > 0) runs.push(ds.length);
      } else {
        let run = 0;
        for (let i = first; i <= last; i++) {
          if (this.groupOcc[gBase + ds[i]] === -1) run++;
          else if (run > 0) {
            if (lens.length === 0 || run < minRem) return false;
            gapSum += run;
            runs.push(run);
            run = 0;
          }
        }
        if (lens.length > 0) {
          if (first > 0) runs.push(first);
          if (last < ds.length - 1) runs.push(ds.length - 1 - last);
        }
      }
    }

    if (this.checkS3 && gapSum > remSum) return false;
    if (lens.length === 0) return !this.checkS3 || gapSum === 0;

    const distinct = [...new Set(lens)];
    for (const L of distinct) {
      let count = 0;
      let need = 0;
      for (const l of lens) {
        if (l >= L) {
          count++;
          need += l;
        }
      }
      let fits = 0;
      let room = 0;
      for (const r of runs) {
        if (r >= L) {
          fits += Math.floor(r / L);
          room += r;
        }
      }
      if (count > fits || need > room) return false;
    }
    return true;
  }

  teacherCapacityOk() {
    if (!this.checkS1 && !this.checkS2) return true;
    const committed = new Int32Array(this.T);
    const maxAvail = new Int32Array(this.T);
    const minNewCourse = new Int32Array(this.T).fill(9999);
    const unheldCourses = [];

    for (let i = 0; i < this.courses.length; i++) {
      const c = this.courses[i];
      const rem = this.courseRemHours(c);
      if (rem === 0) continue;
      const held = this.courseTeacher.get(c.id);
      if (held !== undefined) {
        committed[held.tIdx] += rem;
        maxAvail[held.tIdx] += rem;
      } else {
        unheldCourses.push({ c, rem });
      }
    }

    const freeCap = new Int32Array(this.T);
    for (let ti = 0; ti < this.T; ti++) {
      const usedPlusCommit = this.teacherLoad[ti] + committed[ti];
      if (this.teacherMaxEnabled(ti) && usedPlusCommit > this.tMax[ti]) return false;
      freeCap[ti] = this.teacherMaxEnabled(ti) ? this.tMax[ti] - usedPlusCommit : 9999;
    }

    let unheldTotal = 0;
    let itOnlyNeed = 0;
    let dbOnlyNeed = 0;
    for (let i = 0; i < unheldCourses.length; i++) {
      const { c, rem } = unheldCourses[i];
      unheldTotal += rem;
      let canCount = 0;
      let hasIT = false;
      let hasDB = false;
      for (let k = 0; k < c.tIdxs.length; k++) {
        const ti = c.tIdxs[k];
        if (freeCap[ti] >= rem) {
          canCount++;
          maxAvail[ti] += rem;
          if (rem < minNewCourse[ti]) minNewCourse[ti] = rem;
          if (this.tIsIt[ti]) hasIT = true;
          else hasDB = true;
        }
      }
      if (canCount === 0) return false;
      if (hasIT && !hasDB) itOnlyNeed += rem;
      if (hasDB && !hasIT) dbOnlyNeed += rem;
    }

    let neededMin = 0;
    let usableTotal = 0;
    let itCap = 0;
    let dbCap = 0;
    for (let ti = 0; ti < this.T; ti++) {
      if (this.teacherMaxEnabled(ti) && this.teacherLoad[ti] + maxAvail[ti] < this.tMin[ti]) return false;
      const afterCommit = this.teacherLoad[ti] + committed[ti];
      if (this.teacherMaxEnabled(ti) && afterCommit < this.tMin[ti]) neededMin += this.tMin[ti] - afterCommit;
      const uCap = freeCap[ti] >= minNewCourse[ti] ? freeCap[ti] : 0;
      usableTotal += uCap;
      if (this.tIsIt[ti]) itCap += uCap;
      else dbCap += uCap;
    }

    if (itOnlyNeed > itCap || dbOnlyNeed > dbCap) return false;
    return neededMin <= unheldTotal && unheldTotal <= usableTotal;
  }

  isGroupDayContiguous(g, d) {
    const ds = this.daySlotIdx[d];
    const gBase = g * this.S;
    let first = -1;
    let last = -1;
    let occ = 0;
    for (let i = 0; i < ds.length; i++) {
      if (this.groupOcc[gBase + ds[i]] !== -1) {
        if (first === -1) first = i;
        last = i;
        occ++;
      }
    }
    return occ === 0 || (first === 0 && last === occ - 1);
  }

  groupCost(g) {
    let cost = 0;
    const loads = [];
    const gBase = g * this.S;
    for (let d = 0; d < this.D; d++) {
      const ds = this.daySlotIdx[d];
      const mCount = this.morningCount[d] ?? 4;
      let first = -1;
      let last = -1;
      let n = 0;
      let prevCourse = -1;
      const seenMorning = new Set();
      const seenAfternoon = new Set();
      for (let i = 0; i < ds.length; i++) {
        const s = ds[i];
        const bid = this.groupOcc[gBase + s];
        if (bid !== -1) {
          if (first === -1) first = i;
          last = i;
          n++;
          if (this.slotPeriods[s] > this.latestPreferred) cost += 3;
          if (this.checkS3) {
            const cid = this.blocks[bid].course.id;
            const halfSet = i < mCount ? seenMorning : seenAfternoon;
            if (i === mCount) prevCourse = -1;
            if (cid !== prevCourse && halfSet.has(cid)) cost += 3;
            halfSet.add(cid);
            prevCourse = cid;
          }
        } else if (i < mCount && this.checkS3) {
          prevCourse = -1;
        } else if (i >= mCount && this.checkS3) {
          prevCourse = -1;
        }
      }
      loads.push(n);
      if (n > 0) {
        if (this.checkS3) cost += (last + 1 - n) * 2;
        else cost += (last - first + 1 - n) * 2;
      }
    }
    const avg = loads.reduce((a, b) => a + b, 0) / Math.max(1, loads.length);
    for (const l of loads) cost += (l - avg) * (l - avg) * 0.3;
    return cost;
  }

  totalCost() {
    let sum = 0;
    for (let g = 0; g < this.G; g++) sum += this.groupCost(g);
    return sum;
  }

  toRows() {
    const out = [];
    for (const b of this.blocks) {
      const p = this.place[b.id];
      if (!p) continue;
      const c = b.course;
      const teacherId = this.teacherList[p.tIdx];
      const roomId = this.roomList[p.rIdx];
      for (const si of p.slotIdxs) {
        const timeslotId = this.slotList[si];
        for (const gid of c.groups) {
          out.push({
            group_id: gid,
            timeslot_id: timeslotId,
            subject_id: c.subByGroup?.get(gid) || c.subjectId,
            teacher_id: teacherId,
            room_id: roomId,
            _si: si,
          });
        }
      }
    }
    out.sort((a, b) => {
      const cmp = a.group_id.localeCompare(b.group_id, undefined, { numeric: true });
      if (cmp !== 0) return cmp;
      return a._si - b._si;
    });
    return out.map(({ _si, ...row }) => row);
  }
}

export function solve(data, config = {}, { onProgress = () => {} } = {}) {
  const ctx = buildContext(data, config);
  const t0 = Date.now();
  const seed = Number(ctx.params.seed) || 1;
  const rng = mulberry32(seed);
  const timeLimitMs = Math.max(1, Number(ctx.params.timeLimitSec) || 20) * 1000;
  const deadline = t0 + timeLimitMs;

  const { errors, courses, blocks } = buildBlocks(ctx);
  if (errors.length > 0) {
    return {
      status: 'failed',
      message: 'ข้อมูลไม่พร้อมสำหรับการจัดตาราง',
      errors,
      rows: [],
      warnings: ctx.warnings,
      stats: { seconds: round2((Date.now() - t0) / 1000) },
    };
  }

  onProgress(`เริ่มค้นหา ${blocks.length} บล็อก จาก ${courses.length} รายวิชา-กลุ่ม`);
  const board = new Board(ctx, courses, blocks);
  const NODE_LIMIT = 4000;
  const MAX_RESTARTS = 250;
  const failCount = new Int32Array(blocks.length);

  let found = false;
  let restarts = 0;
  let totalNodes = 0;

  while (!found && restarts < MAX_RESTARTS && Date.now() < deadline) {
    board.clear();
    let budget = NODE_LIMIT;

    const dfs = () => {
      if (board.unplaced.size === 0) return true;
      if (--budget <= 0 || Date.now() > deadline) return false;
      totalNodes++;

      let best = null;
      let bestOpts = null;
      for (const id of board.unplaced) {
        const b = blocks[id];
        const opts = board.options(b, rng);
        if (opts.length === 0) {
          failCount[id]++;
          return false;
        }
        if (
          !best ||
          (b.fixed && !best.fixed) ||
          (Boolean(b.fixed) === Boolean(best.fixed) &&
            (opts.length < bestOpts.length || (opts.length === bestOpts.length && b.len > best.len)))
        ) {
          best = b;
          bestOpts = opts;
        }
      }

      const noise = board.checkS3 ? 1.5 : 2;
      const sliceLimit = board.checkS3 ? 12 : 8;
      const ranked = bestOpts
        .map((o) => ({ o, k: board.score(best, o) + rng() * noise }))
        .sort((a, b) => a.k - b.k)
        .slice(0, sliceLimit);

      for (const { o } of ranked) {
        board.assign(best, o);
        let ok = board.teacherCapacityOk() && board.morningBudgetOk();
        if (ok && !board.checkS3) {
          for (const g of best.course.gIdxs) {
            if (!board.canStillFit(g)) {
              ok = false;
              break;
            }
          }
        }
        if (ok && dfs()) return true;
        if (!ok) failCount[best.id]++;
        board.unassign(best);
        if (budget <= 0 || Date.now() > deadline) return false;
      }
      return false;
    };

    found = dfs();
    restarts++;
    if (!found) onProgress(`รอบที่ ${restarts} ยังไม่พบคำตอบ เริ่มใหม่`);
  }

  if (!found) {
    const top5 = [...blocks.keys()]
      .filter((i) => failCount[i] > 0)
      .sort((a, b) => failCount[b] - failCount[a])
      .slice(0, 5)
      .map((i) => {
        const b = blocks[i];
        const subName = ctx.subjects.get(b.course.subjectId)?.subject_name || '';
        return `${b.course.subjectId} ${subName} กลุ่ม ${b.course.groups.join('+')} (${b.len} คาบ)`;
      });
    return {
      status: 'failed',
      message: 'ไม่พบตารางที่ผ่านทุกเงื่อนไขภายในเวลาที่กำหนด',
      errors: top5.length > 0 ? [`วางบล็อกเหล่านี้ไม่ได้บ่อยที่สุด: ${top5.join('; ')}`] : ['หมดเวลาการค้นหา'],
      rows: [],
      warnings: ctx.warnings,
      stats: { seconds: round2((Date.now() - t0) / 1000) },
    };
  }

  // Phase 2: Simulated Annealing
  const softCostBefore = board.totalCost();
  const movable = blocks.filter((b) => !b.fixed);
  const byLen = new Map();
  for (const b of movable) {
    if (!byLen.has(b.len)) byLen.set(b.len, []);
    byLen.get(b.len).push(b);
  }
  const ITER = 20000;
  let temp = 5;
  const cooling = Math.pow(0.01 / temp, 1 / ITER);
  let saIterations = 0;

  if (movable.length > 0) {
    onProgress('ปรับปรุงตารางด้วย Simulated Annealing');
    for (let i = 0; i < ITER && Date.now() < deadline; i++, temp *= cooling) {
      saIterations++;
      if (board.checkS3) {
        // Alternate same-length swap (preserves exact prefix) and tail-append move (preserves morning-first prefix)
        if ((i & 1) === 0) {
          const b1 = movable[Math.floor(rng() * movable.length)];
          const peers = byLen.get(b1.len);
          if (!peers || peers.length < 2) continue;
          const b2 = peers[Math.floor(rng() * peers.length)];
          if (b2.id === b1.id || b2.course.id === b1.course.id) continue;
          if (b1.course.gIdxs.length !== 1 || b2.course.gIdxs.length !== 1) continue;
          if (b2.course.gIdxs[0] !== b1.course.gIdxs[0]) continue;
          const p1 = board.place[b1.id];
          const p2 = board.place[b2.id];
          const g = b1.course.gIdxs[0];
          const before = board.groupCost(g);
          board.unassign(b1);
          board.unassign(b2);
          const t1Base = p1.tIdx * board.S;
          const t2Base = p2.tIdx * board.S;
          const t1FreeAt2 = p2.slotIdxs.every((s) => board.teacherOcc[t1Base + s] === -1);
          const r1New = t1FreeAt2 ? board.pickRoom(b1.course, p2.slotIdxs, rng) : -1;
          if (r1New === -1) {
            board.assign(b1, p1);
            board.assign(b2, p2);
            continue;
          }
          board.assign(b1, { day: p2.day, slotIdxs: p2.slotIdxs, tIdx: p1.tIdx, rIdx: r1New, cur: p2.cur });
          const t2FreeAt1 = p1.slotIdxs.every((s) => board.teacherOcc[t2Base + s] === -1);
          const r2New = t2FreeAt1 ? board.pickRoom(b2.course, p1.slotIdxs, rng) : -1;
          if (r2New === -1) {
            board.unassign(b1);
            board.assign(b1, p1);
            board.assign(b2, p2);
            continue;
          }
          board.assign(b2, { day: p1.day, slotIdxs: p1.slotIdxs, tIdx: p2.tIdx, rIdx: r2New, cur: p1.cur });
          const after = board.groupCost(g);
          const delta = after - before;
          if (delta > 0 && rng() >= Math.exp(-delta / temp)) {
            board.unassign(b2);
            board.unassign(b1);
            board.assign(b1, p1);
            board.assign(b2, p2);
          }
          continue;
        }

        const b = movable[Math.floor(rng() * movable.length)];
        if (b.course.gIdxs.length !== 1) continue;
        const g = b.course.gIdxs[0];
        const old = board.place[b.id];
        const oldCur = board.dayLoad[g * board.D + old.day];
        const oldMorning = board.morningCount[old.day] ?? 4;
        if (old.slotIdxs[old.slotIdxs.length - 1] !== board.daySlotIdx[old.day][oldCur - 1]) continue;
        if (oldCur > oldMorning && oldCur - b.len < oldMorning) continue;

        const before = board.groupCost(g);
        board.unassign(b);
        const opts = board.options(b, rng).filter((o) => o.day !== old.day);
        if (opts.length === 0) {
          board.assign(b, old);
          continue;
        }
        const cand = opts[Math.floor(rng() * opts.length)];
        board.assign(b, cand);
        if (
          (cand.tIdx !== old.tIdx && board.teacherMaxEnabled(old.tIdx) && board.teacherLoad[old.tIdx] < board.tMin[old.tIdx]) ||
          !board.isGroupDayContiguous(g, old.day) ||
          !board.isGroupDayContiguous(g, cand.day)
        ) {
          board.unassign(b);
          board.assign(b, old);
          continue;
        }
        const delta = board.groupCost(g) - before;
        if (delta > 0 && rng() >= Math.exp(-delta / temp)) {
          board.unassign(b);
          board.assign(b, old);
        }
        continue;
      }

      const b = movable[Math.floor(rng() * movable.length)];
      const before = b.course.gIdxs.reduce((s, g) => s + board.groupCost(g), 0);
      const old = board.place[b.id];
      board.unassign(b);
      const opts = board.options(b, rng);
      if (opts.length === 0) {
        board.assign(b, old);
        continue;
      }
      const cand = opts[Math.floor(rng() * opts.length)];
      board.assign(b, cand);

      // Preserve enabled hard constraints (S1/S2 teacher bounds)
      let valid = true;
      if (cand.tIdx !== old.tIdx && board.teacherMaxEnabled(old.tIdx) && board.teacherLoad[old.tIdx] < board.tMin[old.tIdx]) {
        valid = false;
      }
      if (!valid) {
        board.unassign(b);
        board.assign(b, old);
        continue;
      }

      const after = b.course.gIdxs.reduce((s, g) => s + board.groupCost(g), 0);
      const delta = after - before;
      if (delta > 0 && rng() >= Math.exp(-delta / temp)) {
        board.unassign(b);
        board.assign(b, old);
      }
    }
  }

  const softCostAfter = board.totalCost();
  const rows = board.toRows();

  return {
    status: 'success',
    message: 'จัดตารางสำเร็จ',
    rows,
    warnings: ctx.warnings,
    stats: {
      courses: courses.length,
      blocks: blocks.length,
      restarts,
      nodes: totalNodes,
      saIterations,
      softCostBefore: round2(softCostBefore),
      softCostAfter: round2(softCostAfter),
      seconds: round2((Date.now() - t0) / 1000),
      seed,
      constraints: { ...ctx.constraints },
      params: { ...ctx.params },
    },
  };
}
