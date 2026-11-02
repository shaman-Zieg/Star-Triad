import { html, setHTML, modal, api, download, toast, callout, field, select } from '../core.js';
import { L } from '../i18n.js';
import { decodeEmployeeCSV, EMPLOYEE_CSV_TEMPLATE, MAX_IMPORT_BYTES } from '../engine/employee-import.js';

const labels = {
  name: ['姓名', 'Name'], nameEn: ['英文名', 'English name'], empNo: ['工号', 'Employee number'], email: ['邮箱', 'Email'], phone: ['电话', 'Phone'],
  title: ['职位', 'Title'], titleEn: ['英文职位', 'English title'], deptId: ['部门 ID', 'Department ID'], managerId: ['上级 ID', 'Manager ID'],
  level: ['职级', 'Level'], status: ['状态', 'Status'], location: ['工作地点', 'Location'], hireDate: ['入职日期', 'Hire date'],
  performance: ['绩效', 'Performance'], potential: ['潜力', 'Potential'], engagement: ['敬业度', 'Engagement'], compaRatio: ['薪酬比较比率', 'Compa-ratio'],
  skills: ['技能', 'Skills'], lastPromotion: ['最近晋升日期', 'Last promotion'], leaveDate: ['离职日期', 'Leave date'], leaveReason: ['离职原因', 'Leave reason'], leaveType: ['离职类型', 'Leave type'],
};

