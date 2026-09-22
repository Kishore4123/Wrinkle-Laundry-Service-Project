# Firestore Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WebRTC peer-to-peer sync between the Expo mobile app and the Electron desktop app with Cloud Firestore used as a transient message mailbox, and move bill numbering onto a single centralized counter.

**Architecture:** Firestore holds no durable data — every document is deleted as soon as it is consumed. Mobile devices push bills to `bills_inbox`, the desktop ingests them into its SQLite archive and deletes the doc. Desktop replies to mobile devices through per-device inboxes so that several phones never steal each other's messages. All bill IDs come from one transactional counter at `counters/bill_number`.

**Tech Stack:** Firebase JS SDK v11 (`firebase/app`, `firebase/auth`, `firebase/firestore`), Expo SDK 54 / React Native 0.81, Electron 32, better-sqlite3 11.

**Spec:** `docs/superpowers/specs/2026-09-16-firestore-sync-design.md`

## Global Constraints

- Firebase project ID is `stress-monitor-7005a` (reused; the ID is permanent and cannot be renamed).
- Web SDK config, used verbatim by **both** apps:
  - `apiKey`: `AIzaSyDvf57bPgRR0jA_kilIKP-GXNeMRg_ryzY`
  - `authDomain`: `stress-monitor-7005a.firebaseapp.com`
  - `projectId`: `stress-monitor-7005a`
  - `storageBucket`: `stress-monitor-7005a.firebasestorage.app`
  - `messagingSenderId`: `329659811223`
  - `appId`: `1:329659811223:web:3e6aa4bb0018ee4bf5f0d2`
- Firestore location is `asia-south1`. Security rules are already deployed from `firestore.rules`; do not loosen them.
- All clients authenticate with **anonymous auth**. Every Firestore call must happen after sign-in resolves.
- Bill ID format is `WR-YYMMDD-NNN`, where `NNN` is the global counter value padded to a **minimum** of three digits (it grows past 999, it does not wrap). Reuse the existing `formatBillId(dateStr, sequence)` in `laundry app/src/utils/helpers.js` — do not write a second formatter.
- A device that cannot reach Firestore **cannot create a bill**. Surface this as an explicit message; never mint a provisional or local-only number.
- Firestore documents are deleted after they are consumed. Nothing accumulates.
- The desktop's SQLite database is the only durable archive. Desktop-created bills are **never** uploaded.
- On React Native the Firestore instance MUST be created with `experimentalForceLongPolling: true`, and auth MUST use `getReactNativePersistence(AsyncStorage)`. Without these, listeners stall silently and the anonymous session is lost on restart.
- `expo-camera` stays — `QRScannerScreen` uses it for customer bill lookup, which is unrelated to pairing.

### Testing approach — read this before Task 1

Neither app has a test framework, and the approved spec explicitly keeps one out of scope. So tasks do not use unit tests. Instead each task ends with a **runnable verification script** under `scripts/verify/` (plain Node, executed with `node`), plus stated expected output. These scripts are throwaway tooling, not shipped code, and must never be imported by either app.

Create `scripts/verify/` at the repo root (`C:\Users\sandeep.m.k\Desktop\main`). Every script begins with the same bootstrap; it is repeated in full in each task that needs it because tasks may be read out of order.

---

### Task 1: Mobile Firebase bootstrap

**Files:**
- Create: `laundry app/src/services/firebase.js`
- Modify: `laundry app/package.json` (add `firebase` dependency)
- Verify: `scripts/verify/01-auth-and-counter.js`

**Interfaces:**
- Consumes: `generateId()` from `laundry app/src/utils/helpers.js`
- Produces:
  - `db` — Firestore instance
  - `auth` — Auth instance
  - `ensureSignedIn(): Promise<string>` — resolves to the anonymous uid; safe to call repeatedly
  - `getDeviceId(): Promise<string>` — stable per-install UUID from AsyncStorage key `@wrinkle_device_id`

- [ ] **Step 1: Add the dependency**

```bash
cd "laundry app" && npm install firebase@^11.0.0
```

- [ ] **Step 2: Create the bootstrap module**

Create `laundry app/src/services/firebase.js`:

```js
// firebase.js — Firebase app, anonymous auth, Firestore handle, and this device's stable ID.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, signInAnonymously } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { generateId } from '../utils/helpers';

const DEVICE_ID_KEY = '@wrinkle_device_id';

const firebaseConfig = {
  apiKey: 'AIzaSyDvf57bPgRR0jA_kilIKP-GXNeMRg_ryzY',
  authDomain: 'stress-monitor-7005a.firebaseapp.com',
  projectId: 'stress-monitor-7005a',
  storageBucket: 'stress-monitor-7005a.firebasestorage.app',
  messagingSenderId: '329659811223',
  appId: '1:329659811223:web:3e6aa4bb0018ee4bf5f0d2',
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Long polling is required on React Native; without it Firestore listeners stall silently.
export const db = initializeFirestore(app, { experimentalForceLongPolling: true });

let signInPromise = null;

export function ensureSignedIn() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  if (!signInPromise) {
    signInPromise = signInAnonymously(auth)
      .then((cred) => cred.user.uid)
      .catch((err) => { signInPromise = null; throw err; });
  }
  return signInPromise;
}

let deviceIdPromise = null;

export function getDeviceId() {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = generateId();
        await AsyncStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    })();
  }
  return deviceIdPromise;
}
```

- [ ] **Step 3: Write the verification script**

Create `scripts/verify/01-auth-and-counter.js`:

```js
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
```

- [ ] **Step 4: Run it**

```bash
cd "laundry app" && node ../scripts/verify/01-auth-and-counter.js
```

Expected: prints `signed in uid: <some id>` then `counter exists: false value: null`. A `permission-denied` error means rules were not deployed; an `auth/operation-not-allowed` error means anonymous auth is not enabled in the console.

- [ ] **Step 5: Commit**

```bash
cd "laundry app" && git add package.json package-lock.json src/services/firebase.js && git commit -m "feat: add Firebase bootstrap with anonymous auth and device ID"
```

---

