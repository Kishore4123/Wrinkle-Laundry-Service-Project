// Throwaway verification tooling. Not shipped. Run with: node scripts/verify/01-auth-and-counter.js
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, getDoc } = require('firebase/firestore');

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
  const cred = await signInAnonymously(getAuth(app));
  console.log('signed in uid:', cred.user.uid);
  const snap = await getDoc(doc(getFirestore(app), 'counters', 'bill_number'));
  console.log('counter exists:', snap.exists(), 'value:', snap.exists() ? snap.data().next : null);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
