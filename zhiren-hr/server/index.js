import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, PORT, HOST, DEMO } from './config.js';
import * as db from './db.js';
import { initAI, aiStatus, aiRateLimited, validateTask, streamTask } from './ai.js';
import { seedIfEmpty, reseed } from './seed.js';
import { successionNominationError } from './succession-validation.js';
import { buildRetentionPlan } from '../public/js/engine/retention.js';
import { MODELS } from '../public/js/engine/diagnosis.js';
import { validationErrors } from '../public/js/engine/validation.js';
import { buildSurveyResults } from './survey-results.js';
import { createAuth, AccessError } from './auth.js';
import { readDocuments, authorizeWrite, publicSurvey } from './access.js';
import { previewEmployees, saveEmployees } from './employee-import.js';

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
const MAX_DISCARDED_BODY = 16_000_000;
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

function readJson(req, { allowArray = false, maxBody = MAX_BODY } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size <= maxBody) return chunks.push(c);
      // Read to the end without storing it, so the client can receive the 413: closing the
      // connection mid-upload looks like a network failure. Only a huge upload is cut off.
      chunks.length = 0;
      if (size > MAX_DISCARDED_BODY) {
        reject(new HttpError(413, 'Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (size > maxBody) return reject(new HttpError(413, 'Request body too large'));
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

function cleanPatch(body) {
  const { id, createdAt, updatedAt, ...rest } = body;
  return rest;
}

function validateDocument(col, data) {
  const errors = validationErrors(col, data, (collection, id) => db.get(collection, id));
  if (errors.length) throw new HttpError(400, errors.join('; '));
}

// Survey responses arrive from anyone with the link, so they are validated strictly.
function validateResponse(body) {
  const survey = db.get('surveys', String(body.surveyId || ''));
  if (!survey) throw new HttpError(400, 'Survey not found');
  if (survey.status !== 'open') throw new HttpError(400, 'This survey is closed');
  const questions = new Set(MODELS[survey.model].dims.flatMap((dim) => dim.items.map((item) => item.id)));
  const answers = {};
  for (const [k, v] of Object.entries(body.answers || {})) {
    if (questions.has(k) && Number.isInteger(v) && v >= 1 && v <= 5) answers[k] = v;
  }
  if (!Object.keys(answers).length) throw new HttpError(400, 'Please answer at least one question');
  const out = { surveyId: survey.id, answers };
  if (body.deptId && db.get('departments', String(body.deptId))) out.deptId = String(body.deptId);
  if (Number.isInteger(body.enps) && body.enps >= 0 && body.enps <= 10) out.enps = body.enps;
  if (body.comment && typeof body.comment === 'string') out.comment = body.comment.slice(0, 1000);
  return out;
}

// Older plans carry no name of their own, which left the activity feed showing a bare record id.
function activityDoc(col, doc) {
  if (col !== 'idps' || doc.name) return doc;
  const employee = db.get('employees', doc.employeeId);
  return employee ? { ...doc, name: employee.name, nameEn: employee.nameEn } : doc;
}

const hasActivePlan = (employeeId, exceptId) => db.list('idps', { employeeId }).some(p => p.mode !== 'retention' && p.status === 'active' && p.id !== exceptId);

function changeDetail(before, after) {
  for (const field of ['stage', 'status']) {
    if (before[field] !== undefined && before[field] !== after[field]) return { field, from: before[field], to: after[field] };
  }
  return null;
}

async function handleApi(req, res, url, auth) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const method = req.method;
  let body = {};
  if (method !== 'GET' && method !== 'HEAD') {
    auth.checkOrigin(req);
    // A JSON content type forces a CORS preflight, which blocks cross-site writes. Compare the media
    // type itself: "text/plain; x=application/json" is a simple request that skips the preflight.
    if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415, 'Requests must be sent as JSON.');
    const importing = parts.length === 2 && parts[0] === 'employees' && ['import-preview', 'import'].includes(parts[1]);
    body = await readJson(req, { maxBody: importing ? 2_100_000 : MAX_BODY });
  }
  if (parts.length === 2 && parts[0] === 'auth') {
    if (parts[1] === 'session' && method === 'GET') return sendJson(res, 200, auth.info(req));
    if (parts[1] === 'login' && method === 'POST') return sendJson(res, 200, await auth.login(req, res, body));
    if (parts[1] === 'logout' && method === 'POST') return sendJson(res, 200, auth.logout(req, res));
    throw new HttpError(404, 'Not found');
  }
  if (parts.length === 3 && parts[0] === 'public' && parts[1] === 'surveys' && method === 'GET') {
    const survey = db.get('surveys', parts[2]);
    if (!survey) throw new HttpError(404, 'Survey not found');
    return sendJson(res, 200, publicSurvey(survey, db.list('departments')));
  }

  if (parts[0] === 'meta' && method === 'GET') {
    return sendJson(res, 200, { ai: aiStatus(), demo: DEMO, version: '1.1.0', today: db.stamp().slice(0, 10) });
  }
  const user = auth.session(req);
  const publicResponse = parts.length === 1 && parts[0] === 'responses' && method === 'POST';
  if (auth.required && !user && !publicResponse) throw new HttpError(401, 'Please sign in.');
  const actor = publicResponse ? null : auth.actor(req);
  const requireHR = () => { if (auth.required && user?.role !== 'hr') throw new HttpError(403, 'HR access is required.'); };
  if (parts.length === 2 && parts[0] === 'employees' && ['import-preview', 'import'].includes(parts[1]) && method === 'POST') {
    requireHR();
    if (parts[1] === 'import-preview') return sendJson(res, 200, previewEmployees(body.csv));
    const result = saveEmployees(body.csv, actor);
    return sendJson(res, result.ok ? 201 : 409, result.ok ? result : { ...result, error: '导入未保存，请检查逐行错误并重新预览。 / Nothing saved; review row errors and preview again.' });
  }
  if (parts[0] === 'activity' && method === 'GET') {
    if (user && user.role !== 'hr') return sendJson(res, 200, []);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
    return sendJson(res, 200, db.recentActivity(limit).map(item => item.col === 'responses' ? { ...item, docId: null, label: null, labelEn: null } : item));
  }
  if (parts[0] === 'survey-results' && method === 'GET' && parts.length <= 2) {
    requireHR();
    if (url.search) throw new HttpError(400, 'Survey results do not support filters.');
    const survey = parts[1] && db.get('surveys', parts[1]);
    if (parts[1] && !survey) throw new HttpError(404, 'Survey not found');
    const results = (survey ? [survey] : db.list('surveys')).map(s => buildSurveyResults(s, db.list('responses', { surveyId: s.id })));
    return sendJson(res, 200, survey ? results[0] : results);
  }
  if (parts[0] === 'export' && method === 'GET') {
    requireHR();
    const out = {};
    for (const col of Object.keys(db.COLLECTIONS)) if (col !== 'responses') out[col] = db.list(col);
    out.surveyResults = db.list('surveys').map(s => buildSurveyResults(s, db.list('responses', { surveyId: s.id })));
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="zhiren-export-${db.stamp().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(out, null, 1));
  }
  if (parts[0] === 'admin' && parts[1] === 'reset' && method === 'POST') {
    requireHR();
    if (!DEMO) throw new HttpError(403, 'Demo reset is turned off (ZHIREN_DEMO=0).');
    reseed();
    return sendJson(res, 200, { ok: true });
  }
  if (parts[0] === 'ai' && parts[1] && method === 'POST') {
    requireHR();
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
  if (anonymous && (method === 'GET' || method === 'HEAD')) throw new HttpError(403, 'Raw survey responses are private. Use survey-results for anonymous aggregates.');
  if (!id) {
    if (method === 'GET') {
      // Filter only the visible projection: filtering raw ratings first leaks
      // hidden values via presence/absence in the response.
      const docs = readDocuments(col, db.list(col), user).filter(doc => [...url.searchParams].every(([key, value]) => Object.hasOwn(doc, key) && doc[key] !== null && typeof doc[key] !== 'object' && String(doc[key]) === value));
      return sendJson(res, 200, docs);
    }
    if (method === 'POST') {
      let data = col === 'responses' ? validateResponse(body) : cleanPatch(body);
      if (!anonymous) data = authorizeWrite(col, method, data, null, user);
      if (col === 'idps' && data.mode === 'retention') {
        const employee = db.get('employees', String(data.employeeId || ''));
        const plan = buildRetentionPlan(employee, db.stamp().slice(0, 10));
        if (!plan) throw new HttpError(400, 'Retention plans require an active high-risk key employee.');
        if (db.list('idps', { employeeId: employee.id }).some(p => p.mode === 'retention' && p.status === 'active')) throw new HttpError(409, 'An active retention plan already exists.');
        data = plan;
      }
      if (col === 'idps' && data.mode !== 'retention') {
        const employee = db.get('employees', String(data.employeeId || ''));
        if (employee?.status === 'left') throw new HttpError(400, 'Development plans require an active employee.');
        if (employee && data.status === 'active' && hasActivePlan(employee.id)) throw new HttpError(409, 'This employee already has an active development plan.');
      }
      if (col === 'succession') {
        const error = successionNominationError(data, null, (employeeId) => db.get('employees', employeeId), db.stamp().slice(0, 10));
        if (error) throw new HttpError(400, error);
      }
      if (!anonymous && actor && (auth.required || !data.createdBy)) data.createdBy = actor.id;
      if (!anonymous) validateDocument(col, data);
      const doc = db.insert(col, data);
      db.logActivity({ actor: anonymous ? null : actor, action: 'create', col, doc: anonymous ? { id: doc.id } : activityDoc(col, doc) });
      return sendJson(res, 201, anonymous ? { ok: true } : doc);
    }
    throw new HttpError(405, 'Method not allowed');
  }

  if (method === 'GET') {
    const doc = db.get(col, id);
    if (!doc) throw new HttpError(404, 'Not found');
    const visible = readDocuments(col, [doc], user)[0];
    if (!visible) throw new HttpError(404, 'Not found');
    return sendJson(res, 200, visible);
  }
  if (anonymous) throw new HttpError(405, 'Survey responses cannot be changed');
  if (method === 'PUT') {
    const existing = db.get(col, id);
    if (!existing) throw new HttpError(404, 'Not found');
    body = cleanPatch(body);
    if (col === 'idps') {
      // Plans are saved whole, so an edit based on an old copy would silently undo someone else's.
      const { expectedUpdatedAt, ...rest } = body;
      if (expectedUpdatedAt && expectedUpdatedAt !== existing.updatedAt) throw new HttpError(409, 'This plan was changed by someone else. Reload it and try again.');
      body = rest;
    }
    if (auth.required) delete body.createdBy;
    body = authorizeWrite(col, method, body, existing, user);
    if (col === 'idps') {
      const previous = db.get(col, id);
      if (previous && (previous.mode === 'retention' || body.mode === 'retention')) {
        if (previous.mode !== 'retention' || (body.mode && body.mode !== 'retention') || (body.employeeId && body.employeeId !== previous.employeeId)) throw new HttpError(400, 'Retention plan type and employee cannot be changed.');
        for (const key of ['baseline', 'startedAt', 'reviewDue']) delete body[key];
      } else if ((body.employeeId && body.employeeId !== previous.employeeId) || (body.mode && body.mode !== previous.mode)) {
        throw new HttpError(400, 'A development plan cannot be moved to another employee or plan type.');
      } else if (previous.mode !== 'retention' && body.status === 'active' && previous.status !== 'active' && hasActivePlan(previous.employeeId, id)) {
        throw new HttpError(409, 'This employee already has an active development plan.');
      }
    }
    if (col === 'succession') {
      const previous = db.get(col, id);
      if (!previous) throw new HttpError(404, 'Not found');
      const error = successionNominationError(body, previous, (employeeId) => db.get('employees', employeeId), db.stamp().slice(0, 10));
      if (error) throw new HttpError(400, error);
    }
    const patch = cleanPatch(body);
    validateDocument(col, { ...existing, ...patch });
    const result = db.update(col, id, patch);
    if (!result) throw new HttpError(404, 'Not found');
    db.logActivity({ actor, action: 'update', col, doc: activityDoc(col, result.after), detail: changeDetail(result.before, result.after) });
    return sendJson(res, 200, readDocuments(col, [result.after], user)[0]);
  }
  if (method === 'DELETE') {
    authorizeWrite(col, method, {}, db.get(col, id), user);
    const doc = db.remove(col, id);
    if (!doc) throw new HttpError(404, 'Not found');
    db.logActivity({ actor, action: 'delete', col, doc: activityDoc(col, doc) });
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
  if (rel.includes('\0')) throw new HttpError(400, 'Bad path');
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

export function createServer({ auth = createAuth() } = {}) {
  return http.createServer(async (req, res) => {
    let url = { pathname: '' };
    try {
      try { url = new URL(req.url, 'http://localhost'); }
      catch { throw new HttpError(400, 'Bad request URL'); }
      if (!hostAllowed(req)) throw new HttpError(421, 'Unknown host');
      if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) throw new HttpError(404, 'Not found');
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url, auth);
      else serveStatic(req, res, url.pathname);
    } catch (err) {
      if (res.headersSent) return res.destroy();
      if (err instanceof HttpError || err instanceof AccessError) {
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
