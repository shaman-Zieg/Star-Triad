import { validationErrors } from './validation.js';

export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_IMPORT_ROWS = 500;
const aliases = {
  name: ['姓名', '员工姓名'], nameEn: ['英文名', '英文姓名'], empNo: ['工号', '员工编号', 'employeeNumber'],
  email: ['邮箱', '电子邮箱'], phone: ['电话', '手机号'], title: ['职位', '岗位', 'jobTitle'], titleEn: ['职位英文'],
  deptId: ['部门', '部门ID', 'department', 'departmentId'], managerId: ['直属上级', '上级', 'manager'],
  level: ['职级'], location: ['工作地点', '地点'], hireDate: ['入职日期'], status: ['状态'],
  performance: ['绩效', '绩效评分'], potential: ['潜力', '潜力评分'], engagement: ['敬业度'], compaRatio: ['薪酬比较比率'],
  skills: ['技能'], lastPromotion: ['最近晋升日期'], leaveDate: ['离职日期'], leaveReason: ['离职原因'], leaveType: ['离职类型'],
};
const normalize = value => value.trim().toLowerCase();
const headerKey = value => normalize(value).replace(/[\s_-]/g, '');
const headers = new Map(Object.entries(aliases).flatMap(([key, values]) => [key, ...values].map(value => [headerKey(value), key])));
const required = ['name', 'title', 'deptId', 'hireDate'];
const numeric = new Set(['performance', 'potential', 'engagement', 'compaRatio']);
const locations = { 上海: 'sh', 北京: 'bj', 深圳: 'sz', 杭州: 'hz', 远程: 'remote' };
const statuses = { 在职: 'active', 离职: 'left', 已离职: 'left' };

function csvError(message, line = 1) { const error = new Error(message); error.line = line; return error; }

export function decodeEmployeeCSV(input, encoding = 'auto') {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw csvError('文件不能超过 1 MB / File exceeds 1 MB');
  if (!['auto', 'utf-8', 'gbk'].includes(encoding)) throw csvError('不支持的编码 / Unsupported encoding');
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const decode = label => ({ csv: new TextDecoder(label, { fatal: true }).decode(bytes), encoding: label });
  try {
    if (bom || encoding === 'utf-8') return decode('utf-8');
    if (encoding === 'gbk') return decode('gbk');
    try { return decode('utf-8'); } catch { return decode('gbk'); }
  } catch { throw csvError('无法按指定编码读取，请选择 UTF-8 或 GBK / Invalid text encoding'); }
}

// Strict CSV, including escaped quotes and embedded newlines. line is the
// physical starting line, not the record index, so spreadsheet errors are locatable.
export function parseCSV(csv) {
  if (typeof csv !== 'string') throw csvError('CSV 必须为文本 / CSV must be text');
  if (new TextEncoder().encode(csv).length > MAX_IMPORT_BYTES) throw csvError('CSV 不能超过 1 MB / CSV exceeds 1 MB');
  const source = csv.replace(/^\uFEFF/, '');
  const records = [];
  let cells = [], cell = '', quoted = false, closed = false, line = 1, startLine = 1;
  const field = () => { cells.push(cell); cell = ''; closed = false; };
  const record = () => {
    field();
    if (!(cells.length === 1 && !cells[0].trim())) records.push({ line: startLine, cells });
    if (records.length > MAX_IMPORT_ROWS + 1) throw csvError(`最多 ${MAX_IMPORT_ROWS} 行员工 / Maximum ${MAX_IMPORT_ROWS} employees`, startLine);
    cells = [];
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '\r' || char === '\n') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      if (quoted) cell += '\n'; else record();
      line++;
      if (!quoted) startLine = line;
    } else if (quoted) {
      if (char !== '"') cell += char;
      else if (source[i + 1] === '"') { cell += '"'; i++; }
      else { quoted = false; closed = true; }
    } else if (char === ',') field();
    else if (char === '"' && !cell && !closed) quoted = true;
    else if (char === '"' || closed) throw csvError('引号格式错误 / Malformed CSV quote', line);
    else cell += char;
  }
  if (quoted) throw csvError('引号未闭合 / Unclosed CSV quote', startLine);
  if (cell || cells.length || closed) record();
  return records;
}

