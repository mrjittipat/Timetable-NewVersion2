import { DAY_TH, buildGrid } from '../grid.js';
import { moveSpan } from '../editor.js';
import { validate } from '../validator.js';
import { timetableStats } from '../stats.js';
import { ALGORITHM, CONSTRAINTS, HOWTO, PAGES } from './knowledge.js';
import { detectIntent, extract, normalize } from './nlu.js';

function compressPeriods(nums) {
  if (!nums.length) return '-';
  const sorted = [...nums].sort((a, b) => a - b);
  const parts = [];
  let s = sorted[0];
  let e = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === e + 1) e = sorted[i];
    else {
      parts.push(s === e ? `${s}` : `${s}-${e}`);
      s = e = sorted[i];
    }
  }
  parts.push(s === e ? `${s}` : `${s}-${e}`);
  return parts.join(', ');
}

function resolveTarget(ents, chatCtx) {
  if (ents.groups.length) return { view: 'group', id: ents.groups[0], fromContext: false };
  if (ents.teachers.length) return { view: 'teacher', id: ents.teachers[0], fromContext: false };
  if (ents.rooms.length) return { view: 'room', id: ents.rooms[0], fromContext: false };
  if (chatCtx?.view && chatCtx?.id) return { view: chatCtx.view, id: chatCtx.id, fromContext: true };
  return null;
}

function entityLabel(view, id, ctx) {
  if (view === 'group') return `กลุ่ม ${id} (${ctx.groups.get(id)?.group_name || id})`;
  if (view === 'teacher') return `${ctx.teachers.get(id)?.teacher_name || id} (${id})`;
  return `ห้อง ${ctx.rooms.get(id)?.room_name || id}`;
}

function needTimetableReply(intent, context) {
  return {
    intent,
    text: 'ยังไม่มีตารางเรียนในระบบ ต้องจัดตารางก่อนจึงจะตอบคำถามนี้ได้',
    cards: [
      {
        type: 'action',
        title: 'จัดตารางอัตโนมัติ',
        lines: ['ยังไม่มีผลลัพธ์ตารางเรียนในระบบ กดยืนยันเพื่อเริ่มจัดตารางทันที'],
        status: 'pending',
        action: { kind: 'solve', payload: {}, label: 'เริ่มจัดตาราง' },
      },
    ],
    suggestions: ['สรุปภาพรวม', 'ข้อสังเกตจากข้อมูล', 'เงื่อนไขข้อ S1 คืออะไร'],
    context: context || {},
  };
}

