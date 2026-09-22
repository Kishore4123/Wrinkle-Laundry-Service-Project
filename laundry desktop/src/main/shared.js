// shared.js — durable shared state (pricing, customers, device registry).
//
// Separate from sync.js, which handles the transient bill mailbox. These three
// collections live in Firestore permanently because every device must see the
// same current value. SQLite holds a mirror so the desktop still works offline.
const {
  doc, collection, onSnapshot, setDoc, deleteDoc, getDoc,
} = require('firebase/firestore');
const db = require('./database');
const DEFAULT_PRICING = require('./defaultPricing');

const PRICING_KEY = 'pricing';

let fs = null;
let notify = null;

function init(firestore, onChange) {
  fs = firestore;
  notify = onChange;

  // Pricing — a single document mirrored into app_config.
  onSnapshot(
    doc(fs, 'config', 'pricing'),
    (snap) => {
      if (!snap.exists()) return;
      db.setConfig(PRICING_KEY, snap.data().categories || {});
      if (notify) notify('pricing');
    },
    (err) => console.error('[Shared] pricing listener error:', err.message)
  );

  // Customers — mirrored row by row so deletes elsewhere remove the local copy.
  onSnapshot(
    collection(fs, 'customers'),
    (snap) => {
      snap.docChanges().forEach((change) => {
        try {
          if (change.type === 'removed') db.deleteCustomer(change.doc.id);
          else db.upsertCustomer(change.doc.data());
        } catch (e) {
          console.error('[Shared] customer mirror failed:', e.message);
        }
      });
      if (snap.docChanges().length && notify) notify('customers');
    },
    (err) => console.error('[Shared] customers listener error:', err.message)
  );

  // Devices — kept in memory only; the desktop is the one that edits them.
  onSnapshot(
    collection(fs, 'devices'),
    (snap) => {
      deviceCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (notify) notify('devices');
    },
    (err) => console.error('[Shared] devices listener error:', err.message)
  );

  // Expenses — durable and shared, so every desktop in the shop sees one set
  // of books rather than each keeping its own.
  onSnapshot(
    collection(fs, 'expenses'),
    (snap) => {
      snap.docChanges().forEach((change) => {
        try {
          if (change.type === 'removed') db.deleteExpense(change.doc.id);
          else db.upsertExpense(change.doc.data());
        } catch (e) {
          console.error('[Shared] expense mirror failed:', e.message);
        }
      });
      if (snap.docChanges().length && notify) notify('expenses');
    },
    (err) => console.error('[Shared] expenses listener error:', err.message)
  );

  // The shared bill archive. Every bill ends up here — whether a phone sent it
  // through bills_inbox or a Command Center raised it directly — so a second
  // desktop sees the same history. The inbox stays a consume-and-delete mailbox;
  // whichever desktop drains it republishes the bill here as a durable record.
  onSnapshot(
    collection(fs, 'bills'),
    (snap) => {
      let touched = 0;
      snap.docChanges().forEach((change) => {
        try {
          if (change.type === 'removed') {
            db.deleteBill(change.doc.id);
          } else {
            // fromCloud marks it already published, so mirroring cannot echo back.
            db.addBill(change.doc.data(), { fromCloud: true });
          }
          touched++;
        } catch (e) {
          console.error('[Shared] bill mirror failed:', change.doc.id, e.message);
        }
      });
      if (touched && notify) notify('bills');
    },
    (err) => console.error('[Shared] bills listener error:', err.message)
  );

  // The shared revenue ledger. Kept separate from bills because deleting a bill
  // must never erase money that was collected — the ledger has no delete path.
  onSnapshot(
    collection(fs, 'ledger'),
    (snap) => {
      let touched = 0;
      snap.docChanges().forEach((change) => {
        if (change.type === 'removed') return;
        try {
          db.mirrorLedgerEntry(change.doc.data());
          touched++;
        } catch (e) {
          console.error('[Shared] ledger mirror failed:', change.doc.id, e.message);
        }
      });
      if (touched && notify) notify('bills');
    },
    (err) => console.error('[Shared] ledger listener error:', err.message)
  );
}

// ── Publishing to the shared archive ───────────────────────────────────────

