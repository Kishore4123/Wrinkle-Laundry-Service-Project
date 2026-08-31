// WebRTCContext.js — React Context provider for WebRTC sync state
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import webRTCManager, { ConnectionState } from './WebRTCManager';

const WebRTCContext = createContext(null);

export function WebRTCProvider({ children }) {
  const [connectionState, setConnectionState] = useState(ConnectionState.DISCONNECTED);
  const [pairedRoomId, setPairedRoomId] = useState(null);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [latencyMs, setLatencyMs] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // Subscribe to manager events
    const unsubs = [
      webRTCManager.on('stateChange', (state) => {
        if (mounted.current) setConnectionState(state);
      }),
      webRTCManager.on('offlineQueueChange', (count) => {
        if (mounted.current) setOfflineQueueCount(count);
      }),
      webRTCManager.on('latency', (ms) => {
        if (mounted.current) setLatencyMs(ms);
      }),
    ];

    // Auto-reconnect to saved room on mount
    (async () => {
      const savedRoom = await webRTCManager.getSavedRoomId();
      if (savedRoom && mounted.current) {
        setPairedRoomId(savedRoom);
        webRTCManager.connect(savedRoom);
      }
      const queueCount = await webRTCManager.getOfflineQueueCount();
      if (mounted.current) setOfflineQueueCount(queueCount);
    })();

    return () => {
      mounted.current = false;
      unsubs.forEach(unsub => unsub());
    };
  }, []);

  const connect = async (roomId) => {
    setPairedRoomId(roomId);
    await webRTCManager.connect(roomId);
  };

  const disconnect = () => {
    webRTCManager.disconnect();
  };

  const unpair = async () => {
    await webRTCManager.unpair();
    setPairedRoomId(null);
    setLatencyMs(null);
  };

  const syncBill = (billData) => {
    return webRTCManager.syncBill(billData);
  };

  const value = {
    connectionState,
    pairedRoomId,
    offlineQueueCount,
    latencyMs,
    connect,
    disconnect,
    unpair,
    syncBill,
    isConnected: connectionState === ConnectionState.CONNECTED,
    isPaired: !!pairedRoomId,
  };

  return (
    <WebRTCContext.Provider value={value}>
      {children}
    </WebRTCContext.Provider>
  );
}

export function useWebRTC() {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error('useWebRTC must be used within a WebRTCProvider');
  }
  return context;
}

export { ConnectionState };
