import { Router } from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import * as store from '../services/store.js';
import { ENTITIES, entityFromFilename } from '../services/schema.js';
import { parseCsv, parseXlsx } from '../services/csv.js';
import { DEFAULT_CONFIG, TERMS, getActiveTerm, loadConfig, mergeConfig, normalizeTerm, saveConfig, setActiveTerm } from '../services/config.js';
import { buildContext } from '../services/context.js';
import { validate } from '../services/validator.js';
import { runWorker } from '../services/solve-worker.js';
import { buildGrid, entitiesFor, VIEWS } from '../services/grid.js';
import { moveSpan, editSpan } from '../services/editor.js';
import { timetableStats } from '../services/stats.js';
import { exportCsv, exportPdf, exportXlsx, exportQrPdf } from '../services/exporter.js';
import { reply } from '../services/chatbot/bot.js';
import * as auth from '../services/auth.js';

const api = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 20, fileSize: 10 * 1024 * 1024 } });

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function reqTerm(req) {
  const raw = req?.query?.term ?? req?.headers?.['x-term'] ?? req?.body?.term;
  if (raw === undefined || raw === null || String(raw).trim() === '') return getActiveTerm();
  return normalizeTerm(raw);
}

function context(term = getActiveTerm()) {
  const t = normalizeTerm(term);
  return buildContext(store.getData(t), loadConfig(t));
}

function decodeFilename(name) {
  return Buffer.from(String(name || ''), 'latin1').toString('utf8');
}

// Shared helpers reused by API and chatbot action handler
export async function runSolve({ constraints, params, document } = {}, term = getActiveTerm()) {
  const t = normalizeTerm(term);
  const current = loadConfig(t);
  const nextCfg = saveConfig(
    {
      ...current,
      constraints: { ...current.constraints, ...(constraints || {}) },
      params: { ...current.params, ...(params || {}) },
      document: { ...current.document, ...(document || {}) },
    },
    t
  );
  const data = store.getData(t);
  const { result, log } = await runWorker(data, nextCfg, 'solve');
  if (result.status !== 'success') {
    return { ...result, validation: null, log };
  }
  const validation = validate(result.rows, data, nextCfg);
  store.setTimetable(
    result.rows,
    {
      stats: result.stats,
      validationPassed: validation.passed,
      source: 'solver',
    },
    t
  );
  return { ...result, validation, log };
}

export async function runBest({ count = 20, seeds } = {}, term = getActiveTerm()) {
  const t = normalizeTerm(term);
  const clamped = Math.max(2, Math.min(60, Number(count) || 20));
  const current = loadConfig(t);
  const data = store.getData(t);
  const { result } = await runWorker(data, current, 'best', { count: clamped, seeds });
  if (!result.best) {
    return {
      status: 'failed',
      message: 'ไม่พบ seed ที่จัดตารางได้สำเร็จ',
      best: null,
      results: result.results,
      seconds: result.seconds,
      validation: null,
    };
  }
  const nextCfg = saveConfig(
    {
      ...current,
      params: { ...current.params, seed: result.best.seed },
    },
    t
  );
  const validation = validate(result.best.rows, data, nextCfg);
  store.setTimetable(
    result.best.rows,
    {
      stats: result.best.stats,
      validationPassed: validation.passed,
      source: 'solver',
      bestOf: clamped,
    },
    t
  );
  return {
    status: 'success',
    message: `seed ที่ดีที่สุดคือ ${result.best.seed}`,
    best: { seed: result.best.seed, softCost: result.best.softCost },
    results: result.results,
    seconds: result.seconds,
    validation,
  };
}

