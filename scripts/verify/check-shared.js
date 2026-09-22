// Throwaway verification tooling.
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, getDoc, collection, getDocs } = require('firebase/firestore');
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
  const db = getFirestore(app);

  const pricing = await getDoc(doc(db, 'config', 'pricing'));
  console.log('config/pricing exists:', pricing.exists());
  if (pricing.exists()) {
    console.log('  categories:', Object.keys(pricing.data().categories || {}).join(', ') || '(none)');
  }

  const devices = await getDocs(collection(db, 'devices'));
  console.log('devices registered:', devices.size);
  devices.forEach((d) => console.log('  -', d.id, JSON.stringify({ name: d.data().name, canCustomize: d.data().canCustomize })));

  const customers = await getDocs(collection(db, 'customers'));
  console.log('customers:', customers.size);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.code || e.message); process.exit(1); });
