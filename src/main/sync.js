// sync.js — Firestore mailbox listeners.
//
// Runs in the Electron main process because the renderer is sandboxed
// (contextIsolation on, nodeIntegration off) and so cannot require the SDK.
// The main process already owns the database, so the listeners belong beside it.
//
// Firestore is a transient mailbox here, never a database: every document is
// deleted as soon as it is consumed. This SQLite database is the durable archive.
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const {
  getFirestore, doc, collection, onSnapshot, deleteDoc, setDoc, runTransaction,
} = require('firebase/firestore');
const db = require('./database');

const firebaseConfig = {
  apiKey: 'AIzaSyDvf57bPgRR0jA_kilIKP-GXNeMRg_ryzY',
  authDomain: 'stress-monitor-7005a.firebaseapp.com',
  projectId: 'stress-monitor-7005a',
  storageBucket: 'stress-monitor-7005a.firebasestorage.app',
  messagingSenderId: '329659811223',
  appId: '1:329659811223:web:3e6aa4bb0018ee4bf5f0d2',
};

let fs = null;

async function initSync({ onChange }) {
  const app = initializeApp(firebaseConfig);
  await signInAnonymously(getAuth(app));
  fs = getFirestore(app);

  // Mobile -> desktop: ingest each bill into SQLite, then delete the doc.
  onSnapshot(
    collection(fs, 'bills_inbox'),
    (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type === 'removed') return;
        try {
          db.addBill(change.doc.data());
          await deleteDoc(doc(fs, 'bills_inbox', change.doc.id));
          if (onChange) onChange();
        } catch (e) {
          console.error('[Sync] ingest failed for', change.doc.id, e.message);
        }
      });
    },
    (err) => console.error('[Sync] bills_inbox listener error:', err.message)
  );

  // Mobile -> desktop: answer lookups from the archive, then delete the request.
  onSnapshot(
    collection(fs, 'search_requests'),
    (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type === 'removed') return;
        const req = change.doc.data();
        const requestId = change.doc.id;
        if (!req.deviceId) return;
        try {
          const query = String(req.query || '').trim();
          // Exact bill ID first, then exact phone number. Deliberately narrow —
          // substring search stays local on the phone.
          const byId = db.findBillById(query);
          const results = byId ? [byId] : db.findBillsByPhone(query);
          await setDoc(doc(fs, 'device_inbox', req.deviceId, 'messages', requestId), {
            type: 'search-response',
            requestId,
            bills: results,
            sentAt: Date.now(),
          });
          await deleteDoc(doc(fs, 'search_requests', requestId));
        } catch (e) {
          console.error('[Sync] search failed for', requestId, e.message);
        }
      });
    },
    (err) => console.error('[Sync] search_requests listener error:', err.message)
  );
}

async function allocateBillNumber() {
  if (!fs) throw new Error('Sync is not connected.');
  return runTransaction(fs, async (tx) => {
    const ref = doc(fs, 'counters', 'bill_number');
    const snap = await tx.get(ref);
    const next = snap.exists() ? (snap.data().next || 0) + 1 : 1;
    tx.set(ref, { next }, { merge: true });
    return next;
  });
}

/** Desktop -> the one mobile device that created the bill. */
async function pushStatus(billId, status, completedAt, deviceId) {
  if (!fs || !deviceId) return;
  const messageId = `status-${billId}-${Date.now()}`;
  await setDoc(doc(fs, 'device_inbox', deviceId, 'messages', messageId), {
    type: 'status',
    billId,
    status,
    completedAt: completedAt || null,
    sentAt: Date.now(),
  });
}

module.exports = { initSync, allocateBillNumber, pushStatus };