export function addSeed({ name, seed, constraints, params, softCost } = {}, term = getActiveTerm()) {
  const t = normalizeTerm(term);
  const cfg = loadConfig(t);
  const s = Number(seed ?? cfg.params.seed);
  if (!Number.isFinite(s)) throw store.httpError(400, 'ค่า seed ไม่ถูกต้อง');
  const cObj = { ...cfg.constraints, ...(constraints || {}) };
  const pObj = {
    maxBlock: Number(params?.maxBlock ?? cfg.params.maxBlock),
    maxPerDay: Number(params?.maxPerDay ?? cfg.params.maxPerDay),
    timeLimitSec: Number(params?.timeLimitSec ?? cfg.params.timeLimitSec),
  };
  const sig = JSON.stringify({ seed: s, constraints: cObj, params: pObj });
  if (
    cfg.savedSeeds.some(
      (item) =>
        JSON.stringify({
          seed: item.seed,
          constraints: item.constraints,
          params: {
            maxBlock: item.params?.maxBlock,
            maxPerDay: item.params?.maxPerDay,
            timeLimitSec: item.params?.timeLimitSec,
          },
        }) === sig
    )
  ) {
    throw store.httpError(409, 'Seed และเงื่อนไขชุดนี้ถูกบันทึกไว้แล้ว');
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const label = String(name || '').trim().slice(0, 80) || `Seed ${s}`;
  const item = {
    id,
    name: label,
    seed: s,
    constraints: cObj,
    params: pObj,
    softCost: softCost ?? null,
    savedAt: new Date().toISOString(),
  };
  const next = saveConfig({ ...cfg, savedSeeds: [item, ...cfg.savedSeeds] }, t);
  return next.savedSeeds;
}

function importTeachingWorkbook(sheets, targetTerm = getActiveTerm()) {
  const importedEntities = [];
  const tSheet = sheets['ครูผู้สอน'];
  const rSheet = sheets['ห้องเรียน'];
  const termSheetEntries = [];
  if (sheets['1_2570']) termSheetEntries.push(['1', sheets['1_2570'], '2570']);
  if (sheets['2_2569']) termSheetEntries.push(['2', sheets['2_2569'], '2569']);
  if (!tSheet && !rSheet && termSheetEntries.length === 0) return null;

  const targetTermsForShared = termSheetEntries.length ? TERMS : [normalizeTerm(targetTerm)];

  if (tSheet?.length) {
    const rows = tSheet
      .map((r, i) => {
        const prefix = r['คำนำหน้า'] || '';
        const first = r['ชื่อ'] || '';
        const last = r['นามสกุล'] || '';
        const name = `${prefix}${first} ${last}`.trim();
        const dept = r['สาขาวิชา'] || '';
        const spec = r['ทำหน้าที่พิเศษ'] || '';
        if (!name) return null;
        return {
          teacher_id: `T${String(i + 1).padStart(2, '0')}`,
          teacher_name: name,
          role: spec.includes('หัวหน้าสาขาวิชา') ? 'Leader' : 'Teacher',
          department: dept,
          special_role: spec,
        };
      })
      .filter(Boolean);
    for (const t of targetTermsForShared) store.replaceEntity('teacher', rows, t);
    importedEntities.push({ entity: 'teacher', rows: rows.length });
  }

  if (rSheet?.length) {
    const rows = rSheet
      .map((r) => {
        const id = String(r['ห้อง'] || '').trim();
        return id ? { room_id: id, room_name: id, room_type: 'ห้องเรียน/ปฏิบัติการ' } : null;
      })
      .filter(Boolean);
    for (const t of targetTermsForShared) store.replaceEntity('room', rows, t);
    importedEntities.push({ entity: 'room', rows: rows.length });
  }

  for (const [termNum, termRows] of termSheetEntries) {
    const currentGroups = store.getEntity('student_group', termNum);
    const groupKeyMap = new Map(currentGroups.map((g) => [`${g.department}|${g.level}|${g.year}`, g.group_id]));
    const subMap = new Map();
    const regRows = [];
    for (const r of termRows) {
      const sid = String(r['รหัสวิชา'] || '').trim();
      if (!sid) continue;
      if (termNum === '2' && sid === '20000-2001') continue;
      if (termNum === '1' && sid === '20000-2002') continue;
      const th = Number(r['ทฤษฏี'] ?? r['ทฤษฎี']) || 0;
      const pr = Number(r['ปฏิบัติ']) || 0;
      const cr = Number(r['หน่วยกิต']) || 0;
      const rawH = Number(r['จำนวนชั่วโมงเรียน']) || 0;
      const hrs = th + pr > 0 && rawH > 0 ? Math.min(th + pr, rawH) : rawH || th + pr;
      if (!subMap.has(sid)) {
        subMap.set(sid, {
          subject_id: sid,
          subject_name: String(r['ชื่อวิชา'] || '').trim(),
          theory: th,
          practice: pr,
          credit: cr,
          hours: hrs,
        });
      }
      const gid = groupKeyMap.get(`${String(r['สาขาวิชา'] || '').trim()}|${String(r['ระดับ'] || '').trim()}|${String(r['ชั้นปี'] || '').trim()}`);
      if (gid) regRows.push({ group_id: gid, subject_id: sid });
    }
    if (termNum === '1' && !subMap.has('20000-2001')) {
      subMap.set('20000-2001', {
        subject_id: '20000-2001',
        subject_name: 'กิจกรรมลูกเสือวิสามัญ 1',
        theory: 0,
        practice: 2,
        credit: 0,
        hours: 2,
      });
      for (const g of currentGroups) {
        if (g.level === 'ปวช' && Number(g.year) === 1) regRows.push({ group_id: g.group_id, subject_id: '20000-2001' });
      }
    }
    store.replaceEntity('subject', [...subMap.values()], termNum);
    importedEntities.push({ entity: `subject (ภาค ${termNum})`, rows: subMap.size });
    if (regRows.length) {
      store.replaceEntity('register', regRows, termNum);
      importedEntities.push({ entity: `register (ภาค ${termNum})`, rows: regRows.length });
    }
  }
  return importedEntities;
}

// --- Auth ---
api.get('/auth/me', (req, res) => {
  const sess = auth.getSessionUser(req);
  const defActive = auth.defaultAdminActive();
  res.json({
    user: sess ? auth.publicUser(sess.user) : null,
    defaultPassword: defActive,
    defaultAdmin: defActive ? auth.DEFAULT_ADMIN : null,
  });
});

api.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const result = auth.login(username, password);
  res.setHeader('Set-Cookie', result.cookie);
  res.json({ user: result.user });
});

