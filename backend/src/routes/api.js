import { Router } from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import * as store from '../services/store.js';
import { ENTITIES, entityFromFilename } from '../services/schema.js';
import { parseCsv, parseXlsx } from '../services/csv.js';
import { DEFAULT_CONFIG, loadConfig, mergeConfig, saveConfig } from '../services/config.js';
import { buildContext } from '../services/context.js';
import { validate } from '../services/validator.js';
import { runWorker } from '../services/solve-worker.js';
import { buildGrid, entitiesFor, VIEWS } from '../services/grid.js';
import { moveSpan, editSpan } from '../services/editor.js';
import { timetableStats } from '../services/stats.js';
import { exportCsv, exportPdf, exportXlsx, exportQrPdf } from '../services/exporter.js';
import * as auth from '../services/auth.js';

const api = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 20, fileSize: 10 * 1024 * 1024 } });

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function context() {
  return buildContext(store.getData(), loadConfig());
}

function decodeFilename(name) {
  return Buffer.from(String(name || ''), 'latin1').toString('utf8');
}

// Shared helpers reused by API and chatbot action handler
export async function runSolve({ constraints, params, document } = {}) {
  const current = loadConfig();
  const nextCfg = saveConfig({
    ...current,
    constraints: { ...current.constraints, ...(constraints || {}) },
    params: { ...current.params, ...(params || {}) },
    document: { ...current.document, ...(document || {}) },
  });
  const data = store.getData();
  const { result, log } = await runWorker(data, nextCfg, 'solve');
  if (result.status !== 'success') {
    return { ...result, validation: null, log };
  }
  const validation = validate(result.rows, data, nextCfg);
  store.setTimetable(result.rows, {
    stats: result.stats,
    validationPassed: validation.passed,
    source: 'solver',
  });
  return { ...result, validation, log };
}

export async function runBest({ count = 20, seeds } = {}) {
  const clamped = Math.max(2, Math.min(60, Number(count) || 20));
  const current = loadConfig();
  const data = store.getData();
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
  const nextCfg = saveConfig({
    ...current,
    params: { ...current.params, seed: result.best.seed },
  });
  const validation = validate(result.best.rows, data, nextCfg);
  store.setTimetable(result.best.rows, {
    stats: result.best.stats,
    validationPassed: validation.passed,
    source: 'solver',
    bestOf: clamped,
  });
  return {
    status: 'success',
    message: `seed ที่ดีที่สุดคือ ${result.best.seed}`,
    best: { seed: result.best.seed, softCost: result.best.softCost },
    results: result.results,
    seconds: result.seconds,
    validation,
  };
}

export function addSeed({ name, seed, constraints, params, softCost } = {}) {
  const cfg = loadConfig();
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
  const next = saveConfig({ ...cfg, savedSeeds: [item, ...cfg.savedSeeds] });
  return next.savedSeeds;
}

