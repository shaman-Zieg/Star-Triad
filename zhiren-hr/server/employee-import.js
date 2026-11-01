import * as db from './db.js';
import { previewEmployees as prepareEmployees } from '../public/js/engine/employee-import.js';

export function previewEmployees(csv) {
  return prepareEmployees(csv, db.list('employees'), db.list('departments'));
}

export function saveEmployees(csv, actor) {
  const connection = db.open();
  connection.exec('BEGIN IMMEDIATE');
  try {
    // Re-read and revalidate under the write lock: a preview never reserves names,
    // email addresses, departments or managers, and clients cannot submit docs.
    const preview = previewEmployees(csv);
    if (!preview.valid) {
      connection.exec('ROLLBACK');
      return { ok: false, ...preview };
    }
    const ids = preview.rows.map(({ employee }) => {
      const doc = db.insert('employees', { ...employee, ...(actor && { createdBy: actor.id }) });
      db.logActivity({ actor, action: 'create', col: 'employees', doc });
      return doc.id;
    });
    connection.exec('COMMIT');
    return { ok: true, count: ids.length, ids };
  } catch (error) {
    connection.exec('ROLLBACK');
    throw error;
  }
}
