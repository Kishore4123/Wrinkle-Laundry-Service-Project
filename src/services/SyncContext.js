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
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within a SyncProvider');
  return ctx;
}