export function openEmployeeImport(onSaved) {
  let revision = 0, approved = null, closed = false;
  const dialog = modal({
    title: L('批量新增员工', 'Import new employees'), wide: true,
    submitLabel: L('预览并校验', 'Preview and validate'),
    body: html`<div class="gap-3 stack">
      ${callout('info', L('仅新增，最多 500 行、1 MB。必需列：姓名、职位、部门、入职日期（YYYY-MM-DD）；每行还须填写工号或邮箱，用于防止重复导入。英文列名也可使用 name、title、deptId、hireDate、empNo、email。预览不会保存，确认后才会整批新增。', 'Add only: up to 500 rows and 1 MB. Required columns: name, title, deptId, hireDate (YYYY-MM-DD); every row also needs an employee number (empNo) or email to prevent duplicate imports. Chinese headers are accepted. Preview does not save; confirmation imports the whole batch.'))}
      <button class="btn" type="button" data-template>${L('下载 CSV 模板', 'Download CSV template')}</button>
      <label class="field"><span class="field-label">${L('选择 CSV 文件', 'Choose a CSV file')}</span><input class="input" type="file" name="csvFile" accept=".csv,text/csv"></label>
      ${field(L('文件编码', 'File encoding'), select('encoding', [['auto', L('自动（UTF-8，失败时尝试 GBK）', 'Auto (UTF-8, then GBK)')], ['utf-8', 'UTF-8'], ['gbk', 'GBK']], { value: 'auto' }))}
      <p class="small muted">${L('部门可填写 ID 或唯一的中英文名称。直属上级只能填写已存在员工的 ID、工号或邮箱，不能引用本次新增行。空白职级、状态、工作地点分别默认为 P4、在职、上海；未提供的评分保持未评估。技能用分号分隔。', 'Department accepts an ID or a unique Chinese/English name. Manager accepts an existing employee ID, number or email, not another new row. Blank level, status and location default to P4, active and Shanghai. Missing ratings stay unassessed. Separate skills with semicolons.')}</p>
      <div data-preview aria-live="polite"></div>
    </div>`,
    onOpen(form) {
      const invalidate = () => {
        revision++; approved = null;
        form.querySelector('[type=submit]').textContent = L('预览并校验', 'Preview and validate');
        setHTML(form.querySelector('[data-preview]'), '');
      };
      form.elements.csvFile.addEventListener('change', invalidate);
      form.elements.encoding.addEventListener('change', invalidate);
      form.querySelector('[data-template]').addEventListener('click', () => download('employees-template.csv', EMPLOYEE_CSV_TEMPLATE, 'text/csv;charset=utf-8'));
    },
    onClose() { closed = true; revision++; approved = null; },
    async onSubmit(values, { form, showError }) {
      const button = form.querySelector('[type=submit]');
      const renderPreview = (result, encoding) => {
        setHTML(form.querySelector('[data-preview]'), html`
          ${callout(result.valid ? 'ok' : 'warn', result.valid
            ? L(`${result.count} 行通过校验（${encoding}）。请检查下方内容，然后点击“确认导入”。`, `${result.count} rows passed (${encoding}). Review the preview, then select Confirm import.`)
            : L('存在错误，整批不会保存。请修改文件后重新预览。', 'Errors found. Nothing will be saved. Correct the file and preview again.'))}
          ${result.errors.length ? html`<ul>${result.errors.map(error => html`<li>${L('行', 'Line')} ${error.line}: ${error.message}</li>`)}</ul>` : ''}
          ${result.rows.length ? html`<div class="table-wrap" style="max-height:360px;overflow:auto;margin-top:12px"><table class="table"><thead><tr>
            ${[L('行', 'Line'), L('姓名', 'Name'), L('职位', 'Title'), L('部门 ID', 'Department ID'), L('入职日期', 'Hire date'), L('工号 / 邮箱', 'Number / email'), L('校验及完整数据', 'Validation and full record')].map(label => html`<th>${label}</th>`)}</tr></thead><tbody>
            ${result.rows.map(row => html`<tr><td>${row.line}</td><td>${row.employee.name}</td><td>${row.employee.title}</td><td>${row.employee.deptId}</td><td>${row.employee.hireDate}</td><td>${row.employee.empNo || '—'}<br>${row.employee.email || '—'}</td><td>
              ${row.errors.length ? html`<ul class="text-danger">${row.errors.map(error => html`<li>${error}</li>`)}</ul>` : L('通过', 'Valid')}
              <details><summary>${L('查看所有字段', 'All fields')}</summary><dl class="kv">${Object.entries(row.employee).filter(([key]) => labels[key]).map(([key, value]) => html`<dt>${L(...labels[key])}</dt><dd>${Array.isArray(value) ? value.join('; ') || '—' : value ?? '—'}</dd>`)}</dl></details></td></tr>`)}
          </tbody></table></div>` : ''}`);
        button.textContent = result.valid ? L('确认导入', 'Confirm import') : L('重新预览并校验', 'Preview and validate again');
      };
      if (!approved) {
        const file = form.elements.csvFile.files[0];
        if (!file || !/\.csv$/i.test(file.name)) throw new Error(L('请选择 .csv 文件', 'Choose a .csv file'));
        if (file.size > MAX_IMPORT_BYTES) throw new Error(L('文件不能超过 1 MB', 'File exceeds 1 MB'));
        const current = revision;
        const decoded = decodeEmployeeCSV(await file.arrayBuffer(), values.encoding);
        const result = await api.post('/api/employees/import-preview', { csv: decoded.csv });
        if (closed || current !== revision) return false;
        renderPreview(result, decoded.encoding);
        if (result.valid) approved = { ...decoded, revision: current };
        return false;
      }
      const snapshot = approved;
      if (snapshot.revision !== revision) { approved = null; return false; }
      form.elements.csvFile.disabled = true;
      form.elements.encoding.disabled = true;
      try {
        const result = await api.post('/api/employees/import', { csv: snapshot.csv });
        if (!result.ok) {
          approved = null;
          renderPreview(result, snapshot.encoding);
          return false;
        }
        toast(L(`已新增 ${result.count} 名员工`, `${result.count} employees imported`));
        dialog.close();
        await onSaved?.(result);
      } catch (error) {
        // The database may have changed since preview. Never retry a save;
        // refresh row errors so the user can review and explicitly confirm again.
        approved = null;
        button.textContent = L('重新预览并校验', 'Preview and validate again');
        if (!closed) {
          try {
            const result = await api.post('/api/employees/import-preview', { csv: snapshot.csv });
            renderPreview(result, snapshot.encoding);
            button.textContent = L('重新预览并校验', 'Preview and validate again');
          } catch { /* The original save error is more useful. */ }
          showError(error.message);
        }
        return false;
      } finally {
        form.elements.csvFile.disabled = false;
        form.elements.encoding.disabled = false;
      }
    },
  });
  return dialog;
}