async function publishBill(bill) {
  if (!fs) return false;
  const billId = bill.billId || bill.id;
  if (!billId) return false;
  await setDoc(doc(fs, 'bills', billId), {
    ...bill,
    billId,
    cartItems: typeof bill.cartItems === 'string' ? bill.cartItems : JSON.stringify(bill.cartItems || []),
    publishedByDesk: deskId,
    publishedAt: Date.now(),
  });
  db.markBillPublished(billId);
  return true;
}

async function publishLedgerEntry(entry) {
  if (!fs) return false;
  await setDoc(doc(fs, 'ledger', entry.billId), {
    billId: entry.billId,
    amount: entry.amount || 0,
    weight: entry.weight || 0,
    customerCategory: entry.customerCategory || 'Student',
    customerId: entry.customerId || null,
    customerName: entry.customerName || null,
    services: entry.services || '[]',
    collectedAt: entry.collectedAt || Date.now(),
    publishedByDesk: deskId,
  });
  db.markLedgerPublished(entry.billId);
  return true;
}

async function removeBillEverywhere(billId) {
  db.deleteBill(billId);
  if (!fs) return;
  try {
    await deleteDoc(doc(fs, 'bills', billId));
  } catch (e) {
    console.warn('[Shared] bill delete failed:', e.message);
  }
  // The ledger entry is deliberately left alone.
}

/**
 * Carry anything this machine holds but has never published up to the cloud.
 *
 * On a machine that has been running since before the shared archive existed,
 * this is what uploads its whole history — phone bills consumed from the
 * mailbox and every revenue entry — so a newly installed Command Center can
 * see it.
 */
async function publishPending() {
  if (!fs) return { bills: 0, ledger: 0 };
  let bills = 0, ledger = 0;

  for (let pass = 0; pass < 50; pass++) {
    const batch = db.getUnpublishedBills(100);
    if (!batch.length) break;
    for (const bill of batch) {
      try { if (await publishBill(bill)) bills++; }
      catch (e) {
        console.warn('[Shared] backfill bill failed:', bill.billId, e.message);
        // Stop rather than spin on a failing row.
        return { bills, ledger };
      }
    }
  }

  for (let pass = 0; pass < 50; pass++) {
    const batch = db.getUnpublishedLedger(100);
    if (!batch.length) break;
    for (const entry of batch) {
      try { if (await publishLedgerEntry(entry)) ledger++; }
      catch (e) {
        console.warn('[Shared] backfill ledger failed:', entry.billId, e.message);
        return { bills, ledger };
      }
    }
  }

  if (bills || ledger) {
    console.log(`[Shared] backfilled ${bills} bill(s) and ${ledger} ledger entr(ies) to the shared archive`);
  }
  return { bills, ledger };
}

// Identifies this particular desktop, so shared records it wrote can be told
// apart from ones another desktop wrote.
let deskId = null;
function setDeskId(id) { deskId = id; }

let deviceCache = [];

// ── Pricing ────────────────────────────────────────────────────────────────

function getPricing() {
  return db.getConfig(PRICING_KEY) || {};
}

async function savePricing(categories) {
  if (!fs) throw new Error('Not connected to the cloud.');
  await setDoc(doc(fs, 'config', 'pricing'), {
    categories,
    updatedAt: Date.now(),
    updatedByDevice: 'desktop',
  });
  db.setConfig(PRICING_KEY, categories);
}

// ── Customers ──────────────────────────────────────────────────────────────

async function saveCustomer(customer) {
  if (!fs) throw new Error('Not connected to the cloud.');
  const record = {
    ...customer,
    updatedAt: Date.now(),
    createdAt: customer.createdAt || Date.now(),
    synced: true,
  };
  await setDoc(doc(fs, 'customers', record.id), record);
  db.upsertCustomer(record);
  return record;
}

async function removeCustomer(id) {
  if (!fs) throw new Error('Not connected to the cloud.');
  await deleteDoc(doc(fs, 'customers', id));
  db.deleteCustomer(id);
}

/**
 * Add lifetime stats to a customer and republish, mirroring what mobile does
 * when a bill is marked paid.
 */
async function addCustomerStats(id, weight, amount) {
  const updated = db.addCustomerStats(id, weight, amount);
  if (updated && fs) {
    try {
      await setDoc(doc(fs, 'customers', id), { ...updated, synced: true }, { merge: true });
    } catch (e) {
      console.warn('[Shared] stat republish failed:', e.message);
    }
  }
  return updated;
}