api.post('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', auth.logout(req));
  res.json({ ok: true });
});

api.post('/auth/password', (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = auth.changeOwnPassword(req.user.username, currentPassword, newPassword);
  res.json({ user });
});

api.put('/auth/profile', (req, res) => {
  const user = auth.updateProfile(req.user.username, req.body || {});
  res.json({ user });
});

// --- Users (admin) ---
api.get('/users', auth.requireAdmin, (_req, res) => {
  res.json({ users: auth.listUsers() });
});
api.post('/users', auth.requireAdmin, (req, res) => {
  res.status(201).json({ user: auth.createUser(req.body || {}) });
});
api.put('/users/:username', auth.requireAdmin, (req, res) => {
  res.json({ user: auth.updateUser(req.params.username, req.body || {}, req.user.username) });
});
api.delete('/users/:username', auth.requireAdmin, (req, res) => {
  auth.deleteUser(req.params.username, req.user.username);
  res.json({ ok: true });
});

// --- Terms ---
function termSummary(term) {
  const t = normalizeTerm(term);
  const cfg = loadConfig(t);
  const tt = store.getTimetable(t);
  const data = store.getData(t);
  const ctx = buildContext(data, cfg);
  return {
    term: t,
    label: `ภาคเรียนที่ ${t}`,
    semester: cfg.document.semester || t,
    year: cfg.document.year || '',
    publicEnabled: Boolean(cfg.document.publicEnabled),
    hasTimetable: Boolean(tt?.rows?.length),
    validationPassed: Boolean(tt?.meta?.validationPassed),
    rowCount: tt?.rows?.length || 0,
    updatedAt: tt?.meta?.updatedAt || null,
    seed: tt?.meta?.stats?.seed ?? cfg.params.seed,
    subjects: data.subject?.length || 0,
    registrations: ctx.registrations.length,
  };
}

