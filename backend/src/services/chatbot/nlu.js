const THAI_DIGITS = { '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4', '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9' };

const DAY_PATTERNS = [
  { key: 'Mon', re: /(จันทร์|mon(?:day)?)/g },
  { key: 'Tue', re: /(อังคาร|tue(?:sday)?)/g },
  { key: 'Wed', re: /(พุธ|wed(?:nesday)?)/g },
  { key: 'Thu', re: /(พฤหัสบดี|พฤหัส|thu(?:rsday)?)/g },
  { key: 'Fri', re: /(ศุกร์|fri(?:day)?)/g },
  { key: 'Sat', re: /(เสาร์|sat(?:urday)?)/g },
  { key: 'Sun', re: /(อาทิตย์|sun(?:day)?)/g },
];

const CHECK_ORDER = ['I1', 'I2', 'I4', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'S1', 'S2', 'S3'];
const SPECIAL_IDS = ['S1', 'S2', 'S3'];

export function normalize(text) {
  return String(text || '')
    .replace(/[๐-๙]/g, (ch) => THAI_DIGITS[ch] ?? ch)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function bkkDayKey(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const short = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', weekday: 'short' }).format(d);
  return short;
}

function parseDays(text, ctx) {
  const validDays = new Set(ctx.days);
  const found = [];
  for (const dp of DAY_PATTERNS) {
    if (dp.re.test(text) && validDays.has(dp.key) && !found.includes(dp.key)) {
      found.push(dp.key);
    }
    dp.re.lastIndex = 0;
  }
  if (/วันนี้/.test(text)) {
    const k = bkkDayKey(0);
    if (validDays.has(k) && !found.includes(k)) found.push(k);
  }
  if (/พรุ่งนี้/.test(text)) {
    const k = bkkDayKey(1);
    if (validDays.has(k) && !found.includes(k)) found.push(k);
  }
  return found;
}

function parseConstraintIds(chunk) {
  const out = [];
  const matches = chunk.toUpperCase().match(/\b(?:[IBS][1-6]|\d{1,2})\b/g) || [];
  for (const tok of matches) {
    if (/^[IBS][1-6]$/.test(tok)) {
      if (CHECK_ORDER.includes(tok) && !out.includes(tok)) out.push(tok);
    } else {
      const idx = Number(tok) - 1;
      if (idx >= 0 && idx < CHECK_ORDER.length && !out.includes(CHECK_ORDER[idx])) out.push(CHECK_ORDER[idx]);
    }
  }
  return out;
}

export function extract(text, ctx) {
  const norm = normalize(text);
  let workText = norm;

  // 1. Target (move) extracted first and stripped before source days/periods
  let target = null;
  const targetRe = /ไป(?:ที่|ยัง)?\s*(?:วัน\s*)?(จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์|mon|tue|wed|thu|fri|sat|sun)?\s*คาบ(?:ที่)?\s*(\d+)/i;
  const tm = workText.match(targetRe);
  if (tm) {
    const tDays = tm[1] ? parseDays(tm[1], ctx) : [];
    const pNum = Number(tm[2]);
    target = { day: tDays[0] || null, period: ctx.periods.includes(pNum) ? pNum : pNum };
    workText = workText.replace(tm[0], ' ');
  }

  // 2. Seed & randomSeed
  let seed = null;
  const sm = norm.match(/seed\s*(?:=|:|เป็น|ค่า)?\s*(\d+)/);
  if (sm) seed = Number(sm[1]);
  const randomSeed = /(สุ่ม\s*seed|seed\s*ใหม่|random)/.test(norm);

  // 3. On / Off toggleable special constraints
  const on = [];
  const off = [];
  for (const m of norm.matchAll(/(เปิด|ปิด)\s*(?:เงื่อนไข|ข้อ)?\s*([^เปิดปิด,;.]+)/g)) {
    const action = m[1];
    const body = m[2];
    let ids = [];
    if (/ทั้งหมด/.test(body)) {
      ids = [...SPECIAL_IDS];
    } else {
      ids = parseConstraintIds(body).filter((id) => SPECIAL_IDS.includes(id));
      if (/หัวหน้า/.test(body) && !ids.includes('S1')) ids.push('S1');
      if (/ครูธรรมดา/.test(body) && !ids.includes('S2')) ids.push('S2');
      if (/(ช่องว่าง|คาบว่าง|เช้าให้เต็ม)/.test(body) && !ids.includes('S3')) ids.push('S3');
    }
    for (const id of ids) {
      if (action === 'เปิด' && !on.includes(id)) on.push(id);
      if (action === 'ปิด' && !off.includes(id)) off.push(id);
    }
  }

  // 4. Constraint numbers referenced in validation/explain
  const numbers = [];
  for (const m of norm.matchAll(/(?:เงื่อนไข(?:ที่|ข้อ)?|ข้อ|c)\s*([ibs]?\d{1,2})/gi)) {
    for (const id of parseConstraintIds(m[1])) {
      if (!numbers.includes(id)) numbers.push(id);
    }
  }

  // 5. Subjects (by ID and by name)
  const subjects = [];
  for (const m of norm.matchAll(/\b\d{5}-\d{4}\b/g)) {
    if (ctx.subjects.has(m[0]) && !subjects.includes(m[0])) subjects.push(m[0]);
  }
  const subsByLen = [...ctx.subjects.values()].sort((a, b) => b.subject_name.length - a.subject_name.length);
  for (const s of subsByLen) {
    const sn = normalize(s.subject_name);
    if (sn.length >= 4 && norm.includes(sn) && !subjects.includes(s.subject_id)) {
      subjects.push(s.subject_id);
    }
  }
  if (subjects.length === 0 && /ลูกเสือวิสามัญ/.test(norm)) {
    for (const s of ctx.subjects.values()) {
      if (s.subject_name.includes('ลูกเสือ') && !subjects.includes(s.subject_id)) subjects.push(s.subject_id);
    }
  }

  // 6. Groups
  const groups = [];
  const tryPushGroup = (gid) => {
    if (ctx.groups.has(gid) && !groups.includes(gid)) return groups.push(gid), true;
    return false;
  };
  for (const m of norm.matchAll(/\bg\s*0*(\d+)\b/gi)) {
    const n = Number(m[1]);
    tryPushGroup(`G${String(n).padStart(2, '0')}`) || tryPushGroup(`G${n}`);
  }
  for (const m of norm.matchAll(/กลุ่ม(?:เรียน)?(?:ที่)?\s*0*(\d+)/g)) {
    const n = Number(m[1]);
    tryPushGroup(`G${String(n).padStart(2, '0')}`) || tryPushGroup(`G${n}`);
  }
  for (const g of ctx.groups.values()) {
    const gn = normalize(g.group_name);
    if (gn && norm.includes(gn)) tryPushGroup(g.group_id);
  }

  // 7. Teachers (strip subject names first; guard names occurring inside subject names)
  let teacherText = norm;
  const allSubNames = [...ctx.subjects.values()].map((s) => normalize(s.subject_name));
  for (const sn of allSubNames.sort((a, b) => b.length - a.length)) {
    if (sn) teacherText = teacherText.split(sn).join(' ');
  }

  const teachers = [];
  const tryPushTeacher = (tid) => {
    if (ctx.teachers.has(tid) && !teachers.includes(tid)) return teachers.push(tid), true;
    return false;
  };
  for (const m of teacherText.matchAll(/\bt\s*0*(\d+)\b/gi)) {
    const n = Number(m[1]);
    tryPushTeacher(`T${String(n).padStart(2, '0')}`) || tryPushTeacher(`T${n}`);
  }
  for (const t of ctx.teachers.values()) {
    const stripped = normalize(t.teacher_name).replace(/^(นางสาว|นาย|นาง|ครู)/, '').trim();
    const first = stripped.split(/\s+/)[0];
    if (!first || first.length < 2) continue;
    const appearsInSubject = allSubNames.some((sn) => sn.includes(first));
    if (appearsInSubject) {
      if (teacherText.includes(`ครู${first}`) || teacherText.includes(`ครู ${first}`)) tryPushTeacher(t.teacher_id);
    } else if (teacherText.includes(first) || teacherText.includes(stripped)) {
      tryPushTeacher(t.teacher_id);
    }
  }

  // 8. Rooms
  const rooms = [];
  const tryPushRoom = (rid) => {
    if (ctx.rooms.has(rid) && !rooms.includes(rid)) return rooms.push(rid), true;
    return false;
  };
  for (const m of norm.matchAll(/\br\s*([a-z0-9_-]+)\b/gi)) {
    tryPushRoom(m[1].toUpperCase()) || tryPushRoom(`R${m[1]}`) || tryPushRoom(m[1]);
  }
  for (const m of norm.matchAll(/ห้อง(?:เรียน)?\s*([a-z0-9_-]+)/gi)) {
    tryPushRoom(m[1].toUpperCase()) || tryPushRoom(`R${m[1]}`) || tryPushRoom(m[1]);
  }
  for (const r of ctx.rooms.values()) {
    const rn = normalize(r.room_name);
    if (rn.length >= 3 && new RegExp(`(?:^|\\s)${rn}(?:$|\\s)`).test(norm) && !/seed|คาบ/.test(norm.slice(Math.max(0, norm.indexOf(rn) - 8), norm.indexOf(rn)))) {
      tryPushRoom(r.room_id);
    }
  }

  // 9. Days & Periods (from workText after target stripped)
  const days = parseDays(workText, ctx);
  const periods = [];
  const validPeriods = new Set(ctx.periods);
  for (const m of workText.matchAll(/คาบ(?:ที่)?\s*(\d+)(?:\s*[-–ถึง]\s*(\d+))?/g)) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let p = lo; p <= hi; p++) {
      if (validPeriods.has(p) && !periods.includes(p)) periods.push(p);
    }
  }

  const out = { groups, teachers, rooms, subjects, days, periods, numbers, seed, randomSeed, on, off };
  if (target) out.target = target;
  return out;
}

