// Throwaway verification.
// Proves that deleting a bill leaves the revenue ledger untouched.
// Run: NODE_PATH="laundry desktop/node_modules" node --experimental-sqlite scripts/verify/check-ledger-delete.js <billId>
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const USERDATA = 'C:/Users/sandeep.m.k/AppData/Roaming/wrinkle-laundry-command-center';

// Resolve the database the app is actually using — the user can move it.
function activeDbPath() {
  try {
    const { directory } = JSON.parse(fs.readFileSync(path.join(USERDATA, 'storage-location.json'), 'utf8'));
    if (directory && fs.existsSync(directory)) return path.join(directory, 'wrinkle-laundry.db');
  } catch (e) {}
  return path.join(USERDATA, 'wrinkle-laundry.db');
}

const DB = activeDbPath();
const ID = process.argv[2] || 'WR-260919-777';
console.log('active db:', DB);

function snapshot() {
  const d = new DatabaseSync(DB, { readOnly: true });
  const totals = d.prepare('SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM revenue_ledger').get();
  const bill = d.prepare('SELECT billId FROM bills WHERE billId = ?').get(ID);
  const entry = d.prepare('SELECT amount FROM revenue_ledger WHERE billId = ?').get(ID);
  d.close();
  return { totals, bill, entry };
}

const before = snapshot();
console.log(`before: bill present=${!!before.bill} | ledger ${before.totals.n} entries, total ${before.totals.s}`);

if (!before.bill) {
  console.log('SKIP — that bill is not in the archive; pass a billId that exists.');
  process.exit(2);
}

// Exactly what the desktop Delete button does.
const w = new DatabaseSync(DB);
w.prepare('DELETE FROM bills WHERE billId = ?').run(ID);
w.close();

const after = snapshot();
console.log(`after : bill present=${!!after.bill} | ledger ${after.totals.n} entries, total ${after.totals.s}`);
console.log(after.entry ? `ledger still holds it: ${after.entry.amount}` : 'ledger entry GONE');

const ok = !after.bill && after.entry && after.totals.s === before.totals.s;
console.log(ok ? '\nPASS — bill deleted, revenue untouched' : '\nFAIL — revenue changed on delete');
process.exit(ok ? 0 : 1);