api.get('/terms', (_req, res) => {
  res.json({
    activeTerm: getActiveTerm(),
    terms: TERMS.map((t) => termSummary(t)),
  });
});

api.put('/term', (req, res) => {
  const next = setActiveTerm(req.body?.term);
  res.json({
    activeTerm: next,
    terms: TERMS.map((t) => termSummary(t)),
  });
});

// --- Data ---
api.get('/data', (req, res) => {
  const t = reqTerm(req);
  const data = store.getData(t);
  const ctx = context(t);
  const totalPeriods = ctx.registrations.reduce((s, r) => s + ctx.hours(r.subject_id), 0);
  res.json({
    term: t,
    data,
    schema: ENTITIES,
    warnings: ctx.warnings,
    summary: {
      teachers: data.teacher?.length || 0,
      leaders: (data.teacher || []).filter((r) => r.role === 'Leader').length,
      rooms: ctx.rooms.size,
      groups: data.student_group?.length || 0,
      subjects: data.subject?.length || 0,
      registrations: ctx.registrations.length,
      timeslots: data.timeslot?.length || 0,
      totalPeriods,
    },
  });
});

api.post('/data/reset', (req, res) => {
  const t = reqTerm(req);
  const data = store.resetData(t);
  const ctx = context(t);
  res.json({ term: t, data, warnings: ctx.warnings });
});

api.get('/data/:entity', (req, res) => {
  res.json({ rows: store.getEntity(req.params.entity, reqTerm(req)) });
});

api.post('/data/:entity', (req, res) => {
  const row = store.addRow(req.params.entity, req.body || {}, reqTerm(req));
  res.status(201).json({ row });
});

api.put('/data/:entity/:key', (req, res) => {
  const row = store.updateRow(req.params.entity, req.params.key, req.body || {}, reqTerm(req));
  res.json({ row });
});

api.delete('/data/:entity/:key', (req, res) => {
  store.deleteRow(req.params.entity, req.params.key, reqTerm(req));
  res.json({ ok: true });
});

api.post(
  '/import',
  upload.array('files', 20),
  wrap(async (req, res) => {
    const t = reqTerm(req);
    const files = req.files || [];
    if (files.length === 0) throw store.httpError(400, 'กรุณาเลือกไฟล์ CSV หรือ XLSX');

    const imported = [];
    const skipped = [];

    // Process CSVs before multi-sheet XLSX so updated student_group/teacher rows are visible during workbook import
    const orderedFiles = [...files].sort((a, b) => {
      const aX = /\.xlsx$/i.test(decodeFilename(a.originalname)) ? 1 : 0;
      const bX = /\.xlsx$/i.test(decodeFilename(b.originalname)) ? 1 : 0;
      return aX - bX;
    });

    for (const file of orderedFiles) {
      const name = decodeFilename(file.originalname);
      if (/\.xlsx$/i.test(name)) {
        const sheets = await parseXlsx(file.buffer);
        let matched = false;
        for (const [sheetName, rows] of Object.entries(sheets)) {
          const ent = entityFromFilename(sheetName) || (Object.keys(sheets).length === 1 ? entityFromFilename(name) : null);
          if (ent && rows.length > 0) {
            const def = ENTITIES[ent];
            const hasKeys = def.key.every((k) => k in rows[0]);
            if (!hasKeys) throw store.httpError(400, `ไฟล์ ${name} (${sheetName}) ขาดคอลัมน์หลัก ${def.key.join(', ')}`);
            const saved = store.replaceEntity(ent, rows, t);
            imported.push({ file: name, entity: ent, rows: saved.length });
            matched = true;
          }
        }
        if (!matched) {
          const wbRes = importTeachingWorkbook(sheets, t);
          if (wbRes?.length) {
            for (const r of wbRes) imported.push({ file: name, entity: r.entity, rows: r.rows });
          } else {
            skipped.push(name);
          }
        }
      } else if (/\.csv$/i.test(name)) {
        const ent = entityFromFilename(name);
        if (!ent) {
          skipped.push(name);
          continue;
        }
        const rows = parseCsv(file.buffer.toString('utf8'));
        const def = ENTITIES[ent];
        if (rows.length > 0 && !def.key.every((k) => k in rows[0])) {
          throw store.httpError(400, `ไฟล์ ${name} ขาดคอลัมน์หลัก ${def.key.join(', ')}`);
        }
        const saved = store.replaceEntity(ent, rows, t);
        imported.push({ file: name, entity: ent, rows: saved.length });
      } else {
        skipped.push(name);
      }
    }

    const ctx = context(t);
    res.json({ imported, skipped, warnings: ctx.warnings });
  })
);

