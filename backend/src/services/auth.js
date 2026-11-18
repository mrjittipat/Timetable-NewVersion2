import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';
import { httpError } from './store.js';

export const ROLES = ['admin', 'teacher', 'viewer'];
export const DEFAULT_ADMIN = { username: 'admin', password: 'admin1234' };
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

let users = [];
const sessions = new Map();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  if (!user?.salt || !user?.hash) return false;
  const computed = crypto.scryptSync(String(password), user.salt, 64);
  const stored = Buffer.from(user.hash, 'hex');
  return computed.length === stored.length && crypto.timingSafeEqual(computed, stored);
}

function saveUsers() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf8');
}

export function publicUser(u) {
  if (!u) return null;
  return {
    username: u.username,
    name: u.name,
    role: u.role,
    teacher_id: u.teacher_id || '',
    avatar: u.avatar || '',
    mustChangePassword: Boolean(u.mustChangePassword),
  };
}

export function initAuth() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(USERS_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
      users = Array.isArray(parsed) ? parsed : [];
    } catch {
      users = [];
    }
  } else {
    users = [];
  }
  if (!users.some((u) => u.role === 'admin')) {
    const { salt, hash } = hashPassword(DEFAULT_ADMIN.password);
    users.unshift({
      username: DEFAULT_ADMIN.username,
      name: 'ผู้ดูแลระบบ',
      role: 'admin',
      teacher_id: '',
      avatar: '',
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
      salt,
      hash,
    });
    saveUsers();
  }
}

