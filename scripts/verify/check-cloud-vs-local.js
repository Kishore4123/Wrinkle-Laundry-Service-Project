// Diagnoses what a brand-new desktop would and would not receive.
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs'); const path = require('path');

const UD = 'C:/Users/sandeep.m.k/AppData/Roaming/wrinkle-laundry-command-center';
function activeDb() {
  try {
    const { directory } = JSON.parse(fs.readFileSync(path.join(UD, 'storage-location.json'), 'utf8'));
    if (directory && fs.existsSync(directory)) return path.join(directory, 'wrinkle-laundry.db');
  } catch (e) {}
  return path.join(UD, 'wrinkle-laundry.db');
}

const config = {
  apiKey: 'AIzaSyDvf57bPgRR0jA_kilIKP-GXNeMRg_ryzY',
  authDomain: 'stress-monitor-7005a.firebaseapp.com',
  projectId: 'stress-monitor-7005a',
  storageBucket: 'stress-monitor-7005a.firebasestorage.app',
  messagingSenderId: '329659811223',
  appId: '1:329659811223:web:3e6aa4bb0018ee4bf5f0d2',
};

(async () => {
  const app = initializeApp(config);
  await signInAnonymously(getAuth(app));
  const store = getFirestore(app);

  console.log('=== IN THE CLOUD (what a new desktop can pull) ===');
  for (const name of ['bills_inbox', 'desk_bills', 'customers', 'expenses', 'devices', 'config']) {
    try {
      const snap = await getDocs(collection(store, name));
      console.log(`  ${name.padEnd(14)} ${snap.size}`);
    } catch (e) {
      console.log(`  ${name.padEnd(14)} ERROR ${e.code || e.message}`);
    }
  }

  const DB = activeDb();
  console.log('\n=== ON THIS (OLD) MACHINE ===');
  console.log('  db:', DB);
  const d = new DatabaseSync(DB, { readOnly: true });
  for (const t of ['bills', 'revenue_ledger', 'customers', 'expenses']) {
    try {
      console.log(`  ${t.padEnd(14)} ${d.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n}`);
    } catch (e) { console.log(`  ${t.padEnd(14)} (no table)`); }
  }
  const led = d.prepare('SELECT COALESCE(SUM(amount),0) s FROM revenue_ledger').get();
  console.log('  ledger revenue total:', led.s);
  d.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.code || e.message); process.exit(1); });