// --- Config & Seeds ---
api.get('/config', (req, res) => {
  const t = reqTerm(req);
  res.json({ term: t, config: loadConfig(t), defaults: DEFAULT_CONFIG });
});

api.put('/config', (req, res) => {
  const t = reqTerm(req);
  const cur = loadConfig(t);
  const saved = saveConfig({ ...(req.body || {}), savedSeeds: cur.savedSeeds }, t);
  res.json({ term: t, config: saved });
});

api.get('/seeds', (req, res) => {
  res.json({ savedSeeds: loadConfig(reqTerm(req)).savedSeeds });
});

api.post('/seeds', (req, res) => {
  const savedSeeds = addSeed(req.body || {}, reqTerm(req));
  res.status(201).json({ savedSeeds });
});

api.delete('/seeds/:id', (req, res) => {
  const t = reqTerm(req);
  const cur = loadConfig(t);
  const savedSeeds = cur.savedSeeds.filter((s) => s.id !== req.params.id);
  saveConfig({ ...cur, savedSeeds }, t);
  res.json({ savedSeeds });
});

// --- Solve / Diagnose / Best ---
api.post(
  '/solve',
  wrap(async (req, res) => {
    res.json(await runSolve(req.body || {}, reqTerm(req)));
  })
);

api.post(
  '/diagnose',
  wrap(async (req, res) => {
    const t = reqTerm(req);
    const cfg = mergeConfig({ ...loadConfig(t), ...(req.body || {}) }, t);
    const { result } = await runWorker(store.getData(t), cfg, 'diagnose', { probeSeconds: 4 });
    res.json(result);
  })
);

api.post(
  '/solve/best',
  wrap(async (req, res) => {
    res.json(await runBest(req.body || {}, reqTerm(req)));
  })
);

api.get('/stats', (req, res) => {
  const t = reqTerm(req);
  const tt = store.getTimetable(t);
  const ctx = context(t);
  res.json(timetableStats(tt?.rows || [], ctx));
});

// --- Public & Share ---
api.get('/public/terms', (_req, res) => {
  res.json({ terms: TERMS.map((t) => termSummary(t)) });
});

api.get('/public/info', (req, res) => {
  const t = reqTerm(req);
  const cfg = loadConfig(t);
  const tt = store.getTimetable(t);
  res.json({
    term: t,
    enabled: Boolean(cfg.document.publicEnabled),
    college: cfg.document.college,
    semester: cfg.document.semester,
    year: cfg.document.year,
    hasTimetable: Boolean(tt?.rows?.length),
    terms: TERMS.map((x) => {
      const c = loadConfig(x);
      const tx = store.getTimetable(x);
      return {
        term: x,
        label: `ภาคเรียนที่ ${x}`,
        semester: c.document.semester || x,
        year: c.document.year || '',
        enabled: Boolean(c.document.publicEnabled),
        hasTimetable: Boolean(tx?.rows?.length),
      };
    }),
  });
});

