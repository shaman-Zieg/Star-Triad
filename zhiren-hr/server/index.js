import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, PORT, HOST, DEMO } from './config.js';
import * as db from './db.js';
import { initAI, aiStatus, aiRateLimited, validateTask, streamTask } from './ai.js';
import { seedIfEmpty, reseed } from './seed.js';
import { successionNominationError } from './succession-validation.js';

const PUBLIC_DIR = path.join(ROOT, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};
const LOOPBACK = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
const MAX_BODY = 1_000_000;
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readJson(req, { allowArray = false } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Request body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || (Array.isArray(parsed) && !allowArray)) throw new Error('not an object');
        resolve(parsed);
      } catch {
        reject(new HttpError(400, 'Malformed JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// The acting user is chosen in the UI and only used for attribution (activity
// feed, comments). There is no sign-in: run this on a trusted network.
function actorOf(req) {
  const id = String(req.headers['x-actor'] || '');
  if (!/^[a-z0-9]{1,24}$/i.test(id)) return null;
  const emp = db.get('employees', id);
  return emp ? { id: emp.id, name: emp.name, nameEn: emp.nameEn } : null;
}

function cleanPatch(body) {
  const { id, createdAt, updatedAt, ...rest } = body;
  return rest;
}

// Survey responses arrive from anyone with the link, so they are validated strictly.
function validateResponse(body) {
  const survey = db.get('surveys', String(body.surveyId || ''));
  if (!survey) throw new HttpError(400, 'Survey not found');
  if (survey.status !== 'open') throw new HttpError(400, 'This survey is closed');
  const answers = {};
  for (const [k, v] of Object.entries(body.answers || {})) {
    if (!/^[a-z0-9_]{1,24}$/i.test(k)) continue;
    const n = Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 5) answers[k] = n;
  }
  if (!Object.keys(answers).length) throw new HttpError(400, 'Please answer at least one question');
  const out = { surveyId: survey.id, answers };
  if (body.deptId && db.get('departments', String(body.deptId))) out.deptId = String(body.deptId);
  const enps = Number(body.enps);
  if (body.enps !== undefined && body.enps !== null && body.enps !== '' && Number.isInteger(enps) && enps >= 0 && enps <= 10) out.enps = enps;
  if (body.comment) out.comment = String(body.comment).slice(0, 1000);
  return out;
}

function changeDetail(before, after) {
  for (const field of ['stage', 'status']) {
    if (before[field] !== undefined && before[field] !== after[field]) return { field, from: before[field], to: after[field] };
  }
  return null;
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const method = req.method;
  let body = {};
  if (method !== 'GET' && method !== 'HEAD') {
    // A JSON content type forces a CORS preflight, which blocks cross-site writes.
    if (!String(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, 'Requests must be sent as JSON.');
    body = await readJson(req);
  }
  const actor = actorOf(req);

  if (parts[0] === 'meta' && method === 'GET') {
    return sendJson(res, 200, { ai: aiStatus(), demo: DEMO, version: '1.1.0', today: db.stamp().slice(0, 10) });
  }
  if (parts[0] === 'activity' && method === 'GET') {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
    return sendJson(res, 200, db.recentActivity(limit));
  }
  if (parts[0] === 'export' && method === 'GET') {
    const out = {};
    for (const col of Object.keys(db.COLLECTIONS)) out[col] = db.list(col);
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="zhiren-export-${db.stamp().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(out, null, 1));
  }
  if (parts[0] === 'admin' && parts[1] === 'reset' && method === 'POST') {
    if (!DEMO) throw new HttpError(403, 'Demo reset is turned off (ZHIREN_DEMO=0).');
    reseed();
    return sendJson(res, 200, { ok: true });
  }
  if (parts[0] === 'ai' && parts[1] && method === 'POST') {
    if (!aiStatus().enabled) throw new HttpError(503, 'AI assistance is not configured on this server.');
    const lang = body.lang === 'en' ? 'en' : 'zh';
    const { built, error } = validateTask(parts[1], body.input, lang);
    if (error) throw new HttpError(400, error);
    if (aiRateLimited()) throw new HttpError(429, 'Too many AI requests. Wait a minute and try again.');
    return streamTask(built, res, SECURITY_HEADERS);
  }

  const col = parts[0];
  if (!col || !Object.hasOwn(db.COLLECTIONS, col) || parts.length > 2) throw new HttpError(404, 'Not found');
  const id = parts[1];
  const anonymous = db.ANONYMOUS.has(col);
  if (!id) {
    if (method === 'GET') return sendJson(res, 200, db.list(col, Object.fromEntries(url.searchParams)));
    if (method === 'POST') {
      const data = col === 'responses' ? validateResponse(body) : cleanPatch(body);
      if (col === 'succession') {
        const error = successionNominationError(data, null, (employeeId) => db.get('employees', employeeId), db.stamp().slice(0, 10));
        if (error) throw new HttpError(400, error);
      }
      if (!anonymous && actor && !data.createdBy) data.createdBy = actor.id;
      const doc = db.insert(col, data);
      db.logActivity({ actor: anonymous ? null : actor, action: 'create', col, doc: anonymous ? { id: doc.id } : doc });
      return sendJson(res, 201, doc);
    }
    throw new HttpError(405, 'Method not allowed');
  }

  if (method === 'GET') {
    const doc = db.get(col, id);
    if (!doc) throw new HttpError(404, 'Not found');
    return sendJson(res, 200, doc);
  }
  if (anonymous) throw new HttpError(405, 'Survey responses cannot be changed');
  if (method === 'PUT') {
    if (col === 'succession') {
      const previous = db.get(col, id);
      if (!previous) throw new HttpError(404, 'Not found');
      const error = successionNominationError(body, previous, (employeeId) => db.get('employees', employeeId), db.stamp().slice(0, 10));
      if (error) throw new HttpError(400, error);
    }
    const result = db.update(col, id, cleanPatch(body));
    if (!result) throw new HttpError(404, 'Not found');
    db.logActivity({ actor, action: 'update', col, doc: result.after, detail: changeDetail(result.before, result.after) });
    return sendJson(res, 200, result.after);
  }
  if (method === 'DELETE') {
    const doc = db.remove(col, id);
    if (!doc) throw new HttpError(404, 'Not found');
    db.logActivity({ actor, action: 'delete', col, doc });
    return sendJson(res, 200, { ok: true });
  }
  throw new HttpError(405, 'Method not allowed');
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'Bad path');
  }
  let file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(403, 'Forbidden');
  let stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat || stat.isDirectory()) {
    if (path.extname(rel)) throw new HttpError(404, 'Not found');
    file = path.join(PUBLIC_DIR, 'index.html');
    stat = fs.statSync(file);
  }
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const lastModified = stat.mtime.toUTCString();
  const headers = { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-cache', 'Last-Modified': lastModified };
  if (req.headers['if-modified-since'] === lastModified) {
    res.writeHead(304, headers);
    return res.end();
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

// When bound to loopback, refuse other Host names (blocks DNS-rebinding attacks).
function hostAllowed(req) {
  if (!LOOPBACK) return true;
  const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (!hostAllowed(req)) throw new HttpError(421, 'Unknown host');
      if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) throw new HttpError(404, 'Not found');
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else serveStatic(req, res, url.pathname);
    } catch (err) {
      if (res.headersSent) return res.destroy();
      if (err instanceof HttpError) {
        if (url.pathname.startsWith('/api/') || url.pathname === '/mcp') sendJson(res, err.status, { error: err.message });
        else {
          res.writeHead(err.status, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(err.message);
        }
      } else {
        console.error(`[${new Date().toISOString()}] ${req.method} ${url.pathname}`, err);
        sendJson(res, 500, { error: 'Something went wrong on our side. Please try again.' });
      }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  db.open();
  if (seedIfEmpty()) console.log('Seeded a fresh demo database.');
  await initAI();
  const ai = aiStatus();
  createServer().listen(PORT, HOST, () => {
    console.log(`Zhiren HR is running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(ai.enabled ? `AI assistance: on (${ai.model})` : `AI assistance: off (${ai.reason}) - rule engines only`);
  });
}
