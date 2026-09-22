// Throwaway verification tooling. Requires the desktop app RUNNING.
// Pushes a customer to Firestore and asserts the desktop mirrored it into SQLite.
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, setDoc, deleteDoc } = require('firebase/firestore');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = 'C:/Users/sandeep.m.k/AppData/Roaming/wrinkle-laundry-command-center/wrinkle-laundry.db';
const config = {
  apiKey: 'AIzaSyDvf57bPgRR0jA_kilIKP-GXNeMRg_ryzY',
  authDomain: 'stress-monitor-7005a.firebaseapp.com',
  projectId: 'stress-monitor-7005a',
  storageBucket: 'stress-monitor-7005a.firebasestorage.app',
  messagingSenderId: '329659811223',
  appId: '1:329659811223:web:3e6aa4bb0018ee4bf5f0d2',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ID = 'verify-customer-1';

function readLocal() {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(ID);
  const pricing = db.prepare("SELECT value FROM app_config WHERE key = 'pricing'").get();
  db.close();
  return { row, pricing: pricing ? Object.keys(JSON.parse(pricing.value)) : null };
}

(async () => {
  const app = initializeApp(config);
  await signInAnonymously(getAuth(app));
  const fs = getFirestore(app);

  await setDoc(doc(fs, 'customers', ID), {
    id: ID, name: 'Verify Customer', mobile: '9876543210',
    category: 'Public', totalWeight: 0, totalAmountPaid: 0,
    createdAt: Date.now(), updatedAt: Date.now(), synced: true,
  });
  console.log('pushed customer to Firestore — waiting 8s for desktop to mirror...');
  await sleep(8000);

  let { row, pricing } = readLocal();
  console.log(row ? `PASS mirror   — SQLite has "${row.name}" (${row.category})` : 'FAIL mirror   — not in SQLite');
  console.log(pricing ? `PASS pricing  — cached locally: ${pricing.join(', ')}` : 'FAIL pricing  — no local pricing cache');

  await deleteDoc(doc(fs, 'customers', ID));
  console.log('deleted from Firestore — waiting 8s for desktop to drop it...');
  await sleep(8000);
  ({ row } = readLocal());
  console.log(row ? 'FAIL delete   — still in SQLite' : 'PASS delete   — removed from SQLite too');

  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.code || e.message); process.exit(1); });