function requirePublicEnabled(req, res, next) {
  if (!loadConfig(reqTerm(req)).document.publicEnabled) {
    return res.status(403).json({ message: 'ผู้ดูแลระบบปิดการเผยแพร่ตารางสาธารณะ' });
  }
  return next();
}

api.get('/public/entities', requirePublicEnabled, (req, res) => {
  const ctx = context(reqTerm(req));
  res.json({
    group: entitiesFor('group', ctx),
    teacher: entitiesFor('teacher', ctx),
    room: entitiesFor('room', ctx),
  });
});

api.get('/public/grid', requirePublicEnabled, (req, res) => {
  const t = reqTerm(req);
  const view = VIEWS.includes(req.query.view) ? req.query.view : 'group';
  const tt = store.getTimetable(t);
  if (!tt?.rows?.length) return res.status(404).json({ message: 'ยังไม่มีตารางเรียน' });
  const ctx = context(t);
  const list = entitiesFor(view, ctx);
  const entity = list.find((e) => e.id === req.query.id) || list[0];
  if (!entity) return res.status(404).json({ message: 'ไม่พบข้อมูล' });
  res.json({ term: t, entity, ...buildGrid(view, entity.id, tt.rows, ctx), updatedAt: tt.meta?.updatedAt });
});

function buildShareUrl(req, view, id, term = reqTerm(req)) {
  const t = normalizeTerm(term);
  const cfg = loadConfig(t);
  const base = (cfg.document.publicBaseUrl || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return {
    base,
    enabled: Boolean(cfg.document.publicEnabled),
    url: `${base}/p/${encodeURIComponent(view)}/${encodeURIComponent(id)}?term=${encodeURIComponent(t)}`,
  };
}

api.get(
  '/public/qr',
  requirePublicEnabled,
  wrap(async (req, res) => {
    const view = VIEWS.includes(req.query.view) ? req.query.view : 'group';
    const id = String(req.query.id || 'G01');
    const { url } = buildShareUrl(req, view, id, reqTerm(req));
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1 });
    res.type('image/svg+xml').send(svg);
  })
);

api.get('/share', (req, res) => {
  const view = VIEWS.includes(req.query.view) ? req.query.view : 'group';
  const id = String(req.query.id || 'G01');
  res.json(buildShareUrl(req, view, id, reqTerm(req)));
});

// --- Timetable ---
api.get('/timetable', (req, res) => {
  const t = reqTerm(req);
  const tt = store.getTimetable(t);
  if (!tt) return res.json({ term: t, rows: [], meta: null, validation: null });
  const cfg = loadConfig(t);
  const validation = validate(tt.rows, store.getData(t), cfg);
  res.json({ term: t, rows: tt.rows, meta: tt.meta, validation });
});

api.put('/timetable', (req, res) => {
  const t = reqTerm(req);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const cfg = loadConfig(t);
  const cur = store.getTimetable(t);
  const validation = validate(rows, store.getData(t), cfg);
  const saved = store.setTimetable(
    rows,
    {
      ...(cur?.meta || {}),
      validationPassed: validation.passed,
      source: 'manual',
    },
    t
  );
  res.json({ term: t, rows: saved.rows, meta: saved.meta, validation });
});

api.post('/timetable/validate', (req, res) => {
  const t = reqTerm(req);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : store.getTimetable(t)?.rows || [];
  res.json(validate(rows, store.getData(t), loadConfig(t)));
});

api.post('/timetable/move', (req, res) => {
  const t = reqTerm(req);
  const tt = store.getTimetable(t);
  if (!tt?.rows?.length) throw store.httpError(404, 'ยังไม่มีตารางเรียน');
  const ctx = context(t);
  const nextRows = moveSpan(tt.rows, ctx, req.body || {});
  const validation = validate(nextRows, store.getData(t), loadConfig(t), ctx);
  const saved = store.setTimetable(
    nextRows,
    {
      ...(tt.meta || {}),
      validationPassed: validation.passed,
      source: 'manual',
    },
    t
  );
  res.json({ term: t, rows: saved.rows, meta: saved.meta, validation });
});

