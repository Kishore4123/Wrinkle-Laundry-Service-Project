// Throwaway verification tooling. Not shipped.
// Run:  NODE_PATH="../../laundry desktop/node_modules" node scripts/verify/check-auth.js
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, runTransaction, getDoc } = require('firebase/firestore');

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
  let uid;
  try {
    const cred = await signInAnonymously(getAuth(app));
    uid = cred.user.uid;
    console.log('PASS auth   — anonymous sign-in OK, uid:', uid);
  } catch (e) {
    console.log('FAIL auth   —', e.code || e.message);
    console.log('            Enable at: https://console.firebase.google.com/project/stress-monitor-7005a/authentication/providers');
    process.exit(1);
  }
  const db = getFirestore(app);
  const snap = await getDoc(doc(db, 'counters', 'bill_number'));
  console.log('PASS rules  — counter readable, current value:',
    snap.exists() ? snap.data().next : '(not created yet)');
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.code || e.message); process.exit(1); });
