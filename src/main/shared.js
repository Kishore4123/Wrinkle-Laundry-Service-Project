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

  // Bills raised on ANOTHER desktop. Desktop-created bills are not uploaded to
  // bills_inbox (that mailbox is consumed and deleted by whichever desktop sees
  // it first, which would race between two desktops). They are published here
  // instead, as durable records every desktop mirrors into its own archive.
  onSnapshot(
    collection(fs, 'desk_bills'),
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'removed') return;
        const bill = change.doc.data();
        // Skip our own writes — already in this SQLite file.
        if (bill.recordedByDesk === deskId) return;
        try {
          db.addBill(bill);
        } catch (e) {
          console.error('[Shared] desk bill mirror failed:', e.message);
        }
      });
      if (snap.docChanges().length && notify) notify('bills');
    },
    (err) => console.error('[Shared] desk_bills listener error:', err.message)
  );
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

/**
 * Publish a bill this desktop just created so other desktops mirror it.
 * Phones do not read this collection — they use bills_inbox in the other
 * direction and pull bills on demand via search.
 */
async function publishDeskBill(bill) {
  if (!fs) return;
  try {
    await setDoc(doc(fs, 'desk_bills', bill.billId || bill.id), {
      ...bill,
      recordedByDesk: deskId,
      publishedAt: Date.now(),
    });
  } catch (e) {
    console.warn('[Shared] desk bill publish failed:', e.message);
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
  publishDeskBill,
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