function importTeachingWorkbook(sheets) {
  const importedEntities = [];
  const tSheet = sheets['ครูผู้สอน'];
  const rSheet = sheets['ห้องเรียน'];
  const termSheetName = sheets['2_2569'] ? '2_2569' : sheets['1_2570'] ? '1_2570' : null;
  const termRows = termSheetName ? sheets[termSheetName] : null;
  if (!tSheet && !rSheet && !termRows) return null;

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
    store.replaceEntity('teacher', rows);
    importedEntities.push({ entity: 'teacher', rows: rows.length });
  }

  if (rSheet?.length) {
    const rows = rSheet
      .map((r) => {
        const id = String(r['ห้อง'] || '').trim();
        return id ? { room_id: id, room_name: id, room_type: 'ห้องเรียน/ปฏิบัติการ' } : null;
      })
      .filter(Boolean);
    store.replaceEntity('room', rows);
    importedEntities.push({ entity: 'room', rows: rows.length });
  }

  if (termRows?.length) {
    const currentGroups = store.getEntity('student_group');
    const groupKeyMap = new Map(
      currentGroups.map((g) => [`${g.department}|${g.level}|${g.year}`, g.group_id])
    );
    const subMap = new Map();
    const regRows = [];
    const termNum = termSheetName.startsWith('1_') ? '1' : '2';
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
    store.replaceEntity('subject', [...subMap.values()]);
    importedEntities.push({ entity: 'subject', rows: subMap.size });
    if (regRows.length) {
      store.replaceEntity('register', regRows);
      importedEntities.push({ entity: 'register', rows: regRows.length });
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

// --- Data ---
api.get('/data', (_req, res) => {
  const data = store.getData();
  const ctx = buildContext(data, loadConfig());
  const totalPeriods = ctx.registrations.reduce((s, r) => s + ctx.hours(r.subject_id), 0);
  res.json({
    data,
    schema: ENTITIES,
    warnings: ctx.warnings,
    summary: {
      teachers: data.teacher?.length || 0,
      leaders: (data.teacher || []).filter((t) => t.role === 'Leader').length,
      rooms: ctx.rooms.size,
      groups: data.student_group?.length || 0,
      subjects: data.subject?.length || 0,
      registrations: ctx.registrations.length,
      timeslots: data.timeslot?.length || 0,
      totalPeriods,
    },
  });
});

api.post('/data/reset', (_req, res) => {
  const data = store.resetData();
  const ctx = buildContext(data, loadConfig());
  res.json({ data, warnings: ctx.warnings });
});

api.get('/data/:entity', (req, res) => {
  res.json({ rows: store.getEntity(req.params.entity) });
});

api.post('/data/:entity', (req, res) => {
  const row = store.addRow(req.params.entity, req.body || {});
  res.status(201).json({ row });
});

api.put('/data/:entity/:key', (req, res) => {
  const row = store.updateRow(req.params.entity, req.params.key, req.body || {});
  res.json({ row });
});

api.delete('/data/:entity/:key', (req, res) => {
  store.deleteRow(req.params.entity, req.params.key);
  res.json({ ok: true });
});

api.post(
  '/import',
  upload.array('files', 20),
  wrap(async (req, res) => {
    const files = req.files || [];
    if (files.length === 0) throw store.httpError(400, 'กรุณาเลือกไฟล์ CSV หรือ XLSX');

    const imported = [];
    const skipped = [];

    for (const file of files) {
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
            const saved = store.replaceEntity(ent, rows);
            imported.push({ file: name, entity: ent, rows: saved.length });
            matched = true;
          }
        }
        if (!matched) {
          const wbRes = importTeachingWorkbook(sheets);
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
        const saved = store.replaceEntity(ent, rows);
        imported.push({ file: name, entity: ent, rows: saved.length });
      } else {
        skipped.push(name);
      }
    }

    const ctx = context();
    res.json({ imported, skipped, warnings: ctx.warnings });
  })
);

// --- Config & Seeds ---
api.get('/config', (_req, res) => {
  res.json({ config: loadConfig(), defaults: DEFAULT_CONFIG });
});

api.put('/config', (req, res) => {
  const cur = loadConfig();
  const saved = saveConfig({ ...(req.body || {}), savedSeeds: cur.savedSeeds });
  res.json({ config: saved });
});

api.get('/seeds', (_req, res) => {
  res.json({ savedSeeds: loadConfig().savedSeeds });
});

api.post('/seeds', (req, res) => {
  const savedSeeds = addSeed(req.body || {});
  res.status(201).json({ savedSeeds });
});

api.delete('/seeds/:id', (req, res) => {
  const cur = loadConfig();
  const savedSeeds = cur.savedSeeds.filter((s) => s.id !== req.params.id);
  saveConfig({ ...cur, savedSeeds });
  res.json({ savedSeeds });
});

// --- Solve / Diagnose / Best ---
api.post(
  '/solve',
  wrap(async (req, res) => {
    res.json(await runSolve(req.body || {}));
  })
);

api.post(
  '/diagnose',
  wrap(async (req, res) => {
    const cfg = mergeConfig({ ...loadConfig(), ...(req.body || {}) });
    const { result } = await runWorker(store.getData(), cfg, 'diagnose', { probeSeconds: 4 });
    res.json(result);
  })
);