export function detectIntent(text, ents) {
  const t = normalize(text);
  if (/^(สวัสดี|หวัดดี|hello|hi|ดีจ้า|ดีครับ|ดีค่ะ)/.test(t) && t.length < 20) return 'greeting';
  if (/(ขอบคุณ|ขอบใจ|thank)/.test(t) && t.length < 25) return 'thanks';
  if (/(ทำอะไรได้|ช่วยอะไรได้|ความสามารถ|ใช้ยังไง$|^help$|^ช่วยด้วย|เมนู|คำสั่ง)/.test(t)) return 'help';
  if (/^(ล้างแชท|เริ่มใหม่|clear)$/.test(t)) return 'clear';
  if (/(อัลกอริทึม|algorithm|csp|annealing|ทำงานยังไง|ทำงานอย่างไร|หลักการ)/.test(t)) return 'algorithm';
  if (/(วิธี|ยังไง|อย่างไร|ทำไง|how)/.test(t) && !/(ทำไม)/.test(t)) return 'howto';
  if (/(ไปหน้า|เปิดหน้า|พาไป|ไปที่หน้า)/.test(t)) return 'navigate';
  if (/(จัด(?:ตาราง)?ไม่ได้|จัด(?:ตาราง)?ไม่สำเร็จ|วิเคราะห์สาเหตุ|หาสาเหตุ|diagnose|ทำไม.*ไม่สำเร็จ)/.test(t)) return 'diagnose';
  if (/(seed\s*ที่ดีที่สุด|หา\s*seed|ค้นหา\s*seed|best\s*seed|seed\s*ดีสุด|ตารางที่ดีที่สุด)/.test(t)) return 'best_seed';
  if (/(บันทึก|เซฟ|save)\s*seed/.test(t)) return 'save_seed';
  if (/(หาช่อง|ช่องว่างให้|ย้ายไปไหน|ย้ายไปที่ไหน|ควรย้าย|ย้ายได้ที่ไหน|แนะนำช่อง)/.test(t)) return 'find_slot';
  if (/(ย้าย|สลับ)/.test(t)) return 'move';
  if (/(ส่งออก|ดาวน์โหลด|export|pdf|excel|xlsx|csv|พิมพ์ตาราง|ปริ้น|print)/.test(t)) return 'export';
  if (/(จัดตาราง|รัน|run|solve|สุ่ม\s*seed|seed\s*ใหม่)/.test(t) && !/(ผล|สถานะ)/.test(t)) return 'solve';
  if (/(ข้อสังเกต|คำเตือน|ปัญหาข้อมูล|ข้อมูลผิด|warning|ข้อมูลมีปัญหา)/.test(t)) return 'warnings';
  if (ents.numbers.length > 0 && /(คืออะไร|หมายถึง|อธิบาย|คือ)/.test(t) && !/(ทำไม|ไม่ผ่าน)/.test(t)) return 'explain';
  if (/(ผ่าน|เงื่อนไข|ผลตรวจ|ชนกัน|ชน|ผิดเงื่อนไข|ละเมิด|validator|ตรวจ)/.test(t)) return 'validation';
  if (/(ว่าง)/.test(t) && /(ห้องไหน|ครูคนไหน|ครูใคร|ห้องอะไร|ใครว่าง)/.test(t)) return 'free_resources';
  if (/(ว่าง)/.test(t)) return 'free';
  if (/(กี่คาบ|ภาระ|ชั่วโมงสอน|workload|สอนเยอะ|สอนมาก|สอนน้อย|จำนวนคาบ)/.test(t)) return 'load';
  if (/(การใช้ห้อง|ใช้ห้อง|ห้องไหนใช้|อัตราการใช้)/.test(t) && ents.rooms.length === 0) return 'room_usage';
  if (/(สรุป|ภาพรวม|overview|สถานะ)/.test(t)) return 'summary';
  if (ents.days.length > 0 && ents.periods.length > 0 && ents.groups.length === 0 && ents.teachers.length === 0 && ents.rooms.length === 0) {
    return 'at_time';
  }
  if (ents.subjects.length > 0 && ents.groups.length === 0 && ents.teachers.length === 0 && ents.rooms.length === 0) {
    return 'subject';
  }
  if (ents.groups.length > 0 || ents.teachers.length > 0 || ents.rooms.length > 0 || /(ตาราง|เรียนอะไร|สอนอะไร)/.test(t)) {
    return 'schedule';
  }
  return 'unknown';
}