### Task 2: Centralized bill number allocation (mobile)

**Files:**
- Create: `laundry app/src/services/SyncService.js`
- Verify: `scripts/verify/02-counter-increments.js`

**Interfaces:**
- Consumes: `db`, `ensureSignedIn` from `./firebase`
- Produces: `allocateBillNumber(): Promise<number>` — returns the next global integer, starting at 1. Throws if offline.

- [ ] **Step 1: Create the module with allocation only**

Create `laundry app/src/services/SyncService.js`:

```js
// SyncService.js — all Firestore traffic for the mobile app.
import { doc, runTransaction } from 'firebase/firestore';
import { db, ensureSignedIn } from './firebase';

const COUNTER_REF = () => doc(db, 'counters', 'bill_number');

/**
 * Reserve the next global bill number. Requires connectivity — a device that
 * cannot reach Firestore must not create a bill at all, because the number is
 * printed on the customer's receipt and can never change afterwards.
 */
export async function allocateBillNumber() {
  await ensureSignedIn();
  return runTransaction(db, async (tx) => {
    const ref = COUNTER_REF();
    const snap = await tx.get(ref);
    const next = snap.exists() ? (snap.data().next || 0) + 1 : 1;
    tx.set(ref, { next }, { merge: true });
    return next;
  });
}
```

- [ ] **Step 2: Write the verification script**

Create `scripts/verify/02-counter-increments.js`:

```js
// Throwaway verification tooling. Run with: node scripts/verify/02-counter-increments.js
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
  const parallel = await Promise.all([allocate(db), allocate(db), allocate(db)]);
  console.log('sequential:', a, b);
  console.log('parallel:', parallel.sort((x, y) => x - y));
  const all = [a, b, ...parallel];
  const unique = new Set(all);
  console.log(unique.size === all.length ? 'PASS: all unique' : 'FAIL: duplicates issued');
  process.exit(unique.size === all.length ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
```

- [ ] **Step 3: Run it**

```bash
cd "laundry app" && node ../scripts/verify/02-counter-increments.js
```

Expected: `sequential: 1 2`, `parallel: [ 3, 4, 5 ]`, then `PASS: all unique`. The parallel case is the one that matters — it proves the transaction serialises concurrent allocations from different devices.

- [ ] **Step 4: Commit**

```bash
cd "laundry app" && git add src/services/SyncService.js && git commit -m "feat: allocate bill numbers from centralized Firestore counter"
```

---

### Task 3: Mobile storage refactor

`BillService.save()` currently derives the bill ID itself by scanning local bills for the day's maximum sequence (`storage.js:161-182`). That is exactly the logic that produces duplicate IDs across devices. It is replaced by an injected ID.

**Files:**
- Modify: `laundry app/src/services/storage.js`

**Interfaces:**
- Consumes: `formatBillId` from `../utils/helpers`
- Produces, all on `BillService`:
  - `save(billData, billId): Promise<Bill>` — **signature change**, ID now injected; sets `synced: false`
  - `markSynced(billId): Promise<void>`
  - `getPendingSync(): Promise<Bill[]>` — bills where `synced !== true`
  - `applyRemoteStatus(billId, status, completedAt): Promise<void>`
  - `cacheBills(bills): Promise<void>` — upsert bills fetched from the desktop
  - `delete(billId): Promise<void>`

- [ ] **Step 1: Replace the ID-generating block in `save()`**

In `laundry app/src/services/storage.js`, replace the whole body of `save` (currently lines 158-202) with:

```js
  /**
   * Save a new bill. The billId is allocated by the caller from the centralized
   * Firestore counter — this function never invents one, because locally-derived
   * sequences collide across devices.
   */
  async save(billData, billId) {
    if (!billId) throw new Error('billId is required — allocate it before saving.');
    const bills = await this.getAll();

    const newBill = {
      id: billId,
      customerId: billData.customerId,
      customerName: billData.customerName,
      customerCategory: billData.customerCategory || 'Student',
      mobile: billData.mobile,
      cartItems: billData.cartItems || [],
      totalWeight: billData.totalWeight || 0,
      totalClothesCount: billData.totalClothesCount || 0,
      totalAmount: billData.totalAmount,
      dueDate: billData.dueDate,
      status: 'Pending',
      createdAt: Date.now(),
      synced: false,
    };

    bills.push(newBill);
    await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills));
    return newBill;
  },
```

- [ ] **Step 2: Add the new methods**

Add these to the `BillService` object, immediately after `save`:

```js
  async markSynced(billId) {
    const bills = await this.getAll();
    const i = bills.findIndex((b) => b.id === billId);
    if (i !== -1) {
      bills[i].synced = true;
      await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills));
    }
  },

  async getPendingSync() {
    const bills = await this.getAll();
    return bills.filter((b) => b.synced !== true);
  },

  async applyRemoteStatus(billId, status, completedAt) {
    const bills = await this.getAll();
    const i = bills.findIndex((b) => b.id === billId);
    if (i === -1) return;
    bills[i].status = status;
    if (completedAt) bills[i].completedAt = completedAt;
    await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills));
  },

  /**
   * Upsert bills retrieved from the desktop archive so they behave exactly like
   * locally-created ones. Marked synced:true — the desktop already has them.
   */
  async cacheBills(remoteBills) {
    if (!remoteBills || remoteBills.length === 0) return;
    const bills = await this.getAll();
    const byId = new Map(bills.map((b) => [b.id, b]));
    for (const remote of remoteBills) {
      const id = remote.id || remote.billId;
      if (!id) continue;
      byId.set(id, { ...(byId.get(id) || {}), ...remote, id, synced: true });
    }
    await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(Array.from(byId.values())));
  },

  async delete(billId) {
    const bills = await this.getAll();
    await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(bills.filter((b) => b.id !== billId)));
  },
```

- [ ] **Step 3: Remove the now-unused import**

`formatBillId` and `generateBillId` may be imported at the top of `storage.js` but no longer used by `save`. Check line 4 (`import { generateId, generateBillId } from '../utils/helpers';`) and drop `generateBillId` if nothing else references it. Leave `generateId` — `CustomerService.add` still uses it.

