import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { ROOT, HOST } from './config.js';
import * as db from './db.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'zhiren_session';
const ROLES = new Set(['hr', 'manager', 'employee']);
export class AccessError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const authFile = () => process.env.ZHIREN_USERS_FILE || path.join(ROOT, 'data', 'users.json');
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Use a password of 12–256 characters.');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export function validateUsers(users) {
  const names = new Set();
  if (!Array.isArray(users) || !users.length || users.length > 10000) throw new Error('Account file must contain an array of users.');
  for (const u of users) {
    if (!u || !/^[a-zA-Z0-9_.-]{1,64}$/.test(u.username || '') || names.has(u.username) || !ROLES.has(u.role)
      || !/^[a-z0-9]{1,24}$/i.test(u.employeeId || '') || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(u.passwordHash || '')) throw new Error('Invalid or duplicate account in account file.');
    names.add(u.username);
  }
  if (!users.some(u => u.role === 'hr')) throw new Error('Configure at least one HR account.');
  return users;
}

// Accounts are kept outside the document API and exports. Restarting invalidates
// all sessions and applies account changes; no plaintext password is persisted.
export function createAuth({ required = !['127.0.0.1', 'localhost', '::1'].includes(HOST), usersFile = authFile(), users,
  getEmployee = id => db.get('employees', id), now = Date.now, ttl = 8 * 60 * 60 * 1000, secure = process.env.ZHIREN_COOKIE_SECURE === '1' } = {}) {
  const accounts = required ? validateUsers(users || (() => {
    try { return JSON.parse(fs.readFileSync(usersFile, 'utf8')); }
    catch { throw new Error('LAN login requires an account file. Run node scripts/manage-users.mjs first; see README.'); }
  })()) : [];
  const sessions = new Map();
  const attempts = new Map();
  const tokenOf = req => String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const publicUser = u => ({ username: u.username, role: u.role, employeeId: u.employeeId });
  const live = u => { const e = getEmployee(u.employeeId); return e && e.status !== 'left'; };
  if (required && !accounts.some(u => u.role === 'hr' && live(u))) throw new Error('Configure an HR account linked to an active employee.');
  const cookie = (token, age) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  function prune() {
    const t = now();
    for (const [key, value] of sessions) if (value.expires <= t) sessions.delete(key);
    for (const [key, value] of attempts) if (value.until <= t) attempts.delete(key);
  }
  function session(req) {
    if (!required) return null;
    prune();
    const token = tokenOf(req);
    const entry = sessions.get(token);
    if (!entry) return null;
    if (!live(entry.user)) { sessions.delete(token); return null; }
    return publicUser(entry.user);
  }
  function checkOrigin(req) {
    if (!required) return;
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new AccessError(403, 'Cross-site writes are not allowed.');
    if (req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { throw new AccessError(403, 'Invalid request origin.'); }
      if (!['http:', 'https:'].includes(origin.protocol) || origin.host.toLowerCase() !== String(req.headers.host || '').toLowerCase()
        || (secure && origin.protocol !== 'https:')) throw new AccessError(403, 'Cross-origin writes are not allowed.');
    }
  }
  async function login(req, res, body) {
    if (!required) throw new AccessError(400, 'Login is not needed in local mode.');
    checkOrigin(req);
    prune();
    const key = req.socket?.remoteAddress || 'unknown';
    const attempt = attempts.get(key) || { count: 0, until: now() + 60_000 };
    if (attempt.count >= 10 || attempts.size >= 10000 || sessions.size >= 10000) throw new AccessError(429, 'Too many login attempts. Try again in a minute.');
    attempt.count++;
    attempts.set(key, attempt);
    const user = accounts.find(u => u.username === body.username);
    const validPassword = typeof body.password === 'string' && body.password.length >= 12 && body.password.length <= 256;
    // Equal-cost work for unknown accounts prevents username enumeration by time.
    const [, salt, expected] = (user?.passwordHash || `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
    const actual = await scrypt(validPassword ? body.password : '', salt, 64);
    if (!validPassword || !crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex')) || !user || !live(user)) throw new AccessError(401, 'Incorrect username or password.');
    sessions.delete(tokenOf(req));
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { user, expires: now() + ttl });
    res.setHeader('Set-Cookie', cookie(token, Math.floor(ttl / 1000)));
    return { required, user: publicUser(user) };
  }
  function logout(req, res) {
    checkOrigin(req);
    sessions.delete(tokenOf(req));
    res.setHeader('Set-Cookie', cookie('', 0));
    return { ok: true };
  }
  function actor(req) {
    const user = session(req);
    const id = required ? user?.employeeId : String(req.headers['x-actor'] || '');
    if (!/^[a-z0-9]{1,24}$/i.test(id || '')) return null;
    const emp = getEmployee(id);
    return emp ? { id: emp.id, name: emp.name, nameEn: emp.nameEn } : null;
  }
  return { required, session, actor, login, logout, checkOrigin, info: req => ({ required, user: session(req) }) };
}
