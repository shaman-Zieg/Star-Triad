import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodeEmployeeCSV, parseCSV, previewEmployees, MAX_IMPORT_BYTES, EMPLOYEE_CSV_TEMPLATE } from '../public/js/engine/employee-import.js';

const departments = [{ id: 'd1', name: '研发', nameEn: 'Engineering' }];
const employees = [{ id: 'e1', empNo: 'EMP1', email: 'boss@example.com', status: 'active' }];
const header = 'name,title,department,hireDate';
const good = `${header},empNo\n张三,工程师,研发,2026-10-01,NEW1`;

test('CSV parser handles BOM, commas, escaped quotes, multiline cells and physical line numbers', () => {
  const records = parseCSV('\uFEFFname,title\r\n"张三,青","Senior ""Engineer""\r\nDeveloper"\r\n王五,工程师\r\n');
  assert.deepEqual(records, [
    { line: 1, cells: ['name', 'title'] },
    { line: 2, cells: ['张三,青', 'Senior "Engineer"\nDeveloper'] },
    { line: 4, cells: ['王五', '工程师'] },
  ]);
  assert.throws(() => parseCSV('a\n"unfinished'), /Unclosed/);
  assert.throws(() => parseCSV('a\n"closed"oops'), /Malformed/);
  assert.throws(() => parseCSV('a\nun"quoted'), /Malformed/);
});

test('strict decoding recognizes UTF-8 BOM, falls back to GBK and rejects malformed bytes', () => {
  const utf8 = decodeEmployeeCSV(new TextEncoder().encode('\uFEFF姓名,职位'));
  assert.deepEqual(utf8, { csv: '姓名,职位', encoding: 'utf-8' });
  const gbk = new Uint8Array([0xd0, 0xd5, 0xc3, 0xfb]); // 姓名 in GBK.
  assert.deepEqual(decodeEmployeeCSV(gbk), { csv: '姓名', encoding: 'gbk' });
  assert.equal(decodeEmployeeCSV(gbk, 'gbk').csv, '姓名');
  assert.throws(() => decodeEmployeeCSV(gbk, 'utf-8'), /Invalid text encoding/);
  assert.throws(() => decodeEmployeeCSV(new Uint8Array([0xff])), /Invalid text encoding/);
  assert.throws(() => decodeEmployeeCSV(new Uint8Array(MAX_IMPORT_BYTES + 1)), /exceeds 1 MB/);
});

test('Chinese and English columns resolve references, convert scores and preserve missing assessments', () => {
  const csv = '姓名,职位,部门,入职日期,工号,邮箱,直属上级,绩效,潜力,技能\n张三,工程师,Engineering,2026-10-01,NEW1,new@example.com,EMP1,4,3,JavaScript；沟通';
  const result = previewEmployees(csv, employees, departments);
  assert.equal(result.valid, true);
  const doc = result.rows[0].employee;
  assert.equal(doc.deptId, 'd1');
  assert.equal(doc.managerId, 'e1');
  assert.equal(doc.performance, 4);
  assert.equal(doc.potential, 3);
  assert.equal(doc.engagement, null);
  assert.deepEqual(doc.skills, ['JavaScript', '沟通']);
  assert.equal(doc.level, 'P4');
  for (const manager of ['e1', 'BOSS@example.com']) assert.equal(previewEmployees(`${header},empNo,manager\n张三,工程师,研发,2026-10-01,NEW1,${manager}`, employees, departments).valid, true);
  assert.equal(previewEmployees(good, employees, departments).rows[0].employee.performance, null);
  assert.equal(previewEmployees(EMPLOYEE_CSV_TEMPLATE, employees, departments).valid, false);
});

test('headers, required fields, dates, scores and row widths are validated without silently coercing input', () => {
  for (const csv of [
    'name,title,department,empNo\n张三,工程师,研发,NEW1',
    `${header},empNo,unknown\n张三,工程师,研发,2026-10-01,NEW1,x`,
    `${header},empNo,姓名\n张三,工程师,研发,2026-10-01,NEW1,李四`,
    `${header},empNo\n,工程师,研发,2026-10-01,NEW1`,
    `${header},empNo\n张三,工程师,研发,2026-02-30,NEW1`,
    `${header},empNo,performance\n张三,工程师,研发,2026-10-01,NEW1,99`,
    `${header},empNo,performance\n张三,工程师,研发,2026-10-01,NEW1,0x4`,
    `${header},empNo\n张三,工程师,研发,2026-10-01,NEW1,extra`,
  ]) assert.equal(previewEmployees(csv, employees, departments).valid, false, csv);
});

test('ambiguous departments/managers and references to new rows are refused', () => {
  const duplicates = [...departments, { id: 'd2', name: '研发' }];
  assert.equal(previewEmployees(good, employees, duplicates).valid, false);
  assert.equal(previewEmployees(good.replace('研发', 'd1'), employees, duplicates).valid, true);
  const csv = `${header},empNo,manager\n张三,工程师,d1,2026-10-01,NEW1,boss@example.com`;
  assert.equal(previewEmployees(csv, [...employees, { id: 'e2', email: 'boss@example.com' }], departments).valid, false);
  assert.equal(previewEmployees(csv, [{ ...employees[0], status: 'left' }], departments).valid, false);
  assert.equal(previewEmployees(`${header},empNo,manager\n张三,工程师,d1,2026-10-01,NEW1,\n李四,工程师,d1,2026-10-01,NEW2,NEW1`, employees, departments).valid, false);
});