- [ ] **Step 4: Verify nothing else calls the old signature**

```bash
cd "laundry app" && grep -rn "BillService.save" src/
```

Expected: exactly one hit, `src/screens/BillGenerationScreen.js:180`. It is updated in Task 10. Note it and move on.

- [ ] **Step 5: Commit**

```bash
cd "laundry app" && git add src/services/storage.js && git commit -m "refactor: inject bill ID into BillService.save, add sync/cache/delete methods"
```

---

### Task 4: Mobile push and pending flush

**Files:**
- Modify: `laundry app/src/services/SyncService.js`
- Verify: `scripts/verify/04-bill-lands-in-inbox.js`

**Interfaces:**
- Consumes: `allocateBillNumber` (Task 2), `BillService` (Task 3), `getDeviceId` (Task 1)
- Produces:
  - `pushBill(bill): Promise<void>` — writes `bills_inbox/{bill.id}`, then marks it synced locally
  - `flushPending(): Promise<number>` — pushes every unsynced bill, returns how many succeeded
  - `deleteRemoteBill(billId): Promise<void>` — removes a not-yet-ingested doc from `bills_inbox`

- [ ] **Step 1: Extend SyncService**

Append to `laundry app/src/services/SyncService.js`:

```js
import { deleteDoc, setDoc } from 'firebase/firestore';
import { db, ensureSignedIn, getDeviceId } from './firebase';
import { BillService } from './storage';

/**
 * Push one bill to the desktop. The doc ID is the bill ID, so re-pushing the
 * same bill overwrites rather than duplicating — this is what makes the
 * "sync all" action and the pending-flush safe to run repeatedly.
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
```

Merge the `doc` import with the existing one at the top rather than importing it twice.

- [ ] **Step 2: Write the verification script**

Create `scripts/verify/04-bill-lands-in-inbox.js`:

```js
// Throwaway verification tooling. Run with: node scripts/verify/04-bill-lands-in-inbox.js
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

(async () => {
  const app = initializeApp(config);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);
  const id = 'WR-260916-999';
  await setDoc(doc(db, 'bills_inbox', id), {
    billId: id, customerName: 'Verify Script', phone: '9999999999',
    cartItems: [], totalAmount: 123, status: 'Pending',
    createdByDevice: 'verify-script', createdAt: Date.now(),
  });
  const snap = await getDoc(doc(db, 'bills_inbox', id));
  console.log(snap.exists() ? 'PASS: doc written' : 'FAIL: doc missing');
  await deleteDoc(doc(db, 'bills_inbox', id));
  console.log('cleaned up');
  process.exit(snap.exists() ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
```

- [ ] **Step 3: Run it**

```bash
cd "laundry app" && node ../scripts/verify/04-bill-lands-in-inbox.js
```

Expected: `PASS: doc written` then `cleaned up`.

- [ ] **Step 4: Commit**

```bash
cd "laundry app" && git add src/services/SyncService.js && git commit -m "feat: push bills to Firestore inbox with pending flush"
```

---

### Task 5: Desktop sync module and bill ingestion

All Firestore work on the desktop lives in the **main process**, not the renderer. The renderer runs with `contextIsolation: true` and `nodeIntegration: false` (`main.js:9-13`), so it cannot require the SDK, and loading it from a CDN would add a network dependency for no benefit. The main process already owns the database, so the listeners belong beside it.

**Files:**
- Create: `laundry desktop/src/main/sync.js`
- Modify: `laundry desktop/src/main/database.js` (add `createdByDevice`, map it in `addBill`)
- Modify: `laundry desktop/src/main/main.js` (start sync after the window is ready)
- Modify: `laundry desktop/package.json` (add `firebase`)
- Verify: `scripts/verify/05-desktop-ingests.js`

**Interfaces:**
- Produces: `initSync({ onChange }): Promise<void>` — starts listeners; calls `onChange()` after every ingest so the UI can refresh.

- [ ] **Step 1: Add the dependency**

```bash
cd "laundry desktop" && npm install firebase@^11.0.0
```

- [ ] **Step 2: Add the `createdByDevice` column**

In `laundry desktop/src/main/database.js`, add to the `columnsToAdd` array (currently lines 33-41):

```js
    { name: 'createdByDevice', type: 'TEXT' },
```

Then in `addBill`, add alongside the other field mappings (after the `createdAt` line, around line 85):

```js
    const createdByDevice = bill.createdByDevice || null;
```

Add `createdByDevice = ?` to the UPDATE statement's SET list and `createdByDevice` to the INSERT column list, and pass `createdByDevice` in both `.run(...)` argument lists in the matching position. Both statements must stay positionally consistent with their placeholders.

- [ ] **Step 3: Create the sync module**

Create `laundry desktop/src/main/sync.js`:

```js
// sync.js — Firestore mailbox listeners. Runs in the Electron main process because
// the renderer is sandboxed (contextIsolation on, nodeIntegration off).
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

  onSnapshot(collection(fs, 'bills_inbox'), (snap) => {
    snap.docChanges().forEach(async (change) => {
      if (change.type === 'removed') return;
      const bill = change.doc.data();
      try {
        db.addBill(bill);
        await deleteDoc(doc(fs, 'bills_inbox', change.doc.id));
        if (onChange) onChange();
      } catch (e) {
        console.error('[Sync] ingest failed for', change.doc.id, e.message);
      }
    });
  }, (err) => console.error('[Sync] bills_inbox listener error:', err.message));
}

async function allocateBillNumber() {
  return runTransaction(fs, async (tx) => {
    const ref = doc(fs, 'counters', 'bill_number');
    const snap = await tx.get(ref);
    const next = snap.exists() ? (snap.data().next || 0) + 1 : 1;
    tx.set(ref, { next }, { merge: true });
    return next;
  });
}

module.exports = { initSync, allocateBillNumber };
```

- [ ] **Step 4: Start sync from main.js**

In `laundry desktop/src/main/main.js`, add near the top with the other requires:

```js
const { initSync } = require('./sync');
```

