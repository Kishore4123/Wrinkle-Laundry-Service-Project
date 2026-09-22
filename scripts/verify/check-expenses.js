// Throwaway verification. Requires the desktop app RUNNING.
// Pushes an expense to Firestore and asserts the desktop mirrored it, then
// checks the finance maths (profit = ledger revenue - expenses).
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, setDoc, deleteDoc } = require('firebase/firestore');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const USERDATA = 'C:/Users/sandeep.m.k/AppData/Roaming/wrinkle-laundry-command-center';
function activeDb() {
  try {
    const { directory } = JSON.parse(fs.readFileSync(path.join(USERDATA, 'storage-location.json'), 'utf8'));
    if (directory && fs.existsSync(directory)) return path.join(directory, 'wrinkle-laundry.db');
  } catch (e) {}
  return path.join(USERDATA, 'wrinkle-laundry.db');
}

const config = {
  apiKey: 'AIzaSyDvf57bPgRR0jA_kilIKP-GXNeMRg_ryzY',
  authDomain: 'stress-monitor-7005a.firebaseapp.com',
  projectId: 'stress-monitor-7005a',
  storageBucket: 'stress-monitor-7005a.firebasestorage.app',
  messagingSenderId: '329659811223',
  appId: '1:329659811223:web:3e6aa4bb0018ee4bf5f0d2',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ID = 'verify-expense-1';
const DB = activeDb();

function read() {
  const d = new DatabaseSync(DB, { readOnly: true });
  const row = d.prepare('SELECT * FROM expenses WHERE id = ?').get(ID);
  const totals = d.prepare('SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM expenses').get();
  const revenue = d.prepare('SELECT COALESCE(SUM(amount),0) s FROM revenue_ledger').get();
  d.close();
  return { row, totals, revenue: revenue.s };
}

(async () => {
  console.log('active db:', DB);
  const app = initializeApp(config);
  await signInAnonymously(getAuth(app));
  const store = getFirestore(app);

  await setDoc(doc(store, 'expenses', ID), {
    id: ID, title: 'Verify Electricity Bill', category: 'Electricity',
    amount: 1500, note: 'written by the verify script',
    spentAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
  });
  console.log('pushed expense to Firestore — waiting 9s for the desktop to mirror it...');
  await sleep(9000);

  const after = read();
  console.log(after.row
    ? `PASS mirror  — SQLite has "${after.row.title}" (${after.row.category}) Rs.${after.row.amount}`
    : 'FAIL mirror  — expense not in SQLite');

  console.log(`         expenses: ${after.totals.n} rows, total Rs.${after.totals.s}`);
  console.log(`         ledger revenue: Rs.${after.revenue}`);
  console.log(`         => profit would be Rs.${after.revenue - after.totals.s}`);

  await deleteDoc(doc(store, 'expenses', ID));
  console.log('deleted from Firestore — waiting 8s...');
  await sleep(8000);
  const gone = read();
  console.log(gone.row ? 'FAIL delete  — still in SQLite' : 'PASS delete  — removed from SQLite too');

  const ok = after.row && !gone.row;
  console.log(ok ? '\nPASS — expense sync works both directions' : '\nFAIL');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.code || e.message); process.exit(1); });