test('duplicate employee numbers and emails mark both file rows and conflict with current records', () => {
  const csv = `${header},empNo,email\n张三,工程师,d1,2026-10-01,NEW1,new@example.com\n李四,工程师,d1,2026-10-01,new1,NEW@example.com`;
  const result = previewEmployees(csv, employees, departments);
  assert.equal(result.valid, false);
  assert.ok(result.rows.every(row => row.errors.some(error => error.startsWith('empNo:')) && row.errors.some(error => error.startsWith('email:'))));
  assert.equal(previewEmployees(csv.replaceAll('NEW1', 'EMP1'), employees, departments).valid, false);
  assert.equal(previewEmployees(`${header},empNo,email\n张三,工程师,d1,2026-10-01,NEW1,boss@example.com`, employees, departments).valid, false);
});

test('every employee needs a stable employee number or email before import', () => {
  for (const csv of [
    `${header}\n张三,工程师,d1,2026-10-01`,
    `${header},empNo,email\n张三,工程师,d1,2026-10-01, , `,
  ]) {
    const preview = previewEmployees(csv, employees, departments);
    assert.equal(preview.valid, false);
    assert.match(preview.rows[0].errors.join(' '), /Employee number or email is required/);
  }
  assert.equal(previewEmployees(good, employees, departments).valid, true, 'employee number alone is sufficient');
  assert.equal(previewEmployees(`${header},email\n张三,工程师,d1,2026-10-01,new@example.com`, employees, departments).valid, true, 'email alone is sufficient');
});

test('500-row and byte limits apply to server-side parsing too', () => {
  const make = count => `${header},empNo\n${Array.from({ length: count }, (_, index) => `张三,工程师,d1,2026-10-01,NEW${index}`).join('\n')}`;
  assert.equal(previewEmployees(make(500), employees, departments).valid, true);
  assert.equal(previewEmployees(make(501), employees, departments).valid, false);
  assert.equal(previewEmployees('x'.repeat(MAX_IMPORT_BYTES + 1), employees, departments).valid, false);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiren-import-'));
process.env.ZHIREN_DB_PATH = path.join(dir, 'test.db');
let db;
after(() => { db?.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('preview does not save; confirmation rechecks current data and commits employee/activity atomically', async () => {
  db = await import('../server/db.js');
  const server = await import('../server/employee-import.js');
  departments.forEach(dept => db.insert('departments', dept));
  const csv = `${header},empNo,email\n张三,工程师,d1,2026-10-01,NEW1,new@example.com`;
  assert.equal(server.previewEmployees(csv).valid, true);
  assert.equal(db.count('employees'), 0);
  db.insert('employees', { id: 'existing', email: 'new@example.com' });
  assert.equal(server.saveEmployees(csv).ok, false, 'latest database conflict is caught');
  assert.equal(db.count('employees'), 1);
  db.remove('employees', 'existing');
  const saved = server.saveEmployees(csv);
  assert.equal(saved.ok, true);
  assert.equal(saved.count, 1);
  assert.equal(db.count('employees'), 1);
  assert.equal(db.recentActivity(10).length, 1);
  assert.equal(server.saveEmployees(csv).ok, false, 'replaying a file with identifiers cannot add duplicates');

  const bad = `${header},empNo\nValid,Engineer,d1,2026-10-01,NEW2\nInvalid,Engineer,d1,2026-02-30,NEW3`;
  assert.equal(server.saveEmployees(bad).ok, false);
  assert.equal(db.count('employees'), 1, 'invalid batches cannot partially save');
  db.open().exec(`CREATE TRIGGER fail_import BEFORE INSERT ON docs WHEN NEW.col = 'employees' AND json_extract(NEW.data, '$.name') = 'Fail' BEGIN SELECT RAISE(ABORT, 'forced write failure'); END;`);
  assert.throws(() => server.saveEmployees(`${header},empNo\nPass,Engineer,d1,2026-10-01,NEW2\nFail,Engineer,d1,2026-10-01,NEW3`), /forced write failure/);
  assert.equal(db.count('employees'), 1, 'a database write failure rolls back earlier rows');
  assert.equal(db.recentActivity(10).length, 1, 'activity rows roll back with employees');
  db.open().exec('DROP TRIGGER fail_import');
  assert.equal(server.saveEmployees(`${header}\nAnonymous,Engineer,d1,2026-10-01`).ok, false, 'identifier-free batches cannot be saved');
  for (const [field, value] of [['empNo', 'UNIQUE2'], ['email', 'unique3@example.com']]) {
    const retryable = `${header},${field}\nRetry,Engineer,d1,2026-10-01,${value}`;
    const before = db.count('employees');
    assert.equal(server.saveEmployees(retryable).ok, true);
    assert.equal(server.saveEmployees(retryable).ok, false, 'retry after a lost response cannot create a second employee');
    assert.equal(db.count('employees'), before + 1);
  }
});