Then inside `app.whenReady().then(() => { ... })`, after `createWindow()`:

```js
  initSync({
    onChange: () => {
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('sync:changed'));
    },
  }).catch((e) => console.error('[Sync] init failed:', e.message));
```

- [ ] **Step 5: Write the verification script**

Create `scripts/verify/05-desktop-ingests.js`:

```js
// Throwaway verification tooling. Run with: node scripts/verify/05-desktop-ingests.js
// Requires the Electron desktop app to be RUNNING so its listener can consume the doc.
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, setDoc, getDoc } = require('firebase/firestore');

const config = {
  apiKey: 'AIzaSyDvf57bPgRR0jA_kilIKP-GXNeMRg_ryzY',
  authDomain: 'stress-monitor-7005a.firebaseapp.com',
  projectId: 'stress-monitor-7005a',
  storageBucket: 'stress-monitor-7005a.firebasestorage.app',
  messagingSenderId: '329659811223',
  appId: '1:329659811223:web:3e6aa4bb0018ee4bf5f0d2',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const app = initializeApp(config);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);
  const id = 'WR-260916-901';
  await setDoc(doc(db, 'bills_inbox', id), {
    billId: id, customerName: 'Ingest Test', phone: '9000000001',
    cartItems: [], totalAmount: 250, status: 'Pending',
    createdByDevice: 'verify-script', createdAt: Date.now(),
  });
  console.log('wrote', id, '- waiting 8s for desktop to ingest...');
  await sleep(8000);
  const snap = await getDoc(doc(db, 'bills_inbox', id));
  if (snap.exists()) {
    console.log('FAIL: doc still present — desktop did not ingest it');
    process.exit(1);
  }
  console.log('PASS: doc consumed and deleted by desktop');
  console.log('Now confirm the bill appears in the desktop table.');
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
```

- [ ] **Step 6: Run it**

Start the desktop app first (`cd "laundry desktop" && npm start`), then in a second terminal:

```bash
cd "laundry desktop" && node ../scripts/verify/05-desktop-ingests.js
```

Expected: `PASS: doc consumed and deleted by desktop`, and a row for `WR-260916-901` visible in the desktop table.

- [ ] **Step 7: Commit**

```bash
cd "laundry desktop" && git add . && git commit -m "feat: ingest bills from Firestore inbox into SQLite"
```

(If `laundry desktop` is not yet a git repo, run `git init` first and commit — the spec treats it as a tracked project.)

---

### Task 6: Desktop bill numbering

Desktop-created bills currently get `'ORD-' + random` (`app.js:26`), which is neither sequential nor consistent with mobile. They must draw from the same counter.

**Files:**
- Modify: `laundry desktop/src/main/main.js` (add `sync:allocateBillNumber` handler)
- Modify: `laundry desktop/src/main/preload.js`
- Modify: `laundry desktop/src/renderer/js/app.js:18-49`

**Interfaces:**
- Consumes: `allocateBillNumber` from `./sync` (Task 5)
- Produces: `window.api.allocateBillNumber(): Promise<{success, data?, error?}>`

- [ ] **Step 1: Add the IPC handler**

In `laundry desktop/src/main/main.js`, change the require to `const { initSync, allocateBillNumber } = require('./sync');` and add:

```js
ipcMain.handle('sync:allocateBillNumber', async () => {
  try {
    return { success: true, data: await allocateBillNumber() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

- [ ] **Step 2: Expose it in preload**

In `laundry desktop/src/main/preload.js`, add to the `exposeInMainWorld` object:

```js
  allocateBillNumber: () => ipcRenderer.invoke('sync:allocateBillNumber'),
  onSyncChanged: (cb) => ipcRenderer.on('sync:changed', cb),
```

- [ ] **Step 3: Use it when creating a bill**

In `laundry desktop/src/renderer/js/app.js`, replace line 26 (`const billId = 'ORD-' + ...`) with:

```js
        const numRes = await window.api.allocateBillNumber();
        if (!numRes.success) {
            alert('No internet connection — a bill number cannot be reserved. Please reconnect and try again.');
            return;
        }
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const billId = `WR-${yy}${mm}${dd}-${String(numRes.data).padStart(3, '0')}`;
```

Then delete the `window.sendDataChannelMessage` block at lines 41-44 — desktop bills are never uploaded.

- [ ] **Step 4: Auto-refresh on ingest**

At the end of the `DOMContentLoaded` handler in `app.js`, add:

```js
    if (window.api.onSyncChanged) window.api.onSyncChanged(() => loadBills());
```

- [ ] **Step 5: Verify manually**

Start the desktop app, create an order through the New Order form. Expected: the new row's ID reads `WR-YYMMDD-NNN` continuing the counter (not `ORD-XXXXXX`), and re-running `scripts/verify/01-auth-and-counter.js` shows the counter incremented.

- [ ] **Step 6: Commit**

```bash
cd "laundry desktop" && git add . && git commit -m "feat: allocate desktop bill numbers from shared counter"
```

---

### Task 7: Remote search

**Files:**
- Modify: `laundry desktop/src/main/database.js` (add lookups)
- Modify: `laundry desktop/src/main/sync.js` (serve `search_requests`)
- Modify: `laundry app/src/services/SyncService.js` (request side)
- Verify: `scripts/verify/07-remote-search.js`

**Interfaces:**
- Produces on `database.js`: `findBillById(billId): Bill|undefined`, `findBillsByPhone(phone): Bill[]`
- Produces on mobile `SyncService`: `requestRemoteSearch(query): Promise<Bill[]>` — resolves `[]` after a 10s timeout if the desktop does not answer

- [ ] **Step 1: Add the SQLite lookups**

In `laundry desktop/src/main/database.js`, add to the exported object:

```js
  findBillById: (billId) => {
    const row = db.prepare('SELECT * FROM bills WHERE billId = ?').get(billId);
    if (!row) return undefined;
    return { ...row, cartItems: safeJsonParse(row.cartItems, []) };
  },

  findBillsByPhone: (phone) => {
    const rows = db.prepare('SELECT * FROM bills WHERE phone = ? ORDER BY timestamp DESC').all(phone);
    return rows.map((row) => ({ ...row, cartItems: safeJsonParse(row.cartItems, []) }));
  },