api.post(
  '/solve/best',
  wrap(async (req, res) => {
    res.json(await runBest(req.body || {}));
  })
);

api.get('/stats', (_req, res) => {
  const tt = store.getTimetable();
  const ctx = context();
  res.json(timetableStats(tt?.rows || [], ctx));
});

// --- Public & Share ---
api.get('/public/info', (_req, res) => {
  const cfg = loadConfig();
  const tt = store.getTimetable();
  res.json({
    enabled: Boolean(cfg.document.publicEnabled),
    college: cfg.document.college,
    semester: cfg.document.semester,
    year: cfg.document.year,
    hasTimetable: Boolean(tt?.rows?.length),
  });
});

function requirePublicEnabled(_req, res, next) {
  if (!loadConfig().document.publicEnabled) {
    return res.status(403).json({ message: 'ผู้ดูแลระบบปิดการเผยแพร่ตารางสาธารณะ' });
  }
  return next();
}

api.get('/public/entities', requirePublicEnabled, (_req, res) => {
  const ctx = context();
  res.json({
    group: entitiesFor('group', ctx),
    teacher: entitiesFor('teacher', ctx),
    room: entitiesFor('room', ctx),
  });
});

api.get('/public/grid', requirePublicEnabled, (req, res) => {
  const view = VIEWS.includes(req.query.view) ? req.query.view : 'group';
  const tt = store.getTimetable();
  if (!tt?.rows?.length) return res.status(404).json({ message: 'ยังไม่มีตารางเรียน' });
  const ctx = context();
  const list = entitiesFor(view, ctx);
  const entity = list.find((e) => e.id === req.query.id) || list[0];
  if (!entity) return res.status(404).json({ message: 'ไม่พบข้อมูล' });
  res.json({ entity, ...buildGrid(view, entity.id, tt.rows, ctx), updatedAt: tt.meta?.updatedAt });
});

function buildShareUrl(req, view, id) {
  const cfg = loadConfig();
  const base = (cfg.document.publicBaseUrl || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return {
    base,
    enabled: Boolean(cfg.document.publicEnabled),
    url: `${base}/p/${encodeURIComponent(view)}/${encodeURIComponent(id)}`,
  };
}

api.get(
  '/public/qr',
  requirePublicEnabled,
  wrap(async (req, res) => {
    const view = VIEWS.includes(req.query.view) ? req.query.view : 'group';
    const id = String(req.query.id || 'G01');
    const { url } = buildShareUrl(req, view, id);
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1 });
    res.type('image/svg+xml').send(svg);
  })
);

api.get('/share', (req, res) => {
  const view = VIEWS.includes(req.query.view) ? req.query.view : 'group';
  const id = String(req.query.id || 'G01');
  res.json(buildShareUrl(req, view, id));
});

// --- Timetable ---
api.get('/timetable', (_req, res) => {
  const tt = store.getTimetable();
  if (!tt) return res.json({ rows: [], meta: null, validation: null });
  const cfg = loadConfig();
  const validation = validate(tt.rows, store.getData(), cfg);
  res.json({ rows: tt.rows, meta: tt.meta, validation });
});

api.put('/timetable', (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const cfg = loadConfig();
  const cur = store.getTimetable();
  const validation = validate(rows, store.getData(), cfg);
  const saved = store.setTimetable(rows, {
    ...(cur?.meta || {}),
    validationPassed: validation.passed,
    source: 'manual',
  });
  res.json({ rows: saved.rows, meta: saved.meta, validation });
});

api.post('/timetable/validate', (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : store.getTimetable()?.rows || [];
  res.json(validate(rows, store.getData(), loadConfig()));
});