// ── Expenses ───────────────────────────────────────────────────────────────

async function saveExpense(expense) {
  const record = {
    ...expense,
    updatedAt: Date.now(),
    createdAt: expense.createdAt || Date.now(),
    recordedBy: expense.recordedBy || deskId,
  };
  const saved = db.upsertExpense(record);
  if (fs) {
    try {
      await setDoc(doc(fs, 'expenses', record.id), record);
    } catch (e) {
      console.warn('[Shared] expense publish failed:', e.message);
    }
  }
  return saved;
}

async function removeExpense(id) {
  db.deleteExpense(id);
  if (fs) {
    try { await deleteDoc(doc(fs, 'expenses', id)); } catch (e) {}
  }
}

// ── Devices ────────────────────────────────────────────────────────────────

function listDevices() {
  return deviceCache;
}

/**
 * Tell every registered phone that a bill's status changed.
 *
 * Broadcast rather than addressed to the originating device: with several
 * phones in the shop, any of them may have pulled the bill down via search,
 * and each applies the update only if it actually holds that bill.
 */
async function broadcastStatus(billId, status, completedAt) {
  if (!fs) return 0;
  const targets = deviceCache.filter((d) => !d.isDesktop && d.deviceId);
  let sent = 0;
  for (const device of targets) {
    const messageId = `status-${billId}-${Date.now()}`;
    try {
      await setDoc(doc(fs, 'device_inbox', device.deviceId, 'messages', messageId), {
        type: 'status',
        billId,
        status,
        completedAt: completedAt || null,
        sentAt: Date.now(),
      });
      sent++;
    } catch (e) {
      console.warn('[Shared] status push failed for', device.deviceId, e.message);
    }
  }
  return sent;
}

async function setDevicePermission(deviceId, canCustomize) {
  if (!fs) throw new Error('Not connected to the cloud.');
  await setDoc(doc(fs, 'devices', deviceId), { canCustomize: !!canCustomize }, { merge: true });
}

async function renameDevice(deviceId, name) {
  if (!fs) throw new Error('Not connected to the cloud.');
  await setDoc(doc(fs, 'devices', deviceId), { name }, { merge: true });
}

async function forgetDevice(deviceId) {
  if (!fs) throw new Error('Not connected to the cloud.');
  await deleteDoc(doc(fs, 'devices', deviceId));
}

/**
 * Publish the built-in defaults if this shop has no pricing yet, so whichever
 * app opens first seeds the shared config. Mobile does the same — whoever gets
 * there first wins and the other sees the existing document.
 */
async function seedPricingIfAbsent() {
  if (!fs) return false;
  const snap = await getDoc(doc(fs, 'config', 'pricing'));
  if (snap.exists()) return false;
  await savePricing(JSON.parse(JSON.stringify(DEFAULT_PRICING)));
  return true;
}

/**
 * Register this desktop so it appears in the device list.
 *
 * Keyed on a stable per-machine id rather than the literal "desktop", because a
 * shop can run more than one Command Center and they must not overwrite each
 * other's registry entry.
 */
async function registerDesktop(machineId, machineName) {
  setDeskId(machineId);
  if (!fs) return machineId;
  const ref = doc(fs, 'devices', machineId);
  const existing = await getDoc(ref);
  const payload = {
    deviceId: machineId,
    platform: 'desktop',
    lastSeen: Date.now(),
    isDesktop: true,
  };
  if (!existing.exists()) {
    payload.name = machineName || 'Command Center';
    payload.canCustomize = true;
    payload.registeredAt = Date.now();
  }
  await setDoc(ref, payload, { merge: true });
  return machineId;
}

module.exports = {
  init,
  setDeskId,
  seedPricingIfAbsent,
  saveExpense,
  removeExpense,
  publishBill,
  publishLedgerEntry,
  removeBillEverywhere,
  publishPending,
  getPricing,
  savePricing,
  saveCustomer,
  removeCustomer,
  addCustomerStats,
  listDevices,
  broadcastStatus,
  setDevicePermission,
  renameDevice,
  forgetDevice,
  registerDesktop,
};
