// A small JSON document store on top of node:sqlite.
// Each collection holds schemaless JSON documents; domain logic lives in the
// rule engines (public/js/engine), which the browser and the tests share.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from './config.js';

// Collection name -> id prefix.
export const COLLECTIONS = {
  departments: 'd',
  employees: 'e',
  positions: 'p',
  candidates: 'c',
  succession: 's',
  courses: 'k',
  enrollments: 'n',
  idps: 'i',
  surveys: 'v',
  responses: 'r',
  tickets: 't',
  kb: 'a',
  onboarding: 'o',
  raci: 'x',
};
// Survey answers are anonymous: never record who submitted them.
export const ANONYMOUS = new Set(['responses']);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS docs (
  col TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (col, id)
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  actor_name_en TEXT,
  action TEXT NOT NULL,
  col TEXT NOT NULL,
  doc_id TEXT,
  label TEXT,
  label_en TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS activity_at ON activity(at);
`;

let db;
export function open() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  // busy_timeout lets the MCP stdio process and the web server share the file safely.
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}
export function close() {
  db?.close();
  db = undefined;
}

const pad = (n) => String(n).padStart(2, '0');
// Local wall-clock time; the UI compares dates against the local calendar day.
export const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const newId = (col) => `${COLLECTIONS[col]}${crypto.randomBytes(5).toString('hex')}`;

const FIELD = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;

// Lists a collection, optionally filtered by top-level field equality.
export function list(col, filters = {}) {
  const where = ['col = ?'];
  const params = [col];
  for (const [k, v] of Object.entries(filters)) {
    if (!FIELD.test(k)) continue;
    where.push(`json_extract(data, '$.${k}') = ?`);
    params.push(v);
  }
  return open().prepare(`SELECT data FROM docs WHERE ${where.join(' AND ')} ORDER BY created_at, id`).all(...params).map((r) => JSON.parse(r.data));
}

export function get(col, id) {
  const row = open().prepare('SELECT data FROM docs WHERE col = ? AND id = ?').get(col, id);
  return row ? JSON.parse(row.data) : null;
}

export function count(col) {
  return open().prepare('SELECT COUNT(*) AS n FROM docs WHERE col = ?').get(col).n;
}

export function insert(col, doc) {
  const now = stamp();
  const full = { ...doc, id: doc.id || newId(col), createdAt: doc.createdAt || now, updatedAt: now };
  open().prepare('INSERT INTO docs (col, id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(col, full.id, JSON.stringify(full), full.createdAt, now);
  return full;
}

// Shallow merge: top-level keys in `patch` replace the stored values.
export function update(col, id, patch) {
  const current = get(col, id);
  if (!current) return null;
  const now = stamp();
  const next = { ...current, ...patch, id, createdAt: current.createdAt, updatedAt: now };
  open().prepare('UPDATE docs SET data = ?, updated_at = ? WHERE col = ? AND id = ?').run(JSON.stringify(next), now, col, id);
  return { before: current, after: next };
}

export function remove(col, id) {
  const current = get(col, id);
  if (!current) return null;
  open().prepare('DELETE FROM docs WHERE col = ? AND id = ?').run(col, id);
  return current;
}

export function insertMany(col, docs) {
  const d = open();
  d.exec('BEGIN');
  try {
    for (const doc of docs) insert(col, doc);
    d.exec('COMMIT');
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

export function wipe() {
  open().exec('DELETE FROM docs; DELETE FROM activity;');
}

export function logActivity({ at = stamp(), actor, action, col, doc, detail }) {
  open().prepare(`INSERT INTO activity (at, actor_id, actor_name, actor_name_en, action, col, doc_id, label, label_en, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    at, actor?.id ?? null, actor?.name ?? null, actor?.nameEn ?? null, action, col, doc?.id ?? null,
    labelOf(doc), labelOf(doc, true), detail ? JSON.stringify(detail) : null,
  );
}

export function recentActivity(limit = 30) {
  return open().prepare('SELECT * FROM activity ORDER BY at DESC, id DESC LIMIT ?').all(limit).map((r) => ({
    id: r.id, at: r.at, action: r.action, col: r.col, docId: r.doc_id, label: r.label, labelEn: r.label_en,
    actor: r.actor_id ? { id: r.actor_id, name: r.actor_name, nameEn: r.actor_name_en } : null,
    detail: r.detail ? JSON.parse(r.detail) : null,
  }));
}

function labelOf(doc, en = false) {
  if (!doc) return null;
  const pick = (k) => (en && doc[`${k}En`]) || doc[k];
  return String(pick('title') || pick('name') || doc.id || '').slice(0, 120);
}