```

- [ ] **Step 2: Serve search requests**

In `laundry desktop/src/main/sync.js`, inside `initSync` after the `bills_inbox` listener, add:

```js
  onSnapshot(collection(fs, 'search_requests'), (snap) => {
    snap.docChanges().forEach(async (change) => {
      if (change.type === 'removed') return;
      const req = change.doc.data();
      const requestId = change.doc.id;
      try {
        const query = String(req.query || '').trim();
        // Exact bill ID first, then exact phone number. Deliberately narrow —
        // substring search stays local on the phone.
        const byId = db.findBillById(query);
        const results = byId ? [byId] : db.findBillsByPhone(query);
        await setDoc(
          doc(fs, 'device_inbox', req.deviceId, 'messages', requestId),
          { type: 'search-response', requestId, bills: results, sentAt: Date.now() }
        );
        await deleteDoc(doc(fs, 'search_requests', requestId));
      } catch (e) {
        console.error('[Sync] search failed for', requestId, e.message);
      }
    });
  }, (err) => console.error('[Sync] search_requests listener error:', err.message));
```

- [ ] **Step 3: Add the mobile request side**

Append to `laundry app/src/services/SyncService.js`. Add `onSnapshot` to the **existing** `firebase/firestore` import line rather than writing a second import statement from the same module — by this point that line should read `import { doc, runTransaction, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';`.

```js
const SEARCH_TIMEOUT_MS = 10000;

/**
 * Ask the desktop archive for a bill this phone does not have. Resolves [] if the
 * shop computer is not running — callers should tell the user that, not fail silently.
 */
export async function requestRemoteSearch(query) {
  await ensureSignedIn();
  const deviceId = await getDeviceId();
  const requestId = `${deviceId}-${Date.now()}`;
  const replyRef = doc(db, 'device_inbox', deviceId, 'messages', requestId);

  return new Promise(async (resolve) => {
    let settled = false;
    const finish = async (bills) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      try { await deleteDoc(replyRef); } catch (e) {}
      resolve(bills);
    };

    const timer = setTimeout(() => finish([]), SEARCH_TIMEOUT_MS);
    const unsub = onSnapshot(replyRef, (snap) => {
      if (snap.exists()) finish(snap.data().bills || []);
    });

    try {
      await setDoc(doc(db, 'search_requests', requestId), {
        deviceId, query, createdAt: Date.now(),
      });
    } catch (e) {
      finish([]);
    }
  });
}
```

- [ ] **Step 4: Write the verification script**

Create `scripts/verify/07-remote-search.js`:

```js
// Throwaway verification tooling. Run with: node scripts/verify/07-remote-search.js
// Requires the desktop app RUNNING and at least one bill in its database.
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
const BILL_ID = process.argv[2] || 'WR-260916-901';

(async () => {
  const app = initializeApp(config);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);
  const deviceId = 'verify-device';
  const requestId = `${deviceId}-${Date.now()}`;

  await setDoc(doc(db, 'search_requests', requestId), {
    deviceId, query: BILL_ID, createdAt: Date.now(),
  });
  console.log('asked desktop for', BILL_ID, '- waiting 8s...');
  await sleep(8000);

  const reply = await getDoc(doc(db, 'device_inbox', deviceId, 'messages', requestId));
  if (!reply.exists()) {
    console.log('FAIL: no reply — is the desktop app running?');
    process.exit(1);
  }
  const bills = reply.data().bills || [];
  console.log('reply contained', bills.length, 'bill(s):', bills.map((b) => b.billId));
  await deleteDoc(doc(db, 'device_inbox', deviceId, 'messages', requestId));
  console.log(bills.length > 0 ? 'PASS' : 'FAIL: empty result');
  process.exit(bills.length > 0 ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
```

- [ ] **Step 5: Run it**

With the desktop running:

```bash
cd "laundry desktop" && node ../scripts/verify/07-remote-search.js WR-260916-901
```

Expected: `reply contained 1 bill(s): [ 'WR-260916-901' ]` then `PASS`.

- [ ] **Step 6: Commit**

Commit both repos:

```bash
cd "laundry desktop" && git add . && git commit -m "feat: serve mobile search requests from SQLite archive"
cd "../laundry app" && git add src/services/SyncService.js && git commit -m "feat: request remote bill lookup from desktop"
```

---

### Task 8: Status sync, desktop to mobile

**Files:**
- Modify: `laundry desktop/src/main/sync.js` (add `pushStatus`)
- Modify: `laundry desktop/src/main/main.js` (push after status update)
- Modify: `laundry desktop/src/renderer/js/app.js:142-151` (drop the WebRTC broadcast)
- Modify: `laundry app/src/services/SyncService.js` (inbox subscription)

**Interfaces:**
- Produces on desktop `sync.js`: `pushStatus(billId, status, completedAt, deviceId): Promise<void>`
- Produces on mobile `SyncService`: `subscribeToDeviceInbox(): Promise<() => void>` — applies status messages and deletes them; returns an unsubscribe function

- [ ] **Step 1: Add `pushStatus` to desktop sync.js**

```js
async function pushStatus(billId, status, completedAt, deviceId) {
  if (!fs || !deviceId) return;
  const messageId = `status-${billId}-${Date.now()}`;
  await setDoc(doc(fs, 'device_inbox', deviceId, 'messages', messageId), {
    type: 'status', billId, status, completedAt: completedAt || null, sentAt: Date.now(),
  });
}
```

Add `pushStatus` to `module.exports`.

- [ ] **Step 2: Push whenever the desktop changes a status**

In `laundry desktop/src/main/main.js`, replace the `db:updateBillStatus` handler with:

```js
ipcMain.handle('db:updateBillStatus', async (event, { id, status }) => {
  try {
    db.updateBillStatus(id, status);
    const bill = db.findBillById(id);
    if (bill && bill.createdByDevice) {
      await pushStatus(id, status, bill.completedAt, bill.createdByDevice).catch(() => {});
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

Update the require to include `pushStatus`.

- [ ] **Step 3: Drop the dead WebRTC broadcast in the renderer**

In `laundry desktop/src/renderer/js/app.js`, remove lines 145-148 (the `window.sendDataChannelMessage` block inside `markCompleted`). The main process now handles propagation.

- [ ] **Step 4: Subscribe on mobile**

Append to `laundry app/src/services/SyncService.js`:

```js
/**
 * Listen to this device's private inbox. Partitioned per device so that with
 * several phones in the shop, one phone cannot consume another phone's messages.
 */
export async function subscribeToDeviceInbox() {
  await ensureSignedIn();
  const deviceId = await getDeviceId();
  const inbox = collection(db, 'device_inbox', deviceId, 'messages');

  return onSnapshot(inbox, (snap) => {
    snap.docChanges().forEach(async (change) => {
      if (change.type === 'removed') return;
      const msg = change.doc.data();
      if (msg.type !== 'status') return; // search-response is consumed by requestRemoteSearch
      try {
        await BillService.applyRemoteStatus(msg.billId, msg.status, msg.completedAt);
        await deleteDoc(change.doc.ref);
      } catch (e) {
        console.warn('[Sync] failed applying status', msg.billId, e.message);
      }
    });
  }, (err) => console.warn('[Sync] inbox listener error:', err.message));
}
```

Add `collection` to the `firebase/firestore` import.

- [ ] **Step 5: Verify manually**

Run the desktop app and the mobile app. Create a bill on mobile, confirm it appears on desktop, press **Complete** on the desktop row, and confirm the bill flips to Completed on the phone within a few seconds without any user action.

- [ ] **Step 6: Commit**

```bash
cd "laundry desktop" && git add . && git commit -m "feat: push status changes to the originating mobile device"
cd "../laundry app" && git add src/services/SyncService.js && git commit -m "feat: apply desktop status updates from device inbox"
```

---

### Task 9: Deletion on both sides

**Files:**
- Modify: `laundry desktop/src/main/database.js` (add `deleteBill`)
- Modify: `laundry desktop/src/main/main.js` (add `db:deleteBill`)
- Modify: `laundry desktop/src/main/preload.js`
- Modify: `laundry desktop/src/renderer/js/app.js` (Delete button per row)

**Interfaces:**
- Produces: `window.api.deleteBill(billId)`, `window.deleteBill(billId)` for the inline handler

- [ ] **Step 1: Add the SQLite delete**

In `database.js`:

```js
  deleteBill: (billId) => {
    db.prepare('DELETE FROM bills WHERE billId = ?').run(billId);
  },
```

- [ ] **Step 2: Add the IPC handler in main.js**

```js
ipcMain.handle('db:deleteBill', (event, billId) => {
  try {
    db.deleteBill(billId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

- [ ] **Step 3: Expose it in preload.js**

```js
  deleteBill: (billId) => ipcRenderer.invoke('db:deleteBill', billId),
```

- [ ] **Step 4: Add the button**

In `renderer/js/app.js`, inside the actions `<td>` in `renderTable`, append after the existing Complete/date markup:

```js
                <button class="btn secondary" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; margin-left: 0.3rem;" onclick="deleteBill('${bill.billId}')">Delete</button>
```

And add at module scope:

```js
window.deleteBill = async (billId) => {
    if (!confirm(`Delete bill ${billId}? This removes it from the shop archive permanently.`)) return;
    const res = await window.api.deleteBill(billId);
    if (res.success) loadBills();
};
```

- [ ] **Step 5: Add the mobile delete action**

The spec requires deleting on the phone to remove the local copy *and* any `bills_inbox` doc the desktop has not yet ingested. `BillService.delete` (Task 3) and `deleteRemoteBill` (Task 4) already exist; this wires them to the UI.

In `laundry app/src/screens/HistoryScreen.js`, add the import:

```js
import { deleteRemoteBill } from '../services/SyncService';
```

Add the handler alongside the other handlers:

```js
  const handleDeleteBill = (bill) => {
    Alert.alert(
      'Delete Bill',
      `Remove ${bill.id} from this phone? The shop's copy is not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRemoteBill(bill.id);
            await BillService.delete(bill.id);
            loadBills();
          },
        },
      ]
    );
  };