api.post('/timetable/edit', (req, res) => {
  const t = reqTerm(req);
  const tt = store.getTimetable(t);
  if (!tt?.rows?.length) throw store.httpError(404, 'ยังไม่มีตารางเรียน');
  const ctx = context(t);
  const nextRows = editSpan(tt.rows, ctx, req.body || {});
  const validation = validate(nextRows, store.getData(t), loadConfig(t), ctx);
  const saved = store.setTimetable(
    nextRows,
    {
      ...(tt.meta || {}),
      validationPassed: validation.passed,
      source: 'manual',
    },
    t
  );
  res.json({ term: t, rows: saved.rows, meta: saved.meta, validation });
});

api.get('/timetable/entities', (req, res) => {
  const ctx = context(reqTerm(req));
  res.json({
    group: entitiesFor('group', ctx),
    teacher: entitiesFor('teacher', ctx),
    room: entitiesFor('room', ctx),
  });
});

api.get('/timetable/grid', (req, res) => {
  const t = reqTerm(req);
  const view = VIEWS.includes(req.query.view) ? req.query.view : 'group';
  const tt = store.getTimetable(t);
  const ctx = context(t);
  const list = entitiesFor(view, ctx);
  const entity = list.find((e) => e.id === req.query.id) || list[0];
  if (!entity) throw store.httpError(404, 'ไม่พบข้อมูล');
  res.json({ entity, ...buildGrid(view, entity.id, tt?.rows || [], ctx) });
});

api.get('/timetable/grids', (req, res) => {
  const t = reqTerm(req);
  const view = VIEWS.includes(req.query.view) ? req.query.view : 'group';
  const tt = store.getTimetable(t);
  const ctx = context(t);
  const list = entitiesFor(view, ctx);
  res.json({
    grids: list.map((entity) => ({ entity, ...buildGrid(view, entity.id, tt?.rows || [], ctx) })),
  });
});

api.get('/document', (req, res) => {
  res.json(loadConfig(reqTerm(req)).document);
});

// --- Export ---
function requireTimetableRows(term = getActiveTerm()) {
  const tt = store.getTimetable(term);
  if (!tt?.rows?.length) throw store.httpError(404, 'ยังไม่มีตารางเรียน กรุณากดจัดตารางก่อน');
  return tt.rows;
}

api.get('/export/csv', (req, res) => {
  const t = reqTerm(req);
  const rows = requireTimetableRows(t);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="output.csv"');
  res.send(exportCsv(rows));
});

api.get(
  '/export/xlsx',
  wrap(async (req, res) => {
    const t = reqTerm(req);
    const rows = requireTimetableRows(t);
    const view = req.query.view || 'all';
    const id = req.query.id || '';
    const buf = await exportXlsx(rows, context(t), { view, id });
    const suffix = id ? `${view}-${id}` : view;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="timetable-t${t}-${suffix}.xlsx"`);
    res.send(buf);
  })
);

api.get(
  '/export/pdf',
  wrap(async (req, res) => {
    const t = reqTerm(req);
    const rows = requireTimetableRows(t);
    const view = req.query.view || 'group';
    const id = req.query.id || '';
    const inline = Boolean(req.query.inline);
    const buf = await exportPdf(rows, context(t), { view, id });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="timetable-t${t}-${view}${id ? `-${id}` : ''}.pdf"`
    );
    res.send(buf);
  })
);