function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function getSessionUser(req) {
  const token = parseCookies(req).tt_session;
  if (!token) return null;
  const sess = sessions.get(token);
  if (!sess) return null;
  if (sess.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = users.find((u) => u.username === sess.username);
  if (!user) {
    sessions.delete(token);
    return null;
  }
  return { token, user };
}

export function defaultAdminActive() {
  const admin = users.find((u) => u.username === DEFAULT_ADMIN.username);
  return Boolean(admin && verifyPassword(DEFAULT_ADMIN.password, admin));
}

export function login(username, password) {
  const uname = String(username || '').trim();
  const user = users.find((u) => u.username === uname);
  if (!user || !verifyPassword(password, user)) {
    throw httpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username: user.username, expires: Date.now() + SESSION_TTL_MS });
  return {
    token,
    cookie: `tt_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
    user: publicUser(user),
  };
}

export function logout(req) {
  const token = parseCookies(req).tt_session;
  if (token) sessions.delete(token);
  return 'tt_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
}

function dropUserSessions(username) {
  for (const [token, s] of sessions) {
    if (s.username === username) sessions.delete(token);
  }
}

export function listUsers() {
  return users.map((u) => ({ ...publicUser(u), createdAt: u.createdAt }));
}

export function createUser({ username, password, name, role = 'viewer', teacher_id = '' }) {
  const uname = String(username || '').trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(uname)) {
    throw httpError(400, 'ชื่อผู้ใช้ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือ . _ - ความยาว 3–32 ตัว');
  }
  if (users.some((u) => u.username === uname)) {
    throw httpError(409, `มีชื่อผู้ใช้ ${uname} อยู่แล้ว`);
  }
  const pw = String(password || '');
  if (pw.length < 6) throw httpError(400, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
  const displayName = String(name || '').trim();
  if (!displayName) throw httpError(400, 'กรุณาระบุชื่อที่แสดง');
  if (!ROLES.includes(role)) throw httpError(400, 'สิทธิ์ผู้ใช้ไม่ถูกต้อง');

  const { salt, hash } = hashPassword(pw);
  const created = {
    username: uname,
    name: displayName.slice(0, 80),
    role,
    teacher_id: String(teacher_id || '').trim(),
    avatar: '',
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
    salt,
    hash,
  };
  users.push(created);
  saveUsers();
  return publicUser(created);
}

export function updateUser(targetUsername, { name, role, teacher_id, password }, actorUsername) {
  const idx = users.findIndex((u) => u.username === targetUsername);
  if (idx === -1) throw httpError(404, `ไม่พบผู้ใช้ ${targetUsername}`);
  const cur = users[idx];
  const next = { ...cur };

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) throw httpError(400, 'กรุณาระบุชื่อที่แสดง');
    next.name = trimmed.slice(0, 80);
  }
  if (role !== undefined) {
    if (!ROLES.includes(role)) throw httpError(400, 'สิทธิ์ผู้ใช้ไม่ถูกต้อง');
    if (cur.role === 'admin' && role !== 'admin') {
      const adminCount = users.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) throw httpError(400, 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 บัญชี');
    }
    next.role = role;
  }
  if (teacher_id !== undefined) next.teacher_id = String(teacher_id || '').trim();
  if (password !== undefined && String(password) !== '') {
    const pw = String(password);
    if (pw.length < 6) throw httpError(400, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
    const { salt, hash } = hashPassword(pw);
    next.salt = salt;
    next.hash = hash;
    next.mustChangePassword = true;
    dropUserSessions(cur.username);
  }

  users[idx] = next;
  saveUsers();
  if (next.username === actorUsername && next.role !== 'admin') dropUserSessions(actorUsername);
  return publicUser(next);
}

export function deleteUser(targetUsername, actorUsername) {
  if (targetUsername === actorUsername) {
    throw httpError(400, 'ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้');
  }
  const idx = users.findIndex((u) => u.username === targetUsername);
  if (idx === -1) throw httpError(404, `ไม่พบผู้ใช้ ${targetUsername}`);
  if (users[idx].role === 'admin' && users.filter((u) => u.role === 'admin').length <= 1) {
    throw httpError(400, 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 บัญชี');
  }
  users.splice(idx, 1);
  dropUserSessions(targetUsername);
  saveUsers();
  return true;
}

export function changeOwnPassword(username, currentPassword, nextPassword) {
  const idx = users.findIndex((u) => u.username === username);
  if (idx === -1) throw httpError(404, 'ไม่พบผู้ใช้');
  const cur = users[idx];
  if (!verifyPassword(currentPassword, cur)) {
    throw httpError(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
  }
  const nextPw = String(nextPassword || '');
  if (nextPw.length < 6) throw httpError(400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
  if (nextPw === String(currentPassword)) {
    throw httpError(400, 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
  }
  const { salt, hash } = hashPassword(nextPw);
  users[idx] = { ...cur, salt, hash, mustChangePassword: false };
  saveUsers();
  return publicUser(users[idx]);
}

export function updateProfile(username, { name, avatar }) {
  const idx = users.findIndex((u) => u.username === username);
  if (idx === -1) throw httpError(404, 'ไม่พบผู้ใช้');
  const cur = users[idx];
  const next = { ...cur };

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed || trimmed.length > 80) {
      throw httpError(400, 'ชื่อที่แสดงต้องมี 1–80 ตัวอักษร');
    }
    next.name = trimmed;
  }
  if (avatar !== undefined) {
    const av = String(avatar || '');
    if (av !== '') {
      const match = av.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match || Buffer.from(match[2], 'base64').length > 200 * 1024) {
        throw httpError(400, 'รูปโปรไฟล์ต้องเป็น PNG, JPEG หรือ WebP ขนาดไม่เกิน 200 KB');
      }
    }
    next.avatar = av;
  }

  users[idx] = next;
  saveUsers();
  return publicUser(next);
}

export function guard(req, res, next) {
  const p = req.path;
  if (
    p === '/health' ||
    p === '/auth/login' ||
    p === '/auth/logout' ||
    p === '/auth/me' ||
    p.startsWith('/public/')
  ) {
    return next();
  }
  const sess = getSessionUser(req);
  if (!sess) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบ' });
  req.user = sess.user;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const selfAllowed = p === '/auth/password' || p === '/auth/profile' || p === '/chat';
    if (!selfAllowed && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'บัญชีนี้ดูข้อมูลได้อย่างเดียว เฉพาะผู้ดูแลระบบที่แก้ไขได้' });
    }
  }
  return next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'เฉพาะผู้ดูแลระบบ' });
  }
  return next();
}
