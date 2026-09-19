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
}

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

// ── Devices ────────────────────────────────────────────────────────────────

function listDevices() {
  return deviceCache;
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

/** Register the desktop itself so it appears in the device list. */
async function registerDesktop() {
  if (!fs) return;
  const ref = doc(fs, 'devices', 'desktop');
  const existing = await getDoc(ref);
  const payload = { deviceId: 'desktop', platform: 'desktop', lastSeen: Date.now(), isDesktop: true };
  if (!existing.exists()) {
    payload.name = 'Command Center';
    payload.canCustomize = true;
    payload.registeredAt = Date.now();
  }
  await setDoc(ref, payload, { merge: true });
}

module.exports = {
  init,
  seedPricingIfAbsent,
  getPricing,
  savePricing,
  saveCustomer,
  removeCustomer,
  addCustomerStats,
  listDevices,
  setDevicePermission,
  renameDevice,
  forgetDevice,
  registerDesktop,
};