export function previewEmployees(csv, employees = [], departments = []) {
  const errors = [];
  let records;
  try { records = parseCSV(csv); } catch (error) { return { valid: false, count: 0, rows: [], errors: [{ line: error.line, message: error.message }] }; }
  if (!records.length) return { valid: false, count: 0, rows: [], errors: [{ line: 1, message: 'CSV 为空 / CSV is empty' }] };
  const head = records.shift();
  const keys = head.cells.map(value => headers.get(headerKey(value)));
  head.cells.forEach((value, i) => {
    if (!keys[i]) errors.push({ line: head.line, message: `未知列 / Unknown column: ${value || '(empty)'}` });
    else if (keys.indexOf(keys[i]) !== i) errors.push({ line: head.line, message: `重复列 / Duplicate column: ${value}` });
  });
  required.forEach(key => { if (!keys.includes(key)) errors.push({ line: head.line, message: `缺少必需列 / Required column: ${key}` }); });
  if (!records.length) errors.push({ line: head.line + 1, message: '没有员工数据 / No employee rows' });
  if (errors.length) return { valid: false, count: records.length, rows: [], errors };

  const lookup = (collection, id) => (collection === 'employees' ? employees : departments).find(record => record.id === id);
  const rows = records.map(record => {
    const row = { line: record.line, employee: { level: 'P4', status: 'active', location: 'sh', managerId: null, performance: null, potential: null, engagement: null, compaRatio: null, skills: [], perfHistory: [], competencies: null }, errors: [] };
    if (record.cells.length !== keys.length) row.errors.push(`列数应为 ${keys.length}，实际 ${record.cells.length} / Incorrect number of columns`);
    record.cells.slice(0, keys.length).forEach((raw, i) => {
      const value = raw.trim(), key = keys[i];
      if (!value) return;
      if (numeric.has(key)) row.employee[key] = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) ? Number(value) : value;
      else if (key === 'skills') row.employee[key] = value.split(/[;；]/).map(value => value.trim()).filter(Boolean);
      else if (key === 'level') row.employee[key] = value.toUpperCase();
      else if (key === 'location') row.employee[key] = locations[value] || normalize(value);
      else if (key === 'status') row.employee[key] = statuses[value] || normalize(value);
      else row.employee[key] = value;
    });
    const doc = row.employee;
    if (!doc.empNo && !doc.email) row.errors.push('至少填写工号或邮箱，用于识别重复导入 / Employee number or email is required to prevent duplicate imports');
    const dept = departments.find(record => record.id === doc.deptId);
    const matches = dept ? [dept] : departments.filter(record => [record.name, record.nameEn].some(value => value && normalize(value) === normalize(doc.deptId || '')));
    if (matches.length === 1) doc.deptId = matches[0].id;
    else row.errors.push('部门不存在或名称不唯一，请使用部门 ID / Department missing or ambiguous; use its ID');
    if (doc.managerId) {
      const managers = employees.filter(record => [record.id, record.empNo, record.email].some(value => value && normalize(value) === normalize(doc.managerId)));
      if (managers.length === 1 && managers[0].status !== 'left') doc.managerId = managers[0].id;
      else row.errors.push('直属上级须匹配唯一的现有在职员工 ID、工号或邮箱 / Manager must match one existing active employee ID, number or email');
    }
    doc.nameEn ||= doc.name;
    doc.titleEn ||= doc.title;
    row.errors.push(...validationErrors('employees', doc, lookup));
    return row;
  });
  for (const key of ['empNo', 'email']) {
    const existing = new Set(employees.map(employee => normalize(employee[key] || '')).filter(Boolean));
    const seen = new Map();
    for (const row of rows) {
      const value = normalize(row.employee[key] || '');
      if (!value) continue;
      if (existing.has(value)) row.errors.push(`${key}: 已存在，仅支持新增 / Already exists; import only adds employees`);
      if (seen.has(value)) {
        const first = seen.get(value);
        row.errors.push(`${key}: 与第 ${first.line} 行重复 / Duplicate of line ${first.line}`);
        first.errors.push(`${key}: 与第 ${row.line} 行重复 / Duplicate of line ${row.line}`);
      } else seen.set(value, row);
    }
  }
  return { valid: rows.length > 0 && rows.every(row => !row.errors.length), count: rows.length, rows, errors };
}

export const EMPLOYEE_CSV_TEMPLATE = '\uFEFF姓名,职位,部门,入职日期,工号,邮箱,职级,直属上级,工作地点,绩效,潜力\r\n';