```

Then make each row long-pressable. In `renderItem`, wrap the returned `<BillCard ... />` in:

```js
      <TouchableOpacity onLongPress={() => handleDeleteBill(item)} activeOpacity={1}>
        {/* existing <BillCard ... /> unchanged */}
      </TouchableOpacity>
```

Wrapping rather than adding a prop means this works without changing `BillCard`'s interface. Add `TouchableOpacity` to the existing `react-native` import, and confirm `BillService` is imported (it already is, for the list itself).

- [ ] **Step 6: Verify manually**

Delete a bill on the desktop. Expected: the row disappears and stays gone after restarting the app, proving it left SQLite rather than just the DOM.

Then on mobile, long-press a bill and delete it. Expected: it disappears from the phone's list, and the desktop's copy remains — the two archives are independent by design.

- [ ] **Step 7: Commit**

```bash
cd "laundry desktop" && git add . && git commit -m "feat: delete bills from the desktop archive"
cd "../laundry app" && git add src/screens/HistoryScreen.js && git commit -m "feat: delete bills from the phone"
```

---

### Task 10: Mobile UI rewire

**Files:**
- Create: `laundry app/src/services/SyncContext.js`
- Delete: `laundry app/src/services/WebRTCContext.js`
- Modify: `laundry app/App.js:10,16,21`
- Modify: `laundry app/src/components/SyncStatusBadge.js`
- Modify: `laundry app/src/screens/BillGenerationScreen.js:21,28,180-191`
- Modify: `laundry app/src/screens/HistoryScreen.js:13,55,174-221`
- Modify: `laundry app/src/screens/SettingsScreen.js:10,154,240,244`

**Interfaces:**
- Produces: `useSync()` returning `{ isOnline, pendingCount, flush, syncBill, searchRemote }`

- [ ] **Step 1: Create SyncContext**

Create `laundry app/src/services/SyncContext.js`:

```js
// SyncContext.js — exposes Firestore sync state to the UI.
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { ensureSignedIn } from './firebase';
import { BillService } from './storage';
import { flushPending, pushBill, requestRemoteSearch, subscribeToDeviceInbox } from './SyncService';