api.post('/timetable/move', (req, res) => {
  const tt = store.getTimetable();
  if (!tt?.rows?.length) throw store.httpError(404, 'ยังไม่มีตารางเรียน');
  const ctx = context();
  const nextRows = moveSpan(tt.rows, ctx, req.body || {});
  const validation = validate(nextRows, store.getData(), loadConfig(), ctx);
  const saved = store.setTimetable(nextRows, {
    ...(tt.meta || {}),
    validationPassed: validation.passed,
    source: 'manual',
  });
  res.json({ rows: saved.rows, meta: saved.meta, validation });
});

api.post('/timetable/edit', (req, res) => {
  const tt = store.getTimetable();
  if (!tt?.rows?.length) throw store.httpError(404, 'ยังไม่มีตารางเรียน');
  const ctx = context();
  const nextRows = editSpan(tt.rows, ctx, req.body || {});
  const validation = validate(nextRows, store.getData(), loadConfig(), ctx);
  const saved = store.setTimetable(nextRows, {
    ...(tt.meta || {}),
    validationPassed: validation.passed,
    source: 'manual',
  });
  res.json({ rows: saved.rows, meta: saved.meta, validation });
});

api.get('/timetable/entities', (_req, res) => {
  const ctx = context();
  res.json({
    group: entitiesFor('group', ctx),
    teacher: entitiesFor('teacher', ctx),
    room: entitiesFor('room', ctx),
  });
});

api.get('/timetable/grid', (req, res) => {
  const view = VIEWS.includes(req.query.view) ? req.query.view : 'group';
  const tt = store.getTimetable();
  const ctx = context();
  const list = entitiesFor(view, ctx);
  const entity = list.find((e) => e.id === req.query.id) || list[0];
  if (!entity) throw store.httpError(404, 'ไม่พบข้อมูล');
  res.json({ entity, ...buildGrid(view, entity.id, tt?.rows || [], ctx) });
});

api.get('/timetable/grids', (req, res) => {
  const view = VIEWS.includes(req.query.view) ? req.query.view : 'group';
  const tt = store.getTimetable();
  const ctx = context();
  const list = entitiesFor(view, ctx);
  res.json({
    grids: list.map((entity) => ({ entity, ...buildGrid(view, entity.id, tt?.rows || [], ctx) })),
  });
});

api.get('/document', (_req, res) => {
  res.json(loadConfig().document);
});

// --- Export ---
function requireTimetableRows() {
  const tt = store.getTimetable();
  if (!tt?.rows?.length) throw store.httpError(404, 'ยังไม่มีตารางเรียน กรุณากดจัดตารางก่อน');
  return tt.rows;
}

api.get('/export/csv', (_req, res) => {
  const rows = requireTimetableRows();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="output.csv"');
  res.send(exportCsv(rows));
});

api.get(
  '/export/xlsx',
  wrap(async (req, res) => {
    const rows = requireTimetableRows();
    const view = req.query.view || 'all';
    const id = req.query.id || '';
    const buf = await exportXlsx(rows, context(), { view, id });
    const suffix = id ? `${view}-${id}` : view;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="timetable-${suffix}.xlsx"`);
    res.send(buf);
  })
);

api.get(
  '/export/pdf',
  wrap(async (req, res) => {
    const rows = requireTimetableRows();
    const view = req.query.view || 'group';
    const id = req.query.id || '';
    const inline = Boolean(req.query.inline);
    const buf = await exportPdf(rows, context(), { view, id });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="timetable-${view}${id ? `-${id}` : ''}.pdf"`
    );
    res.send(buf);
  })
);

api.get(
  '/export/qr-pdf',
  wrap(async (req, res) => {
    const view = VIEWS.includes(req.query.view) ? req.query.view : 'group';
    const inline = Boolean(req.query.inline);
    const ctx = context();
    const entities = entitiesFor(view, ctx);
    const items = await Promise.all(
      entities.map(async (e) => {
        const { url } = buildShareUrl(req, view, e.id);
        const qrPng = await QRCode.toBuffer(url, { type: 'png', width: 220, margin: 1 });
        return { id: e.id, title: e.title, url, qrPng };
      })
    );
    const buf = await exportQrPdf(items, ctx);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="qr-${view}.pdf"`);
    res.send(buf);
  })
);

export default api;
