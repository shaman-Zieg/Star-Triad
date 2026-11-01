// Local account provisioning. Passwords are read from a hidden prompt or stdin,
// never command-line arguments, and are stored only as salted scrypt hashes.
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { authFile, hashPassword, validateUsers } from '../server/auth.js';
import * as db from '../server/db.js';
import { seedIfEmpty } from '../server/seed.js';

const [command, role, employeeId] = process.argv.slice(2);
const file = authFile();
try {
  let users = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  if (command === '--list') {
    console.table(users.map(({ username, role, employeeId }) => ({ username, role, employeeId })));
  } else if (command === '--remove' && role) {
    users = users.filter(u => u.username !== role);
    validateUsers(users);
    save(users);
  } else if (command && ['hr', 'manager', 'employee'].includes(role) && employeeId) {
    db.open();
    seedIfEmpty();
    const employee = db.get('employees', employeeId);
    if (!employee || employee.status === 'left') throw new Error('Choose an existing active employee id (from the local directory/export).');
    let password;
    if (process.stdin.isTTY) {
      const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
      const rl = createInterface({ input: process.stdin, output, terminal: true });
      process.stdout.write('New password (12–256 characters; input hidden): ');
      password = await rl.question('');
      process.stdout.write('\nRepeat password: ');
      const repeat = await rl.question('');
      rl.close();
      process.stdout.write('\n');
      if (password !== repeat) throw new Error('Passwords do not match.');
    } else {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
    }
    const user = { username: command, role, employeeId, passwordHash: await hashPassword(password) };
    users = [...users.filter(u => u.username !== command), user];
    validateUsers(users);
    save(users);
  } else {
    console.log('Usage: node scripts/manage-users.mjs <username> <hr|manager|employee> <employeeId>\n       node scripts/manage-users.mjs --list\n       node scripts/manage-users.mjs --remove <username>\nCreate the first account with the hr role. Restart the server after account changes.');
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally { db.close(); }

function save(users) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(users, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, file);
  console.log('Accounts saved. Restart the server to apply changes and invalidate existing sessions.');
}