export function reply(message, chatCtx = {}, env = {}) {
  const { data = {}, config = {}, ctx, rows = [], meta = null, validation = null } = env;
  const norm = normalize(message);
  const ents = extract(message, ctx);
  const intent = detectIntent(message, ents);
  const target = resolveTarget(ents, chatCtx);
  const nextCtx = target ? { view: target.view, id: target.id } : chatCtx || {};

  if (intent === 'greeting') {
    return {
      intent,
      text: 'สวัสดีครับ ผมคือผู้ช่วยจัดตารางเรียนอัจฉริยะ (ออฟไลน์) พร้อมช่วยดูตาราง ตรวจสอบเงื่อนไข และสั่งจัดตารางให้ครับ',
      cards: [],
      suggestions: ['ตาราง G01 วันจันทร์', 'ห้องไหนว่าง วันพุธ คาบ 3', 'ผลตรวจเงื่อนไข', 'ทำอะไรได้บ้าง'],
      context: nextCtx,
    };
  }

  if (intent === 'thanks') {
    return {
      intent,
      text: 'ยินดีครับ หากต้องการตรวจสอบหรือปรับตารางเพิ่มเติมถามได้เลยครับ',
      cards: [],
      suggestions: ['สรุปภาพรวม', 'ภาระสอนของครู', 'ส่งออก PDF ของ G01'],
      context: nextCtx,
    };
  }

  if (intent === 'clear') {
    return {
      intent,
      text: 'ล้างบทสนทนาเรียบร้อยแล้วครับ เริ่มถามคำถามใหม่ได้เลย',
      cards: [],
      suggestions: ['ทำอะไรได้บ้าง', 'สรุปภาพรวม', 'ตาราง G01 วันจันทร์'],
      context: {},
    };
  }

  if (intent === 'help') {
    return {
      intent,
      text: 'ผมสามารถช่วยตอบคำถาม วิเคราะห์ข้อมูล และสั่งงานระบบได้ดังนี้ครับ (คลิกเลือกตัวอย่างคำถามได้เลย):',
      cards: [
        { type: 'list', title: 'ถามข้อมูลตาราง', ask: true, items: ['ตาราง G01 วันจันทร์', 'ครูวุฒิวงศ์สอนอะไรวันพุธ', 'ห้องไหนว่าง วันพุธ คาบ 3', 'วันอังคาร คาบ 2 ใครเรียนอะไร'] },
        { type: 'list', title: 'วิเคราะห์และอธิบาย', ask: true, items: ['ผลตรวจเงื่อนไข', 'ภาระสอนของครู', 'เงื่อนไขข้อ S1 คืออะไร', 'ข้อสังเกตจากข้อมูล'] },
        { type: 'list', title: 'สั่งงาน (กดยืนยันก่อนทำ)', ask: true, items: ['จัดตารางใหม่', 'หา seed ที่ดีที่สุด 20 seed', 'ย้าย 21901-1003 ของ G01 ไปพุธ คาบ 2', 'ส่งออก PDF ของ G01'] },
        { type: 'list', title: 'ช่วยใช้งานระบบ', ask: true, items: ['วิธีนำเข้าข้อมูล', 'อัลกอริทึมทำงานยังไง', 'ไปหน้าสรุปภาระสอนครู'] },
      ],
      suggestions: ['สรุปภาพรวม', 'ตาราง G01 วันจันทร์', 'ผลตรวจเงื่อนไข'],
      context: nextCtx,
    };
  }

  if (intent === 'algorithm') {
    return {
      intent,
      text: `**หลักการทำงานของระบบจัดตารางอัตโนมัติ:**\n${ALGORITHM.join('\n')}`,
      cards: [],
      suggestions: ['ไปหน้าจัดตารางอัตโนมัติ', 'หา seed ที่ดีที่สุด 20 seed'],
      context: nextCtx,
    };
  }

  if (intent === 'howto') {
    const match = HOWTO.find((h) => h.keys.some((k) => norm.includes(k))) || HOWTO[0];
    return {
      intent,
      text: `**${match.title}**\n${match.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      cards: [{ type: 'buttons', items: [{ label: `ไปที่หน้า${PAGES.find((p) => p.path === match.page?.split('?')[0])?.title || ''}`, action: { kind: 'navigate', payload: match.page } }] }],
      suggestions: ['ทำอะไรได้บ้าง', 'อัลกอริทึมทำงานยังไง'],
      context: nextCtx,
    };
  }

  if (intent === 'navigate') {
    const page = PAGES.find((p) => p.keywords.some((k) => norm.includes(k))) || PAGES[0];
    return {
      intent,
      text: `กำลังพาไปหน้า **${page.title}** ครับ`,
      cards: [{ type: 'buttons', items: [{ label: `เปิดหน้า ${page.title}`, action: { kind: 'navigate', payload: page.path, auto: true } }] }],
      suggestions: ['สรุปภาพรวม', 'ทำอะไรได้บ้าง'],
      context: nextCtx,
    };
  }

  if (intent === 'warnings') {
    const warns = ctx.warnings || [];
    return {
      intent,
      text: warns.length === 0 ? 'ไม่พบคำเตือนหรือข้อผิดพลาดในข้อมูลตั้งต้นครับ ข้อมูลพร้อมจัดตาราง' : `พบข้อสังเกตจากข้อมูล **${warns.length} รายการ**`,
      cards: [
        ...(warns.length > 0 ? [{ type: 'list', title: 'ข้อสังเกตจากข้อมูล', items: warns.map((w) => `[${w.level}] ${w.message}`) }] : []),
        { type: 'buttons', items: [{ label: 'ไปหน้าจัดการข้อมูล', action: { kind: 'navigate', payload: '/data' } }] },
      ],
      suggestions: ['สรุปภาพรวม', 'จัดตารางใหม่'],
      context: nextCtx,
    };
  }

  if (intent === 'explain') {
    const lines = ents.numbers.map((id) => {
      const c = CONSTRAINTS[id];
      if (!c) return `- **${id}**: ไม่พบข้อมูลเงื่อนไข`;
      const state = id in (config.constraints || {}) ? ` (สถานะปัจจุบัน: ${config.constraints[id] ? 'เปิด' : 'ปิด'})` : ' (เงื่อนไขบังคับเสมอ)';
      return `**ข้อ ${id}: ${c.name}**${state}\n- รายละเอียด: ${c.detail}\n- สาเหตุที่พบบ่อย: ${c.why}\n- แนวทางแก้ไข: ${c.fix}`;
    });
    return {
      intent,
      text: lines.join('\n\n'),
      cards: [],
      suggestions: ['ผลตรวจเงื่อนไข', 'ทำไมข้อ S1 ไม่ผ่าน'],
      context: nextCtx,
    };
  }

  if (intent === 'summary') {
    const hasTt = rows.length > 0;
    const statusText = !hasTt
      ? 'ยังไม่มีตารางเรียน'
      : validation?.passed
        ? `ผ่านทุกเงื่อนไข (${rows.length} แถว, Seed ${meta?.stats?.seed ?? '-'})`
        : `มีเงื่อนไขไม่ผ่าน (${rows.length} แถว)`;
    return {
      intent,
      text: `**สรุปภาพรวมข้อมูลและตารางเรียน**\n- กลุ่มเรียน: ${ctx.groups.size} กลุ่ม · ครู: ${ctx.teachers.size} คน · ห้องเรียน: ${ctx.rooms.size} ห้อง · รายวิชา: ${ctx.subjects.size} วิชา\n- สถานะตารางล่าสุด: **${statusText}**`,
      cards: [],
      suggestions: hasTt ? ['ผลตรวจเงื่อนไข', 'ภาระสอนของครู', 'การใช้ห้อง'] : ['จัดตารางใหม่', 'ข้อสังเกตจากข้อมูล'],
      context: nextCtx,
    };
  }

  if (intent === 'solve') {
    const nextConstraints = { ...(config.constraints || {}) };
    for (const id of ents.on) nextConstraints[id] = true;
    for (const id of ents.off) nextConstraints[id] = false;
    const nextSeed = ents.randomSeed ? Math.floor(Date.now() % 99999) + 1 : ents.seed ?? config.params?.seed ?? 42;
    const enabledList = Object.entries(nextConstraints).filter(([, v]) => v).map(([k]) => k);
    return {
      intent,
      text: 'เตรียมคำสั่งจัดตารางอัตโนมัติเรียบร้อย กดยืนยันเพื่อเริ่มทำงานครับ',
      cards: [
        {
          type: 'action',
          title: 'จัดตารางอัตโนมัติ',
          lines: [
            `Seed: ${nextSeed}${ents.randomSeed ? ' (สุ่มใหม่)' : ''}`,
            `เงื่อนไขพิเศษที่เปิด: ${enabledList.length ? enabledList.join(', ') : 'ปิดทั้งหมด'}`,
            `บล็อกสูงสุด: ${config.params?.maxBlock ?? 4} คาบ · สูงสุด/วัน: ${config.params?.maxPerDay ?? 8} คาบ`,
          ],
          status: 'pending',
          action: { kind: 'solve', payload: { constraints: nextConstraints, params: { seed: nextSeed } }, label: 'ยืนยันจัดตาราง' },
        },
      ],
      suggestions: ['หา seed ที่ดีที่สุด 20 seed', 'สรุปภาพรวม'],
      context: nextCtx,
    };
  }

  if (intent === 'diagnose') {
    return {
      intent,
      text: 'ต้องการให้ระบบวิเคราะห์ความจุข้อมูลและทดสอบหาเงื่อนไขที่เป็นสาเหตุใช่ไหมครับ?',
      cards: [
        {
          type: 'action',
          title: 'วิเคราะห์สาเหตุ (Diagnose)',
          lines: ['ตรวจความจุครู/ห้อง/คาบเวลา และทดสอบปิดเงื่อนไขพิเศษทีละข้อ'],
          status: 'pending',
          action: { kind: 'diagnose', payload: {}, label: 'เริ่มวิเคราะห์สาเหตุ' },
        },
      ],
      suggestions: ['ข้อสังเกตจากข้อมูล', 'จัดตารางใหม่'],
      context: nextCtx,
    };
  }

  if (intent === 'best_seed') {
    const m = norm.match(/(\d+)\s*(?:seed|ครั้ง|รอบ|ตัว)/);
    const count = m ? Math.max(2, Math.min(60, Number(m[1]))) : 20;
    return {
      intent,
      text: `พร้อมค้นหา Seed ที่ดีที่สุดจำนวน **${count} Seed** (เรียงตาม Soft Cost ต่ำสุด)`,
      cards: [
        {
          type: 'action',
          title: `ค้นหา Seed ที่ดีที่สุด (${count} Seed)`,
          lines: [`จะทดลองจัดตาราง ${count} ค่า Seed แล้วบันทึกค่าที่ดีที่สุดลงตาราง`],
          status: 'pending',
          action: { kind: 'best_seed', payload: { count }, label: 'เริ่มค้นหา Seed' },
        },
      ],
      suggestions: ['จัดตารางใหม่'],
      context: nextCtx,
    };
  }

  if (intent === 'save_seed') {
    const st = meta?.stats;
    return {
      intent,
      text: st?.seed ? `ต้องการบันทึก **Seed ${st.seed}** เก็บไว้ในรายการ Seed ที่บันทึกใช่ไหมครับ?` : 'ยังไม่มีค่า Seed จากตารางล่าสุด',
      cards: st?.seed
        ? [
            {
              type: 'action',
              title: `บันทึก Seed ${st.seed}`,
              lines: [`Soft Cost: ${st.softCostAfter ?? '-'}`, `ชื่อเริ่มต้น: Seed ${st.seed}`],
              status: 'pending',
              action: { kind: 'save_seed', payload: { seed: st.seed, constraints: st.constraints, params: st.params, softCost: st.softCostAfter }, label: 'บันทึก Seed' },
            },
          ]
        : [],
      suggestions: ['จัดตารางใหม่', 'หา seed ที่ดีที่สุด 20 seed'],
      context: nextCtx,
    };
  }

  // Remaining intents require a timetable
  if (!rows.length) return needTimetableReply(intent, nextCtx);

  const val = validation || validate(rows, data, config, ctx);

  if (intent === 'validation') {
    if (ents.numbers.length > 0) {
      const id = ents.numbers[0];
      const ck = val.checks.find((c) => c.id === id);
      const kb = CONSTRAINTS[id];
      if (!ck) return { intent, text: `ไม่พบเงื่อนไขรหัส ${id}`, cards: [], suggestions: ['ผลตรวจเงื่อนไข'], context: nextCtx };
      const status = !ck.enabled ? 'ปิดใช้งาน' : ck.passed ? 'ผ่าน ✓' : `ไม่ผ่าน ✗ (${ck.violationCount} รายการ)`;
      return {
        intent,
        text: `**ข้อ ${ck.id}: ${ck.name}** — สถานะ: **${status}**${kb ? `\n- สาเหตุที่พบบ่อย: ${kb.why}\n- วิธีแก้ไข: ${kb.fix}` : ''}`,
        cards: ck.violations.length
          ? [{ type: 'list', title: 'ตัวอย่างรายการที่ไม่ผ่าน (สูงสุด 10)', items: ck.violations.slice(0, 10) }]
          : [],
        suggestions: ['ผลตรวจเงื่อนไข', 'จัดตารางใหม่'],
        context: nextCtx,
      };
    }
    return {
      intent,
      text: val.passed ? `ตารางเรียนล่าสุด **ผ่านทุกเงื่อนไข (${val.checks.length}/${val.checks.length})**` : `พบเงื่อนไขที่ไม่ผ่าน **${val.checks.filter((c) => !c.passed).length} ข้อ**`,
      cards: [
        {
          type: 'table',
          title: 'ผลการตรวจเงื่อนไขทั้งหมด',
          columns: ['รหัส', 'เงื่อนไข', 'สถานะ', 'จำนวน'],
          rows: val.checks.map((c) => [c.id, c.name, !c.enabled ? 'ปิด' : c.passed ? 'ผ่าน' : 'ไม่ผ่าน', c.violationCount]),
          link: { label: 'ดูรายละเอียดที่ผลตรวจเงื่อนไข', path: '/report' },
        },
      ],
      suggestions: ['ทำไมข้อ S1 ไม่ผ่าน', 'เงื่อนไขข้อ S3 คืออะไร'],
      context: nextCtx,
    };
  }

  if (intent === 'schedule') {
    if (!target) {
      return {
        intent,
        text: 'ต้องการดูตารางของกลุ่มเรียน ครู หรือห้องเรียนไหนครับ? (เช่น ตาราง G01 วันจันทร์ หรือ ครูวุฒิวงศ์สอนอะไร)',
        cards: [],
        suggestions: ['ตาราง G01 วันจันทร์', 'ครูวุฒิวงศ์สอนอะไรวันพุธ', 'ห้อง 631 ใช้ทำอะไรบ้าง'],
        context: nextCtx,
      };
    }
    const grid = buildGrid(target.view, target.id, rows, ctx);
    const outRows = [];
    grid.days.forEach((d, di) => {
      if (ents.days.length && !ents.days.includes(d.key)) return;
      for (const sp of grid.cells[di]) {
        const endP = sp.start + sp.span - 1;
        if (ents.periods.length && !ents.periods.some((p) => p >= sp.start && p <= endP)) continue;
        const pTxt = sp.span > 1 ? `${sp.start}-${endP}` : `${sp.start}`;
        const who = target.view === 'group' ? sp.teacher : target.view === 'teacher' ? sp.groups.join('+') : `${sp.groups.join('+')} · ${sp.teacher}`;
        outRows.push([d.label, pTxt, `${sp.subject_id} ${sp.subject_name}`, who, sp.room]);
      }
    });
    const whoCol = target.view === 'group' ? 'ครู' : target.view === 'teacher' ? 'กลุ่ม' : 'กลุ่ม·ครู';
    return {
      intent,
      text: outRows.length
        ? `ตารางของ **${entityLabel(target.view, target.id, ctx)}** (รวม ${grid.total} คาบ/สัปดาห์)`
        : `**${entityLabel(target.view, target.id, ctx)}** ไม่มีคาบเรียนในช่วงเวลาที่ถามครับ`,
      cards: outRows.length
        ? [
            {
              type: 'table',
              title: entityLabel(target.view, target.id, ctx),
              columns: ['วัน', 'คาบ', 'วิชา', whoCol, 'ห้อง'],
              rows: outRows,
              link: { label: 'เปิดดูในหน้าตารางเรียน', path: `/timetable?view=${target.view}&id=${target.id}` },
            },
          ]
        : [],
      suggestions: [`${target.id} ว่างคาบไหนวันพุธ`, `ส่งออก PDF ของ ${target.id}`],
      context: { view: target.view, id: target.id },
    };
  }

  if (intent === 'free') {
    if (!target) {
      return {
        intent,
        text: 'กรุณาระบุกลุ่มเรียน ครู หรือห้องที่ต้องการเช็กคาบว่างครับ (เช่น ครู T02 ว่างคาบไหนวันศุกร์)',
        cards: [],
        suggestions: ['ครู T02 ว่างคาบไหนวันศุกร์', 'G01 ว่างคาบไหน'],
        context: nextCtx,
      };
    }
    const grid = buildGrid(target.view, target.id, rows, ctx);
    const lines = [];
    grid.days.forEach((d, di) => {
      if (ents.days.length && !ents.days.includes(d.key)) return;
      const busy = new Set();
      for (const sp of grid.cells[di]) {
        for (let p = sp.start; p < sp.start + sp.span; p++) busy.add(p);
      }
      const usable = ctx.daySlots[di].map((sid) => ctx.slotsById.get(sid).period);
      const freePs = usable.filter((p) => !busy.has(p));
      lines.push(`- วัน${d.label}: ว่างคาบ **${compressPeriods(freePs)}**`);
    });
    return {
      intent,
      text: `คาบเรียนที่ว่างของ **${entityLabel(target.view, target.id, ctx)}**\n${lines.join('\n')}\n*(หมายเหตุ: คาบ 1 เป็น Homeroom และคาบ 6 เป็นพักเที่ยง)*`,
      cards: [],
      suggestions: [`ตาราง ${target.id}`, 'สรุปภาพรวม'],
      context: { view: target.view, id: target.id },
    };
  }

  if (intent === 'free_resources') {
    const dayKey = ents.days[0] || ctx.days[0];
    const period = ents.periods[0] || 2;
    if (period === ctx.homeroomPeriod) {
      return { intent, text: `คาบที่ ${period} (08:00–08:30) เป็นคาบ **Homeroom** ทั้งวิทยาลัย ไม่มีรายวิชาจัดลงครับ`, cards: [], suggestions: ['ห้องไหนว่าง วันพุธ คาบ 3'], context: nextCtx };
    }
    if (period === ctx.breakPeriod) {
      return { intent, text: `คาบที่ ${period} (12:30–13:30) เป็นคาบ **พักเที่ยง** ไม่มีรายวิชาจัดลงครับ`, cards: [], suggestions: ['ห้องไหนว่าง วันพุธ คาบ 3'], context: nextCtx };
    }
    const slot = [...ctx.slotsById.values()].find((s) => s.day === dayKey && s.period === period);
    const atSlot = slot ? rows.filter((r) => r.timeslot_id === slot.id) : [];
    const askTeacher = /(ครู|ใคร)/.test(norm);

    if (askTeacher) {
      const busyT = new Set(atSlot.map((r) => r.teacher_id));
      const freeT = [...ctx.teachers.values()].filter((t) => !busyT.has(t.teacher_id));
      return {
        intent,
        text: `วัน${DAY_TH[dayKey] || dayKey} คาบ ${period} มีครูว่าง **${freeT.length} ท่าน**`,
        cards: [{ type: 'list', title: 'ครูที่ว่าง', items: freeT.map((t) => `${t.teacher_id} ${t.teacher_name}`) }],
        suggestions: ['ห้องไหนว่าง วันพุธ คาบ 3', 'ภาระสอนของครู'],
        context: nextCtx,
      };
    }

    const busyR = new Set(atSlot.map((r) => r.room_id));
    const freeR = [...ctx.rooms.values()].filter((r) => !busyR.has(r.room_id));
    return {
      intent,
      text: `วัน${DAY_TH[dayKey] || dayKey} คาบ ${period} มีห้องว่าง **${freeR.length} ห้อง**`,
      cards: [{ type: 'list', title: 'ห้องเรียนที่ว่าง', items: freeR.map((r) => `${r.room_id} (${r.room_type})`) }],
      suggestions: ['ครูคนไหนว่าง วันจันทร์ คาบ 4', 'การใช้ห้อง'],
      context: nextCtx,
    };
  }

  if (intent === 'at_time') {
    const dayKey = ents.days[0];
    const period = ents.periods[0];
    if (period === ctx.homeroomPeriod) return { intent, text: `วัน${DAY_TH[dayKey]} คาบ 1 เป็นคาบ Homeroom ทั้งวิทยาลัยครับ`, cards: [], suggestions: [], context: nextCtx };
    if (period === ctx.breakPeriod) return { intent, text: `วัน${DAY_TH[dayKey]} คาบ 6 เป็นคาบพักเที่ยงครับ`, cards: [], suggestions: [], context: nextCtx };
    const slot = [...ctx.slotsById.values()].find((s) => s.day === dayKey && s.period === period);
    const atSlot = slot ? rows.filter((r) => r.timeslot_id === slot.id) : [];
    return {
      intent,
      text: atSlot.length ? `ตารางเรียนวัน${DAY_TH[dayKey]} คาบ ${period} (${atSlot.length} กลุ่ม)` : `วัน${DAY_TH[dayKey]} คาบ ${period} ไม่มีกลุ่มเรียนในตาราง`,
      cards: atSlot.length
        ? [
            {
              type: 'table',
              title: `วัน${DAY_TH[dayKey]} คาบ ${period}`,
              columns: ['กลุ่ม', 'วิชา', 'ครู', 'ห้อง'],
              rows: atSlot.map((r) => [r.group_id, `${r.subject_id} ${ctx.subjects.get(r.subject_id)?.subject_name || ''}`, ctx.teachers.get(r.teacher_id)?.teacher_name || r.teacher_id, r.room_id]),
            },
          ]
        : [],
      suggestions: ['ห้องไหนว่าง วันพุธ คาบ 3'],
      context: nextCtx,
    };
  }

  if (intent === 'subject') {
    const sid = ents.subjects[0];
    const sub = ctx.subjects.get(sid);
    const subRows = rows.filter((r) => r.subject_id === sid);
    const ts = (ctx.teachersBySubject.get(sid) || []).map((tid) => ctx.teachers.get(tid)?.teacher_name || tid);
    const schedLines = [];
    const seen = new Set();
    for (const r of subRows) {
      const s = ctx.slotsById.get(r.timeslot_id);
      const k = `${r.group_id}|${s?.day}|${r.room_id}|${r.teacher_id}`;
      if (!seen.has(k)) {
        seen.add(k);
        schedLines.push([r.group_id, `${DAY_TH[s?.day] || s?.day} คาบ ${s?.period}`, ctx.teachers.get(r.teacher_id)?.teacher_name || r.teacher_id, r.room_id]);
      }
    }
    return {
      intent,
      text: `**${sid} ${sub?.subject_name || ''}** (${ctx.hours(sid)} คาบ/สัปดาห์ · ท ${sub?.theory ?? 0} / ป ${sub?.practice ?? 0} / น ${sub?.credit ?? 0})\nครูที่สอนได้: ${ts.join(', ') || '-'}`,
      cards: schedLines.length ? [{ type: 'table', title: 'ตารางเรียนวิชานี้', columns: ['กลุ่ม', 'เวลา', 'ครู', 'ห้อง'], rows: schedLines }] : [],
      suggestions: ['ผลตรวจเงื่อนไข', 'สรุปภาพรวม'],
      context: nextCtx,
    };
  }

  if (intent === 'load') {
    const st = timetableStats(rows, ctx);
    if (ents.teachers.length) {
      const t = st.teacherSummary.find((x) => x.id === ents.teachers[0]);
      if (!t) return { intent, text: 'ไม่พบข้อมูลครู', cards: [], suggestions: [], context: nextCtx };
      return {
        intent,
        text: `**${t.name} (${t.id})** สอนรวม **${t.totalPeriods} คาบ/สัปดาห์** (ปวช. ${t.pvcPeriods} คาบ, ปวส. ${t.pvsPeriods} คาบ · เกณฑ์ ${t.minLoad}–${t.maxLoad} คาบ · ท ${t.theory} / ป ${t.practice} / น ${t.credit})`,
        cards: [
          {
            type: 'table',
            title: `รายวิชาที่สอนของ ${t.name}`,
            columns: ['กลุ่ม', 'วิชา', 'ระดับ', 'คาบ'],
            rows: t.subjects.map((s) => [s.group_id, `${s.subject_id} ${s.subject_name}`, s.level, s.periods]),
            link: { label: 'ดูหน้าสรุปภาระสอนครูทั้งหมด', path: '/teacher-summary' },
          },
        ],
        suggestions: ['ภาระสอนของครู', 'ตาราง ' + t.id],
        context: { view: 'teacher', id: t.id },
      };
    }
    if (ents.groups.length) {
      const g = st.groupDaily.find((x) => x.id === ents.groups[0]);
      return {
        intent,
        text: g ? `**${g.id} ${g.name}** เรียนรวม **${g.total} คาบ/สัปดาห์**` : 'ไม่พบข้อมูลกลุ่ม',
        cards: [],
        suggestions: ['ตาราง ' + ents.groups[0]],
        context: { view: 'group', id: ents.groups[0] },
      };
    }
    return {
      intent,
      text: `สรุปภาระสอนของครูทั้ง **${st.teacherSummary.length} ท่าน** (นับตามเวลาจริง)`,
      cards: [
        {
          type: 'table',
          title: 'ภาระสอนครูรายบุคคล',
          columns: ['ครู', 'ตำแหน่ง', 'ปวช.', 'ปวส.', 'รวมคาบ'],
          rows: st.teacherSummary.map((t) => [t.name, t.role, t.pvcPeriods, t.pvsPeriods, t.totalPeriods]),
          link: { label: 'เปิดหน้าสรุปภาระสอนครู', path: '/teacher-summary' },
        },
      ],
      suggestions: ['การใช้ห้อง', 'ผลตรวจเงื่อนไข'],
      context: nextCtx,
    };
  }

  if (intent === 'room_usage') {
    const st = timetableStats(rows, ctx);
    const unused = st.roomUsage.filter((r) => r.periods === 0).length;
    return {
      intent,
      text: `อัตราการใช้ห้องเรียนทั้งหมด ${st.roomUsage.length} ห้อง (ไม่ได้ใช้งาน ${unused} ห้อง)`,
      cards: [
        {
          type: 'table',
          title: 'การใช้ห้องเรียน',
          columns: ['ห้อง', 'ประเภท', 'คาบ/สัปดาห์', 'อัตราใช้ (%)'],
          rows: st.roomUsage.map((r) => [r.id, r.type, r.periods, `${r.pct}%`]),
        },
      ],
      suggestions: ['ห้องไหนว่าง วันพุธ คาบ 3', 'สรุปภาพรวม'],
      context: nextCtx,
    };
  }

  if (intent === 'export') {
    const type = /excel|xlsx/.test(norm) ? 'xlsx' : /csv/.test(norm) ? 'csv' : 'pdf';
    const view = target?.view || 'group';
    const id = target?.id || (view === 'group' ? [...ctx.groups.keys()][0] : '');
    const label = type === 'pdf' ? 'ดูตัวอย่าง / พิมพ์ PDF' : `ดาวน์โหลด ${type.toUpperCase()}`;
    return {
      intent,
      text: `พร้อมส่งออกไฟล์ **${type.toUpperCase()}** ${id ? `ของ **${id}**` : ''} แล้วครับ`,
      cards: [
        {
          type: 'buttons',
          items: [{ label, action: { kind: 'export', payload: { type, view, id }, auto: type === 'pdf' } }],
        },
      ],
      suggestions: ['ไปหน้าส่งออก', 'สรุปภาพรวม'],
      context: nextCtx,
    };
  }

  if (intent === 'move' || intent === 'find_slot') {
    const gid = ents.groups[0] || (target?.view === 'group' ? target.id : null);
    const sid = ents.subjects[0];
    if (!gid || !sid) {
      return {
        intent,
        text: 'กรุณาระบุทั้ง **กลุ่มเรียน** และ **รหัส/ชื่อวิชา** ที่ต้องการย้าย เช่น "ย้าย 21901-1003 ของ G01 ไปพุธ คาบ 2"',
        cards: [],
        suggestions: ['ย้าย 21901-1003 ของ G01 ไปพุธ คาบ 2', 'หาช่องว่างให้ 21901-1003 ของ G01'],
        context: nextCtx,
      };
    }
    const grid = buildGrid('group', gid, rows, ctx);
    const matches = [];
    grid.days.forEach((d, di) => {
      for (const sp of grid.cells[di]) {
        if (sp.subject_id.split(' / ').includes(sid)) {
          matches.push({ day: d.key, dayLabel: d.label, start: sp.start, span: sp.span });
        }
      }
    });
    if (matches.length === 0) {
      return { intent, text: `ไม่พบวิชา ${sid} ในตารางของกลุ่ม ${gid}`, cards: [], suggestions: [], context: nextCtx };
    }
    let chosen = matches[0];
    if (ents.days.length || ents.periods.length) {
      const m = matches.find(
        (x) => (!ents.days.length || ents.days.includes(x.day)) && (!ents.periods.length || ents.periods.includes(x.start))
      );
      if (m) chosen = m;
    }

    if (intent === 'find_slot') {
      const curFailed = val.checks.filter((c) => !c.passed).length;
      const options = [];
      for (let d = 0; d < ctx.days.length; d++) {
        const ds = ctx.daySlots[d];
        for (let i = 0; i <= ds.length - chosen.span; i++) {
          const win = ds.slice(i, i + chosen.span);
          const p0 = ctx.slotsById.get(win[0]).period;
          if (ctx.days[d] === chosen.day && p0 === chosen.start) continue;
          const free = win.every((slotId) => !rows.some((r) => r.group_id === gid && r.timeslot_id === slotId));
          if (!free) continue;
          try {
            const nextRows = moveSpan(rows, ctx, {
              view: 'group',
              id: gid,
              fromDay: chosen.day,
              fromPeriod: chosen.start,
              length: chosen.span,
              toDay: ctx.days[d],
              toPeriod: p0,
            });
            const nextVal = validate(nextRows, data, config, ctx);
            if (nextVal.checks.filter((c) => !c.passed).length <= curFailed) {
              options.push({ day: ctx.days[d], period: p0 });
            }
          } catch {
            // skip invalid
          }
        }
      }
      options.sort((a, b) => a.period - b.period || ctx.days.indexOf(a.day) - ctx.days.indexOf(b.day));
      const top = options.slice(0, 8);
      return {
        intent,
        text: top.length
          ? `พบช่องว่างที่ย้ายวิชา **${sid}** ของ **${gid}** (${chosen.span} คาบ จาก ${chosen.dayLabel} คาบ ${chosen.start}) ได้โดยไม่เพิ่มข้อผิดพลาด:`
          : `ไม่พบช่องว่างที่ย้ายวิชา ${sid} ของ ${gid} โดยคงความถูกต้องของเงื่อนไขทั้งหมดได้`,
        cards: top.length
          ? [
              {
                type: 'buttons',
                items: top.map((o) => ({
                  label: `${DAY_TH[o.day]} คาบ ${o.period}`,
                  action: { kind: 'ask', payload: `ย้าย ${sid} ของ ${gid} ไป${DAY_TH[o.day]} คาบ ${o.period}` },
                })),
              },
            ]
          : [],
        suggestions: [`ตาราง ${gid}`],
        context: { view: 'group', id: gid },
      };
    }

    // intent === 'move'
    const toDay = ents.target?.day || chosen.day;
    const toPeriod = ents.target?.period;
    if (!toPeriod) {
      return { intent, text: 'กรุณาระบุคาบปลายทาง เช่น "ไปพุธ คาบ 2"', cards: [], suggestions: [`หาช่องว่างให้ ${sid} ของ ${gid}`], context: nextCtx };
    }
    try {
      const nextRows = moveSpan(rows, ctx, {
        view: 'group',
        id: gid,
        fromDay: chosen.day,
        fromPeriod: chosen.start,
        length: chosen.span,
        toDay,
        toPeriod,
      });
      const beforeFail = val.checks.filter((c) => !c.passed).length;
      const afterVal = validate(nextRows, data, config, ctx);
      const afterFail = afterVal.checks.filter((c) => !c.passed).length;
      const worse = afterFail > beforeFail;
      return {
        intent,
        text: worse
          ? `คำเตือน: การย้าย ${sid} ของ ${gid} ไป${DAY_TH[toDay] || toDay} คาบ ${toPeriod} จะทำให้มีเงื่อนไขไม่ผ่านเพิ่มขึ้น (${beforeFail} → ${afterFail} ข้อ)`
          : `พร้อมย้าย ${sid} ของ ${gid} จาก${chosen.dayLabel} คาบ ${chosen.start} ไป${DAY_TH[toDay] || toDay} คาบ ${toPeriod} (${chosen.span} คาบ)`,
        cards: [
          {
            type: 'action',
            title: `ย้ายวิชา ${sid} (${gid})`,
            lines: [
              `จาก: ${chosen.dayLabel} คาบ ${chosen.start} (${chosen.span} คาบ)`,
              `ไป: ${DAY_TH[toDay] || toDay} คาบ ${toPeriod}`,
              `ผลตรวจ: ไม่ผ่าน ${beforeFail} → ${afterFail} ข้อ`,
            ],
            status: 'pending',
            action: {
              kind: 'move',
              payload: { view: 'group', id: gid, fromDay: chosen.day, fromPeriod: chosen.start, length: chosen.span, toDay, toPeriod },
              label: worse ? 'ย้ายทั้งที่ไม่ผ่าน' : 'ยืนยันการย้าย',
              danger: worse,
            },
          },
        ],
        suggestions: [`หาช่องว่างให้ ${sid} ของ ${gid}`],
        context: { view: 'group', id: gid },
      };
    } catch (err) {
      return { intent, text: `ไม่สามารถย้ายได้: ${err.message}`, cards: [], suggestions: [`หาช่องว่างให้ ${sid} ของ ${gid}`], context: nextCtx };
    }
  }

  return {
    intent: 'unknown',
    text: `ขอโทษครับ ผมยังไม่เข้าใจ "${message}" ลองพิมพ์ "ทำอะไรได้บ้าง" เพื่อดูตัวอย่างคำถามครับ`,
    cards: [],
    suggestions: ['ทำอะไรได้บ้าง', 'สรุปภาพรวม', 'ตาราง G01 วันจันทร์'],
    context: nextCtx,
  };
}
