// Throwaway verification. Requires the desktop app RUNNING.
// Proves revenue survives deleting the bill it came from.
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, setDoc } = require('firebase/firestore');
const { DatabaseSync } = require('node:sqlite');

const DB = 'C:/Users/sandeep.m.k/AppData/Roaming/wrinkle-laundry-command-center/wrinkle-laundry.db';
const config = {
  apiKey: 'AIzaSyDvf57bPgRR0jA_kilIKP-GXNeMRg_ryzY',
  authDomain: 'stress-monitor-7005a.firebaseapp.com',
  projectId: 'stress-monitor-7005a',
  storageBucket: 'stress-monitor-7005a.firebasestorage.app',
  messagingSenderId: '329659811223',
  appId: '1:329659811223:web:3e6aa4bb0018ee4bf5f0d2',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ID = 'WR-260919-777';

function read() {
  const d = new DatabaseSync(DB, { readOnly: true });
  const bill = d.prepare('SELECT billId, status, totalAmount FROM bills WHERE billId = ?').get(ID);
  const ledger = d.prepare('SELECT billId, amount, collectedAt FROM revenue_ledger WHERE billId = ?').get(ID);
  const totals = d.prepare('SELECT COUNT(*) n, COALESCE(SUM(amount),0) sum FROM revenue_ledger').get();
  d.close();
  return { bill, ledger, totals };
}

(async () => {
  const app = initializeApp(config);
  await signInAnonymously(getAuth(app));
  const fs = getFirestore(app);

  await setDoc(doc(fs, 'bills_inbox', ID), {
    billId: ID, customerName: 'Ledger Test', phone: '9000000777',
    cartItems: [{ serviceType: 'WASH_AND_IRON', weight: 2, ratePerKg: 125, subtotal: 250, items: [] }],
    totalWeight: 2, totalClothesCount: 0, totalAmount: 250,
    status: 'Completed', completedAt: new Date().toISOString(),
    createdByDevice: 'verify-device', createdAt: Date.now(),
  });
  console.log('pushed a COMPLETED bill — waiting 9s for ingest...');
  await sleep(9000);

  let s = read();
  console.log(s.bill ? `PASS ingest  — bill in SQLite, status=${s.bill.status}` : 'FAIL ingest  — bill missing');
  console.log(s.ledger ? `PASS ledger  — revenue recorded: ₹${s.ledger.amount}` : 'FAIL ledger  — no ledger entry');
  const before = s.totals;
  console.log(`         ledger totals: ${before.n} entries, ₹${before.sum}`);

  // Simulate the desktop's Delete action: it only touches `bills`.
  const w = new DatabaseSync(DB);
  w.prepare('DELETE FROM bills WHERE billId = ?').run(ID);
  w.close();
  console.log('deleted the bill row (what the Delete button does)');

  s = read();
  console.log(s.bill ? 'FAIL delete  — bill still present' : 'PASS delete  — bill gone');
  console.log(s.ledger ? `PASS revenue — STILL ₹${s.ledger.amount} in the ledger` : 'FAIL revenue — ledger entry vanished');
  console.log(`         ledger totals after delete: ${s.totals.n} entries, ₹${s.totals.sum}`);

  const ok = !s.bill && s.ledger && s.totals.sum === before.sum;
  console.log(ok ? '\nPASS — revenue survived bill deletion' : '\nFAIL — revenue changed');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.code || e.message); process.exit(1); });
