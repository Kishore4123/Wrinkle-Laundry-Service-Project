// SyncContext.js — exposes Firestore sync state to the UI.
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { ensureSignedIn } from './firebase';
import { BillService } from './storage';
import {
  flushPending,
  pushBill,
  requestRemoteSearch,
  subscribeToDeviceInbox,
} from './SyncService';
import {
  flushPendingCustomers,
  registerDevice,
  seedPricingIfAbsent,
  subscribeToCustomers,
  subscribeToMyDevice,
  subscribeToPricing,
} from './SharedDataService';

const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const [isOnline, setIsOnline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [canCustomize, setCanCustomize] = useState(false);
  const [deviceName, setDeviceName] = useState(null);
  const [pricingVersion, setPricingVersion] = useState(0);
  const [customersVersion, setCustomersVersion] = useState(0);
  const mounted = useRef(true);

  const refreshPending = async () => {
    const pending = await BillService.getPendingSync();
    if (mounted.current) setPendingCount(pending.length);
  };

  useEffect(() => {
    mounted.current = true;
    const unsubs = [];

    (async () => {
      try {
        await ensureSignedIn();
        if (mounted.current) setIsOnline(true);

        unsubs.push(await subscribeToDeviceInbox());

        await registerDevice();
        unsubs.push(
          await subscribeToMyDevice((device) => {
            if (!mounted.current) return;
            setCanCustomize(device.canCustomize === true);
            setDeviceName(device.name || null);
          })
        );

        // Whichever device connects first publishes the built-in defaults.
        await seedPricingIfAbsent();
        unsubs.push(
          await subscribeToPricing(() => {
            if (mounted.current) setPricingVersion((v) => v + 1);
          })
        );

        unsubs.push(
          await subscribeToCustomers(() => {
            if (mounted.current) setCustomersVersion((v) => v + 1);
          })
        );

        await flushPending();
        await flushPendingCustomers();
      } catch (e) {
        if (mounted.current) setIsOnline(false);
      }
      await refreshPending();
    })();

    return () => {
      mounted.current = false;
      unsubs.forEach((u) => { if (typeof u === 'function') u(); });
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
      if (mounted.current) setIsOnline(true);
    } catch (e) {
      if (mounted.current) setIsOnline(false);
    }
    await refreshPending();
  };

  const value = {
    isOnline,
    pendingCount,
    flush,
    syncBill,
    searchRemote: requestRemoteSearch,
    // Device permission, granted from the desktop's Device Control tab.
    canCustomize,
    deviceName,
    // Bumped whenever shared state arrives, so screens can re-read their cache.
    pricingVersion,
    customersVersion,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within a SyncProvider');
  return ctx;
}