const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const [isOnline, setIsOnline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const mounted = useRef(true);

  const refreshPending = async () => {
    const pending = await BillService.getPendingSync();
    if (mounted.current) setPendingCount(pending.length);
  };

  useEffect(() => {
    mounted.current = true;
    let unsub = null;
    (async () => {
      try {
        await ensureSignedIn();
        if (mounted.current) setIsOnline(true);
        unsub = await subscribeToDeviceInbox();
        await flushPending();
      } catch (e) {
        if (mounted.current) setIsOnline(false);
      }
      await refreshPending();
    })();
    return () => {
      mounted.current = false;
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const flush = async () => {
    const n = await flushPending();
    await refreshPending();
    return n;
  };

  const syncBill = async (bill) => {
    try {
      await pushBill(bill);
      setIsOnline(true);
    } catch (e) {
      setIsOnline(false);
    }
    await refreshPending();
  };

  return (
    <SyncContext.Provider value={{ isOnline, pendingCount, flush, syncBill, searchRemote: requestRemoteSearch }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within a SyncProvider');
  return ctx;
}
```

- [ ] **Step 2: Swap the provider in App.js**

Replace line 10 with `import { SyncProvider } from './src/services/SyncContext';`, and rename the `<WebRTCProvider>` / `</WebRTCProvider>` tags on lines 16 and 21 to `<SyncProvider>` / `</SyncProvider>`.

- [ ] **Step 3: Rewrite SyncStatusBadge**

Replace the body of `laundry app/src/components/SyncStatusBadge.js` with:

```js
// SyncStatusBadge.js — cloud sync status pill. Tapping it retries pending bills.
import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSync } from '../services/SyncContext';

export default function SyncStatusBadge({ onPress }) {
  const { isOnline, pendingCount, flush } = useSync();

  const color = isOnline ? '#10B981' : '#EF4444';
  const icon = isOnline ? 'cloud-check' : 'cloud-off-outline';
  const label = isOnline ? 'Cloud Connected' : 'Offline';

  const handlePress = async () => {
    if (onPress) onPress();
    await flush();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View style={[styles.pill, { borderColor: color }]}>
        <MaterialCommunityIcons name={icon} size={16} color={color} />
        <Text style={[styles.label, { color }]}>{label}</Text>
        {pendingCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingCount} pending</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  label: { fontSize: 12, fontWeight: '700' },
  badge: { backgroundColor: '#F59E0B', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, color: '#FFFFFF', fontWeight: '700' },
});
```

- [ ] **Step 4: Update BillGenerationScreen**

Change line 21 to `import { useSync } from '../services/SyncContext';` and line 28 to `const { syncBill } = useSync();`. Add `import { allocateBillNumber } from '../services/SyncService';` and `import { formatBillId } from '../utils/helpers';`.

Replace lines 180-191 with:

```js
      let billNumber;
      try {
        billNumber = await allocateBillNumber();
      } catch (e) {
        setSnackbar({
          visible: true,
          message: 'No internet connection — a bill number cannot be reserved. Please reconnect and try again.',
        });
        setLoading(false);
        return;
      }

      const now = new Date();
      const datePrefix = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const billId = formatBillId(datePrefix, billNumber);

      const bill = await BillService.save({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerCategory: selectedCustomer.category || 'Student',
        mobile: selectedCustomer.mobile,
        cartItems: cart,
        totalWeight,
        totalClothesCount,
        totalAmount: Math.round(totalAmount * 100) / 100,
      }, billId);

      setGeneratedBill(bill);
      syncBill(bill);
      setModalVisible(true);
```

- [ ] **Step 5: Update HistoryScreen**

Change line 13 to `import { useSync } from '../services/SyncContext';` and line 55 to `const { syncBill, isOnline, flush, searchRemote } = useSync();`.

Replace `handleBatchSync` (lines 174-207) with:

```js
  const handleBatchSync = async () => {
    setSyncing(true);
    const count = await flush();
    setSyncing(false);
    Alert.alert(
      count > 0 ? 'Sync Complete' : 'Nothing to Sync',
      count > 0
        ? `Sent ${count} bill${count !== 1 ? 's' : ''} to the Command Center.`
        : 'All bills are already synced.',
      [{ text: 'OK' }]
    );
  };
```

Replace `handleSingleSync` (lines 210-221) with:

```js
  const handleSingleSync = async (bill) => {
    await syncBill(bill);
    Alert.alert('Synced', `Bill ${bill.id} sent to the Command Center.`);
  };
```

Now add the remote fallback. **Do not put it inside `handleSearch`** (lines 88-97): that runs on every keystroke via `onChangeText` (line 337), so a remote lookup there would issue one Firestore write plus a listener for every character typed. Trigger it on submit instead.

Leave `handleSearch` exactly as it is, and add beside it:

```js
  const handleSearchSubmit = async () => {
    const query = searchQuery.trim();
    if (query.length === 0) return;

    const local = await BillService.search(query);
    if (local.length > 0) return; // already displayed by handleSearch

    setSyncing(true);
    const remote = await searchRemote(query);
    setSyncing(false);

    if (remote.length === 0) {
      Alert.alert(
        'Not Found',
        'No matching bill on this phone, and the shop computer did not respond. It may be switched off.'
      );
      return;
    }

    await BillService.cacheBills(remote);
    await loadBills();
    Alert.alert('Found', `Retrieved ${remote.length} bill${remote.length !== 1 ? 's' : ''} from the shop archive.`);
  };
```

Then wire it to the Searchbar at line 337 by adding one prop alongside the existing `onChangeText` and `value`:

```js
          onSubmitEditing={handleSearchSubmit}
```

Remote lookup matches on exact bill ID or exact phone number only, so pressing the keyboard's search key after typing a full value is the right trigger. `loadBills` (line 77) re-reads both tabs from AsyncStorage, which is what surfaces the newly cached bill.

- [ ] **Step 6: Remove the pairing modal from Settings**

In `laundry app/src/screens/SettingsScreen.js`, delete the `import PairingModal from '../components/PairingModal';` on line 10, delete the `<PairingModal ... />` element on line 244, and remove the `pairingVisible` state along with the `onPress={() => setPairingVisible(true)}` props on lines 154 and 240 (the badge handles its own press now — pass no `onPress`).

- [ ] **Step 7: Delete the dead files**

```bash
cd "laundry app" && rm src/services/WebRTCContext.js src/components/PairingModal.js
```

- [ ] **Step 8: Verify**

```bash
cd "laundry app" && grep -rn "useWebRTC\|WebRTCProvider\|PairingModal" src/ App.js
```

Expected: no output. Then `npm start` and confirm the app boots, Settings shows "Cloud Connected", and generating a bill produces a `WR-YYMMDD-NNN` ID.

- [ ] **Step 9: Commit**

```bash
cd "laundry app" && git add -A && git commit -m "refactor: replace WebRTC context with Firestore sync context"
```

---

### Task 11: Remove WebRTC and clean up

**Files:**
- Delete: `laundry app/src/services/WebRTCManager.js`
- Delete: `laundry desktop/src/renderer/js/webrtc.js`, `laundry desktop/src/renderer/js/qr-modal.js`
- Modify: `laundry app/package.json`, `laundry app/app.json`
- Modify: `laundry desktop/package.json`, `laundry desktop/src/renderer/index.html`, `laundry desktop/src/main/main.js`

- [ ] **Step 1: Delete the mobile manager and its dependencies**

```bash
cd "laundry app" && rm src/services/WebRTCManager.js && npm uninstall react-native-webrtc @config-plugins/react-native-webrtc
```

- [ ] **Step 2: Clean app.json**

In `laundry app/app.json`, remove `"@config-plugins/react-native-webrtc"` from the `plugins` array, and remove `"android.permission.RECORD_AUDIO"` from `android.permissions`. Keep the `expo-camera` plugin and `android.permission.CAMERA` — `QRScannerScreen` needs them.

- [ ] **Step 3: Delete the desktop transport and QR pairing modal**

```bash
cd "laundry desktop" && rm src/renderer/js/webrtc.js src/renderer/js/qr-modal.js && npm uninstall qrcode
```

- [ ] **Step 4: Remove the QR IPC handler**

In `laundry desktop/src/main/main.js`, delete the `const QRCode = require('qrcode');` line and the whole `ipcMain.handle('app:generateQR', ...)` block (lines 62-77).

- [ ] **Step 5: Clean preload.js**

Remove the `generateQR: (text) => ipcRenderer.invoke('app:generateQR', text)` entry.

- [ ] **Step 6: Clean index.html**

Remove the `<script src="js/webrtc.js">` and `<script src="js/qr-modal.js">` tags, and delete the `#qr-modal` pairing element and any button that opens it. Keep `#connection-status`, `#metric-sync`, and the other metric elements — but confirm nothing else references `#pairing-status-text`; if that element only existed for pairing, remove it too.

- [ ] **Step 7: Update the desktop connection indicator**

The old `updateConnectionUI` lived in the deleted `webrtc.js`. Add to `laundry desktop/src/main/sync.js` inside `initSync`, right after `fs = getFirestore(app);`:

```js
  if (onChange) onChange();
```

and in `renderer/js/app.js`, set the indicator once at startup since Firestore handles reconnection itself:

```js
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
        statusEl.classList.add('online');
        statusEl.classList.remove('offline');
        const t = statusEl.querySelector('.text');
        if (t) t.textContent = 'Cloud Sync Active';
    }
    const metricSync = document.getElementById('metric-sync');
    if (metricSync) {
        metricSync.textContent = 'Online';
        metricSync.classList.add('sync-online');
        metricSync.classList.remove('sync-offline');
    }
```

- [ ] **Step 8: Verify nothing references the old transport**

```bash
cd "C:/Users/sandeep.m.k/Desktop/main" && grep -rn "webrtc\|WebRTC\|sendDataChannelMessage\|currentRoomId\|generateQR\|metered\|signaling" "laundry app/src" "laundry app/App.js" "laundry app/app.json" "laundry desktop/src" --include=*.js --include=*.json --include=*.html
```

Expected: no output.

- [ ] **Step 9: Full end-to-end check**

Start both apps. Confirm in order: mobile shows "Cloud Connected"; creating a bill on mobile yields `WR-YYMMDD-NNN` and appears on the desktop within seconds; marking it Complete on the desktop flips it on the phone; searching the phone for a bill ID it does not hold retrieves it from the desktop; turning off the phone's data and attempting a new bill shows the "No internet connection" message rather than creating one.

- [ ] **Step 10: Commit**

```bash
cd "laundry app" && git add -A && git commit -m "chore: remove WebRTC transport and its dependencies"
cd "../laundry desktop" && git add -A && git commit -m "chore: remove WebRTC transport and QR pairing"
```

- [ ] **Step 11: Update CLAUDE.md**

The "Sync architecture" section of `CLAUDE.md` describes the WebRTC design in detail and is now entirely wrong. Rewrite it to describe the Firestore mailbox: the four collections, the transient-deletion rule, the centralized counter, that the desktop's SQLite is the only durable archive, and that desktop-created bills are never uploaded. Commit it.

---

## Notes for the executor

- **Two git repos.** `laundry app` is a repo; `laundry desktop` may not be (run `git init` if so). The root `main/` folder is not a repo — `firebase.json`, `.firebaserc`, `firestore.rules`, `docs/`, and `scripts/` live there untracked unless you initialise it.
- **Rules are already deployed.** Do not re-run `firebase init firestore`; it would overwrite `firestore.rules`.
- **The counter is live.** Running the Task 2 verification script consumes real bill numbers. That is harmless (gaps are acceptable) but do not be surprised when the first real bill is not number 1.
- **Order matters for Tasks 5-8.** The desktop must be running for any verification script that expects it to answer.
