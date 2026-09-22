// Throwaway verification tooling. Requires the desktop app RUNNING.
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, setDoc, getDoc, deleteDoc } = require('firebase/firestore');

const config = {
  apiKey: 'AIzaSyDvf57bPgRR0jA_kilIKP-GXNeMRg_ryzY',
  authDomain: 'stress-monitor-7005a.firebaseapp.com',
  projectId: 'stress-monitor-7005a',
  storageBucket: 'stress-monitor-7005a.firebasestorage.app',
  messagingSenderId: '329659811223',
  appId: '1:329659811223:web:3e6aa4bb0018ee4bf5f0d2',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEVICE = 'verify-device';
const BILL_ID = 'WR-260916-901';

(async () => {
  const app = initializeApp(config);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);

  // 1. Mobile -> desktop ingestion
  await setDoc(doc(db, 'bills_inbox', BILL_ID), {
    billId: BILL_ID, customerName: 'Ingest Test', phone: '9000000001',
    cartItems: [], totalAmount: 250, status: 'Pending',
    createdByDevice: DEVICE, createdAt: Date.now(),
  });
  console.log('wrote', BILL_ID, 'to bills_inbox — waiting 10s...');
  await sleep(10000);
  const stillThere = await getDoc(doc(db, 'bills_inbox', BILL_ID));
  console.log(stillThere.exists()
    ? 'FAIL ingest — doc still present, desktop did not consume it'
    : 'PASS ingest — doc consumed and deleted by desktop');
  if (stillThere.exists()) process.exit(1);

  // 2. Remote search: ask the desktop for the bill it just ingested
  const requestId = `${DEVICE}-${Date.now()}`;
  await setDoc(doc(db, 'search_requests', requestId), {
    deviceId: DEVICE, query: BILL_ID, createdAt: Date.now(),
  });
  console.log('asked desktop for', BILL_ID, '— waiting 10s...');
  await sleep(10000);
  const reply = await getDoc(doc(db, 'device_inbox', DEVICE, 'messages', requestId));
  if (!reply.exists()) { console.log('FAIL search — no reply from desktop'); process.exit(1); }
  const bills = reply.data().bills || [];
  console.log(bills.length > 0
    ? `PASS search  — desktop returned ${bills.length} bill(s): ${bills.map(b => b.billId).join(', ')}`
    : 'FAIL search  — empty result');
  console.log('             createdByDevice persisted as:', bills[0] && bills[0].createdByDevice);
  await deleteDoc(doc(db, 'device_inbox', DEVICE, 'messages', requestId));
  const reqGone = await getDoc(doc(db, 'search_requests', requestId));
  console.log(reqGone.exists() ? 'WARN — request doc not cleaned up' : 'PASS cleanup — request doc deleted');
  process.exit(bills.length > 0 ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.code || e.message); process.exit(1); });