api.get(
  '/export/qr-pdf',
  wrap(async (req, res) => {
    const t = reqTerm(req);
    const view = VIEWS.includes(req.query.view) ? req.query.view : 'group';
    const inline = Boolean(req.query.inline);
    const ctx = context(t);
    const entities = entitiesFor(view, ctx);
    const items = await Promise.all(
      entities.map(async (e) => {
        const { url } = buildShareUrl(req, view, e.id, t);
        const qrPng = await QRCode.toBuffer(url, { type: 'png', width: 220, margin: 1 });
        return { id: e.id, title: e.title, url, qrPng };
      })
    );
    const buf = await exportQrPdf(items, ctx);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="qr-t${t}-${view}.pdf"`);
    res.send(buf);
  })
);

// --- Chatbot ---
function detectChatTerm(message, fallbackTerm) {
  const m = String(message || '').match(/(?:ภาค(?:เรียน)?(?:ที่)?|เทอม)\s*([12])/i);
  return m ? normalizeTerm(m[1]) : fallbackTerm;
}

api.post('/chat', (req, res) => {
  const message = String(req.body?.message || '').slice(0, 500);
  const chatCtx = req.body?.context || {};
  const t = detectChatTerm(message, reqTerm(req));
  const data = store.getData(t);
  const config = loadConfig(t);
  const ctx = buildContext(data, config);
  const tt = store.getTimetable(t);
  const validation = tt?.rows?.length ? validate(tt.rows, data, config, ctx) : null;
  res.json(reply(message, chatCtx, { data, config, ctx, rows: tt?.rows || [], meta: tt?.meta || null, validation }));
});

api.post(
  '/chat/action',
  wrap(async (req, res) => {
    const { kind, payload = {} } = req.body || {};
    const t = reqTerm(req);
    if (kind === 'solve') {
      const r = await runSolve(payload, t);
      return res.json({
        ok: r.status === 'success',
        text: r.status === 'success' ? `จัดตารางภาคเรียนที่ ${t} สำเร็จ (${r.rows.length} แถว, Seed ${r.stats.seed}, ${r.stats.seconds} วินาที)` : `${r.message}: ${(r.errors || []).join('; ')}`,
        refresh: r.status === 'success',
      });
    }
    if (kind === 'best_seed') {
      const r = await runBest(payload, t);
      return res.json({
        ok: r.status === 'success',
        text: r.status === 'success' ? `${r.message} (Soft Cost ${r.best.softCost})` : r.message,
        refresh: r.status === 'success',
      });
    }
    if (kind === 'diagnose') {
      const cfg = loadConfig(t);
      const { result } = await runWorker(store.getData(t), cfg, 'diagnose', { probeSeconds: 4 });
      return res.json({
        ok: result.feasible,
        text: `${result.feasible ? 'จัดตารางได้สำเร็จ' : 'พบปัญหาในเงื่อนไข'}: ${(result.suggestions || []).join(' ')}`,
        refresh: false,
      });
    }
    if (kind === 'save_seed') {
      const list = addSeed(payload, t);
      return res.json({ ok: true, text: `บันทึก Seed ${payload.seed} (ภาค ${t}) เรียบร้อยแล้ว (รวม ${list.length} รายการ)`, refresh: true });
    }
    if (kind === 'move') {
      const tt = store.getTimetable(t);
      if (!tt?.rows?.length) throw store.httpError(404, 'ยังไม่มีตารางเรียน');
      const ctx = context(t);
      const nextRows = moveSpan(tt.rows, ctx, payload);
      const validation = validate(nextRows, store.getData(t), loadConfig(t), ctx);
      store.setTimetable(nextRows, { ...(tt.meta || {}), validationPassed: validation.passed, source: 'manual' }, t);
      return res.json({
        ok: true,
        text: `ย้ายคาบเรียนสำเร็จ (ผลตรวจ: ${validation.passed ? 'ผ่านทุกเงื่อนไข' : 'มีเงื่อนไขไม่ผ่าน'})`,
        refresh: true,
      });
    }
    throw store.httpError(400, `ไม่รู้จักคำสั่ง ${kind}`);
  })
);

export default api;
