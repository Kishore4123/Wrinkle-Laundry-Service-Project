// SyncService.js — all Firestore traffic for the mobile app.
//
// Firestore is used as a transient mailbox, never as a database: every document
// written here is deleted as soon as the other side consumes it. The desktop's
// SQLite database is the only durable archive.
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import { db, ensureSignedIn, getDeviceId } from './firebase';
import { BillService } from './storage';

const SEARCH_TIMEOUT_MS = 10000;

/**
 * Reserve the next global bill number. Requires connectivity — a device that
 * cannot reach Firestore must not create a bill at all, because the number is
 * printed on the customer's receipt and can never change afterwards.
 */
export async function allocateBillNumber() {
  await ensureSignedIn();
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'counters', 'bill_number');
    const snap = await tx.get(ref);
    const next = snap.exists() ? (snap.data().next || 0) + 1 : 1;
    tx.set(ref, { next }, { merge: true });
    return next;
  });
}

/**
 * Push one bill to the desktop. The doc ID is the bill ID, so re-pushing the
 * same bill overwrites rather than duplicating — this is what makes "sync all"
 * and the pending flush safe to run repeatedly.
 */
export async function pushBill(bill) {
  await ensureSignedIn();
  const deviceId = await getDeviceId();
  await setDoc(doc(db, 'bills_inbox', bill.id), {
    ...bill,
    billId: bill.id,
    createdByDevice: deviceId,
    pushedAt: Date.now(),
  });
  await BillService.markSynced(bill.id);
}

export async function flushPending() {
  const pending = await BillService.getPendingSync();
  let ok = 0;
  for (const bill of pending) {
    try {
      await pushBill(bill);
      ok++;
    } catch (e) {
      console.warn('[Sync] push failed for', bill.id, e.message);
    }
  }
  return ok;
}

export async function deleteRemoteBill(billId) {
  await ensureSignedIn();
  try {
    await deleteDoc(doc(db, 'bills_inbox', billId));
  } catch (e) {
    // Already ingested and deleted by the desktop — nothing to do.
  }
}

/**
 * Ask the desktop archive for a bill this phone does not have. Resolves [] if the
 * shop computer is not running — callers should tell the user that rather than
 * failing silently.
 */
export async function requestRemoteSearch(query) {
  await ensureSignedIn();
  const deviceId = await getDeviceId();
  const requestId = `${deviceId}-${Date.now()}`;
  const replyRef = doc(db, 'device_inbox', deviceId, 'messages', requestId);

  return new Promise((resolve) => {
    let settled = false;
    let unsub = null;

    const finish = async (bills) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (unsub) unsub();
      try { await deleteDoc(replyRef); } catch (e) {}
      resolve(bills);
    };

    const timer = setTimeout(() => finish([]), SEARCH_TIMEOUT_MS);

    unsub = onSnapshot(
      replyRef,
      (snap) => { if (snap.exists()) finish(snap.data().bills || []); },
      () => finish([])
    );

    setDoc(doc(db, 'search_requests', requestId), {
      deviceId,
      query,
      createdAt: Date.now(),
    }).catch(() => finish([]));
  });
}

/**
 * Listen to this device's private inbox. Partitioned per device so that with
 * several phones in the shop, one phone cannot consume another phone's messages.
 */
export async function subscribeToDeviceInbox() {
  await ensureSignedIn();
  const deviceId = await getDeviceId();
  const inbox = collection(db, 'device_inbox', deviceId, 'messages');

  return onSnapshot(
    inbox,
    (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type === 'removed') return;
        const msg = change.doc.data();
        // search-response docs are consumed by requestRemoteSearch's own listener.
        if (msg.type !== 'status') return;
        try {
          await BillService.applyRemoteStatus(msg.billId, msg.status, msg.completedAt);
          await deleteDoc(change.doc.ref);
        } catch (e) {
          console.warn('[Sync] failed applying status', msg.billId, e.message);
        }
      });
    },
    (err) => console.warn('[Sync] inbox listener error:', err.message)
  );
}
