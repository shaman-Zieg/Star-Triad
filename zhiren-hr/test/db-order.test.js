import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiren-order-'));
process.env.ZHIREN_DB_PATH = path.join(dir, 'test.db');
let db;
before(async () => { db = await import('../server/db.js'); db.open(); });
after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('records created in the same second keep the order they were added', () => {
  const at = '2026-10-21 09:00:00';
  const names = Array.from({ length: 40 }, (_, i) => `k${i}`);
  // Random ids would sort differently from insertion order nearly every time.
  for (const title of names) db.insert('kb', { title, createdAt: at });
  assert.deepEqual(db.list('kb').map((a) => a.title), names);
});
