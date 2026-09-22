// Throwaway verification tooling. Consumes real bill numbers (gaps are harmless).
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, runTransaction } = require('firebase/firestore');

const config = {
  apiKey: 'AIzaSyDvf57bPgRR0jA_kilIKP-GXNeMRg_ryzY',
  authDomain: 'stress-monitor-7005a.firebaseapp.com',
  projectId: 'stress-monitor-7005a',
  storageBucket: 'stress-monitor-7005a.firebasestorage.app',
  messagingSenderId: '329659811223',
  appId: '1:329659811223:web:3e6aa4bb0018ee4bf5f0d2',
};

async function allocate(db) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'counters', 'bill_number');
    const snap = await tx.get(ref);
    const next = snap.exists() ? (snap.data().next || 0) + 1 : 1;
    tx.set(ref, { next }, { merge: true });
    return next;
  });
}

(async () => {
  const app = initializeApp(config);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);

  const a = await allocate(db);
  const b = await allocate(db);
  // Five at once simulates several devices billing simultaneously.
  const parallel = await Promise.all([allocate(db), allocate(db), allocate(db), allocate(db), allocate(db)]);

  const all = [a, b, ...parallel];
  const unique = new Set(all);
  console.log('sequential:', a, b);
  console.log('parallel  :', [...parallel].sort((x, y) => x - y));
  console.log(unique.size === all.length
    ? `PASS — ${all.length} allocations, all unique`
    : `FAIL — duplicates issued: ${all.join(',')}`);
  process.exit(unique.size === all.length ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.code || e.message); process.exit(1); });
