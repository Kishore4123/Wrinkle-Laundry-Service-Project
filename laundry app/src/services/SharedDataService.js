// SharedDataService.js — durable shared state in Firestore.
//
// Unlike bills (which use Firestore as a transient mailbox and are deleted once
// the desktop ingests them), these three live in Firestore permanently because
// every device needs to see the same current value:
//   config/pricing      — customer categories, per-kg rates, per-item rates
//   customers/{id}      — the customer directory
//   devices/{deviceId}  — which devices exist and which may edit pricing
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { Platform } from 'react-native';
import { db, ensureSignedIn, getDeviceId } from './firebase';
import { CustomerService } from './storage';
import { SettingsService } from './settingsStorage';

const PRICING_REF = () => doc(db, 'config', 'pricing');

// ── Pricing ────────────────────────────────────────────────────────────────

/**
 * Live-subscribe to pricing. Writes every update into the local cache so the
 * app keeps working with the last-known prices when offline.
 */
export async function subscribeToPricing(onUpdate) {
  await ensureSignedIn();
  return onSnapshot(
    PRICING_REF(),
    async (snap) => {
      if (!snap.exists()) return;
      const categories = snap.data().categories || {};
      await SettingsService.cacheCategories(categories);
      if (onUpdate) onUpdate(categories);
    },
    (err) => console.warn('[Shared] pricing listener error:', err.message)
  );
}

export async function savePricing(categories) {
  await ensureSignedIn();
  const deviceId = await getDeviceId();
  await setDoc(PRICING_REF(), {
    categories,
    updatedAt: Date.now(),
    updatedByDevice: deviceId,
  });
  await SettingsService.cacheCategories(categories);
}

/**
 * Publish the built-in defaults the first time a shop connects, so the very
 * first device to run seeds the shared config rather than every device silently
 * keeping its own copy.
 */
export async function seedPricingIfAbsent() {
  await ensureSignedIn();
  const snap = await getDoc(PRICING_REF());
  if (snap.exists()) return false;
  const local = await SettingsService.getCategories();
  await savePricing(local);
  return true;
}

// ── Customers ──────────────────────────────────────────────────────────────

/**
 * Live-subscribe to the customer directory, merging remote changes into the
 * local cache. Deletions on another device remove the local copy too, so the
 * directory stays identical everywhere.
 */
export async function subscribeToCustomers(onUpdate) {
  await ensureSignedIn();
  return onSnapshot(
    collection(db, 'customers'),
    async (snap) => {
      const upserts = [];
      const removals = [];
      snap.docChanges().forEach((change) => {
        if (change.type === 'removed') removals.push(change.doc.id);
        else upserts.push(change.doc.data());
      });
      if (upserts.length) await CustomerService.cacheCustomers(upserts);
      for (const id of removals) await CustomerService.deleteLocal(id);
      if (onUpdate) onUpdate();
    },
    (err) => console.warn('[Shared] customers listener error:', err.message)
  );
}

export async function pushCustomer(customer) {
  await ensureSignedIn();
  await setDoc(doc(db, 'customers', customer.id), {
    ...customer,
    synced: true,
    updatedAt: Date.now(),
  });
  await CustomerService.markSynced(customer.id);
}

export async function deleteCustomerRemote(customerId) {
  await ensureSignedIn();
  try {
    await deleteDoc(doc(db, 'customers', customerId));
  } catch (e) {
    // Already gone — nothing to do.
  }
}

/** Push any customer created while this device was offline. */
export async function flushPendingCustomers() {
  const pending = await CustomerService.getPendingSync();
  let ok = 0;
  for (const c of pending) {
    try {
      await pushCustomer(c);
      ok++;
    } catch (e) {
      console.warn('[Shared] customer push failed for', c.id, e.message);
    }
  }
  return ok;
}

// ── Device registry ────────────────────────────────────────────────────────

/**
 * Announce this device so the desktop can list it and grant or revoke pricing
 * access. Never writes canCustomize — that field belongs to the desktop, and
 * merge:true leaves it untouched on re-registration.
 */
export async function registerDevice() {
  await ensureSignedIn();
  const deviceId = await getDeviceId();
  const ref = doc(db, 'devices', deviceId);
  const existing = await getDoc(ref);
  const payload = {
    deviceId,
    platform: Platform.OS,
    lastSeen: Date.now(),
  };
  if (!existing.exists()) {
    payload.name = `Phone ${deviceId.slice(0, 4).toUpperCase()}`;
    payload.canCustomize = false;
    payload.registeredAt = Date.now();
  }
  await setDoc(ref, payload, { merge: true });
  return deviceId;
}

/** Live-subscribe to this device's own permission flag. */
export async function subscribeToMyDevice(onUpdate) {
  await ensureSignedIn();
  const deviceId = await getDeviceId();
  return onSnapshot(
    doc(db, 'devices', deviceId),
    (snap) => {
      if (snap.exists() && onUpdate) onUpdate(snap.data());
    },
    (err) => console.warn('[Shared] device listener error:', err.message)
  );
}
