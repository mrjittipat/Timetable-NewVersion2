import * as store from '../src/services/store.js';
import { loadConfig } from '../src/services/config.js';
import { buildContext } from '../src/services/context.js';
import { solve } from '../src/services/solver.js';
import { validate } from '../src/services/validator.js';
import { extract } from '../src/services/chatbot/nlu.js';
import { reply } from '../src/services/chatbot/bot.js';

store.init();
const data = store.getData();
const config = loadConfig();
const ctx = buildContext(data, config);
const solved = solve(data, config);
const validation = validate(solved.rows, data, config, ctx);
const env = {
  data,
  config,
  ctx,
  rows: solved.rows,
  meta: { stats: solved.stats, source: 'solver' },
  validation,
};

const cases = [
  ['สวัสดีครับ', 'greeting'],
  ['ทำอะไรได้บ้าง', 'help'],
  ['ตาราง G01 วันจันทร์', 'schedule', (e) => e.groups[0] === 'G01' && e.days[0] === 'Mon'],
  ['ครูวุฒิวงศ์สอนอะไรวันพุธ', 'schedule', (e) => e.teachers[0] === 'T01'],
  ['การออกแบบและจัดการฐานข้อมูล เรียนที่ไหน', 'subject', (e) => e.teachers.length === 0 && e.subjects[0] === '21901-1003'],
  ['ครูยุวดีสอนอะไร', 'schedule', (e) => e.teachers[0] === 'T07'],
  ['ครู T02 ว่างคาบไหนวันศุกร์', 'free', (e) => e.teachers[0] === 'T02' && e.days[0] === 'Fri'],
  ['ห้องไหนว่าง วันพุธ คาบ 3', 'free_resources', (e) => e.days[0] === 'Wed' && e.periods[0] === 3],
  ['ครูคนไหนว่าง วันจันทร์ คาบ 4', 'free_resources'],
  ['วันอังคาร คาบ 2 ใครเรียนอะไร', 'at_time'],
  ['ห้อง 631 ใช้ทำอะไรบ้าง', 'schedule', (e) => e.rooms[0] === '631'],
  ['วิชา 31901-2004 เรียนที่ไหน', 'subject'],
  ['ผลตรวจเงื่อนไข', 'validation'],
  ['ทำไมข้อ S1 ไม่ผ่าน', 'validation', (e) => e.numbers.includes('S1')],
  ['เงื่อนไขข้อ S1 คืออะไร', 'explain', (e) => e.numbers.includes('S1')],
  ['ภาระสอนของครู', 'load'],
  ['T01 สอนกี่คาบ', 'load'],
  ['การใช้ห้อง', 'room_usage'],
  ['ข้อสังเกตจากข้อมูล', 'warnings'],
  ['สรุปภาพรวม', 'summary'],
  ['จัดตารางใหม่ เปิด S1 ปิด S3', 'solve', (e) => e.on.includes('S1') && e.off.includes('S3')],
  ['จัดตาราง seed 123', 'solve', (e) => e.seed === 123],
  ['สุ่ม seed ใหม่', 'solve', (e) => e.randomSeed === true],
  ['ย้าย 21901-1003 ของ G01 ไปพุธ คาบ 2', 'move', (e) => e.target?.day === 'Wed' && e.target?.period === 2],
  ['หาช่องว่างให้ 21901-1003 ของ G01', 'find_slot'],
  ['บันทึก seed', 'save_seed'],
  ['ทำไมจัดตารางไม่ได้', 'diagnose'],
  ['หา seed ที่ดีที่สุด 30 seed', 'best_seed'],
  ['ส่งออก PDF ของ G01', 'export'],
  ['ไปหน้าส่งออก', 'navigate'],
  ['วิธีนำเข้าข้อมูล', 'howto'],
  ['อัลกอริทึมทำงานยังไง', 'algorithm'],
  ['ขอบคุณ', 'thanks'],
  ['กินข้าวยัง', 'unknown'],
];

let failed = 0;
for (const [msg, expectedIntent, checkFn] of cases) {
  const ents = extract(msg, ctx);
  const res = reply(msg, {}, env);
  const intentOk = res.intent === expectedIntent;
  const entOk = checkFn ? checkFn(ents) : true;
  if (intentOk && entOk) {
    console.log(`PASS "${msg}" -> ${res.intent}`);
  } else {
    failed++;
    console.log(`FAIL "${msg}" -> got=${res.intent} (expected ${expectedIntent}), ents=${JSON.stringify(ents)}`);
  }
}

const first = reply('ตาราง G03', {}, env);
const follow = reply('แล้ววันพุธล่ะ ว่างคาบไหน', first.context, env);
if (follow.intent === 'free' && follow.context?.id === 'G03') {
  console.log(`PASS follow-up context -> free (G03)`);
} else {
  failed++;
  console.log(`FAIL follow-up context -> got intent=${follow.intent}, context=${JSON.stringify(follow.context)}`);
}

if (failed > 0) process.exit(1);
