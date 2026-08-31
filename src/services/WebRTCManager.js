// WebRTCManager.js — Singleton service managing WebRTC signaling, peer connection, and data channel
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';

const SIGNALING_URL = 'wss://wrinkle-laundry-signaling-server.onrender.com';
const ICE_SERVERS = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'turn:standard.relay.metered.ca:80', username: 'fd92abe3b0ace7d024fd51b7', credential: 'Yz6QY6qEa5s/lNab' },
  { urls: 'turn:standard.relay.metered.ca:80?transport=tcp', username: 'fd92abe3b0ace7d024fd51b7', credential: 'Yz6QY6qEa5s/lNab' },
  { urls: 'turn:standard.relay.metered.ca:443', username: 'fd92abe3b0ace7d024fd51b7', credential: 'Yz6QY6qEa5s/lNab' },
  { urls: 'turns:standard.relay.metered.ca:443?transport=tcp', username: 'fd92abe3b0ace7d024fd51b7', credential: 'Yz6QY6qEa5s/lNab' },
];
const STORAGE_KEYS = { PAIRED_ROOM: '@wrinkle_paired_room', OFFLINE_BILLS: '@wrinkle_offline_bills' };

export const ConnectionState = { DISCONNECTED: 'DISCONNECTED', CONNECTING: 'CONNECTING', SIGNALING: 'SIGNALING', CONNECTED: 'CONNECTED' };

class EventEmitter {
  constructor() { this._listeners = {}; }
  on(event, fn) { if (!this._listeners[event]) this._listeners[event] = []; this._listeners[event].push(fn); return () => this.off(event, fn); }
  off(event, fn) { if (!this._listeners[event]) return; this._listeners[event] = this._listeners[event].filter(f => f !== fn); }
  emit(event, ...args) { if (!this._listeners[event]) return; this._listeners[event].forEach(fn => { try { fn(...args); } catch (e) { console.warn('[WebRTC] Listener error:', e); } }); }
}

class WebRTCManagerClass extends EventEmitter {
  constructor() {
    super();
    this._state = ConnectionState.DISCONNECTED;
    this._roomId = null;
    this._ws = null;
    this._pc = null;
    this._dataChannel = null;
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    this._pingInterval = null;
    this._lastPingTime = null;
    this._intentionalDisconnect = false;
  }

  get connectionState() { return this._state; }
  get roomId() { return this._roomId; }

  _setState(s) { if (this._state === s) return; this._state = s; this.emit('stateChange', s); }

  async connect(roomId) {
    if (this._state !== ConnectionState.DISCONNECTED) this.disconnect();
    this._intentionalDisconnect = false;
    this._roomId = roomId;
    this._reconnectAttempts = 0;
    try { await AsyncStorage.setItem(STORAGE_KEYS.PAIRED_ROOM, roomId); } catch (e) {}
    this._connectSignaling();
  }

  _connectSignaling() {
    this._setState(ConnectionState.CONNECTING);
    try { this._ws = new WebSocket(SIGNALING_URL); } catch (e) { this._scheduleReconnect(); return; }
    this._ws.onopen = () => { this._setState(ConnectionState.SIGNALING); this._ws.send(JSON.stringify({ type: 'join', roomId: this._roomId, clientType: 'mobile' })); };
    this._ws.onmessage = (e) => { try { this._handleSignaling(JSON.parse(e.data)); } catch (err) {} };
    this._ws.onerror = () => {};
    this._ws.onclose = () => { if (!this._intentionalDisconnect && this._state !== ConnectionState.CONNECTED) this._scheduleReconnect(); };
  }

  async _handleSignaling(msg) {
    switch (msg.type) {
      case 'joined': break;
      case 'peer-joined':
        await this._createPC();
        await this._sendOffer();
        break;
      case 'answer':
        if (this._pc) await this._pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        break;
      case 'candidate':
        if (this._pc && msg.candidate) await this._pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        break;
      case 'peer-left':
        this._cleanupPC();
        if (this._ws && this._ws.readyState === WebSocket.OPEN) this._setState(ConnectionState.SIGNALING);
        break;
      case 'offer':
        await this._createPC();
        await this._pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const ans = await this._pc.createAnswer();
        await this._pc.setLocalDescription(ans);
        this._ws.send(JSON.stringify({ type: 'answer', roomId: this._roomId, sdp: ans }));
        break;
    }
  }

  async _createPC() {
    this._cleanupPC();
    this._pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this._pc.onicecandidate = (e) => { if (e.candidate && this._ws?.readyState === WebSocket.OPEN) this._ws.send(JSON.stringify({ type: 'candidate', roomId: this._roomId, candidate: e.candidate })); };
    this._pc.oniceconnectionstatechange = () => { if (this._pc?.iceConnectionState === 'failed' || this._pc?.iceConnectionState === 'disconnected') { if (!this._intentionalDisconnect) { this._cleanupPC(); this._scheduleReconnect(); } } };
    this._dataChannel = this._pc.createDataChannel('laundry-sync', { ordered: true });
    this._setupDC(this._dataChannel);
    this._pc.ondatachannel = (e) => { this._dataChannel = e.channel; this._setupDC(this._dataChannel); };
  }

  _setupDC(ch) {
    ch.onopen = () => { this._setState(ConnectionState.CONNECTED); this._reconnectAttempts = 0; this._startPing(); this._flushQueue(); };
    ch.onclose = () => { this._stopPing(); if (!this._intentionalDisconnect) { this._setState(ConnectionState.DISCONNECTED); this._scheduleReconnect(); } };
    ch.onerror = () => {};
    ch.onmessage = (e) => { try { this._handleData(JSON.parse(e.data)); } catch (err) {} };
  }

  async _sendOffer() {
    if (!this._pc) return;
    const offer = await this._pc.createOffer();
    await this._pc.setLocalDescription(offer);
    if (this._ws?.readyState === WebSocket.OPEN) this._ws.send(JSON.stringify({ type: 'offer', roomId: this._roomId, sdp: offer }));
  }

  _handleData(msg) {
    switch (msg.type) {
      case 'sync-bill-ack': this.emit('billSynced', msg.billId); break;
      case 'retrieve-bills-response': this.emit('billsReceived', msg.bills); break;
      case 'pong': if (this._lastPingTime) this.emit('latency', Date.now() - this._lastPingTime); break;
      default: this.emit('dataMessage', msg);
    }
  }

  syncBill(billData) {
    if (this._dataChannel?.readyState === 'open') { this._dataChannel.send(JSON.stringify({ type: 'sync-bill', billData })); return true; }
    this._queueBill(billData);
    return false;
  }

  retrieveBills() {
    if (this._dataChannel?.readyState === 'open') { this._dataChannel.send(JSON.stringify({ type: 'retrieve-bills' })); return true; }
    return false;
  }

  ping() {
    if (this._dataChannel?.readyState === 'open') { this._lastPingTime = Date.now(); this._dataChannel.send(JSON.stringify({ type: 'ping', timestamp: this._lastPingTime })); }
  }

  _startPing() { this._stopPing(); this._pingInterval = setInterval(() => this.ping(), 15000); }
  _stopPing() { if (this._pingInterval) { clearInterval(this._pingInterval); this._pingInterval = null; } }

  async _queueBill(billData) {
    try { const raw = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_BILLS); const q = raw ? JSON.parse(raw) : []; q.push(billData); await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_BILLS, JSON.stringify(q)); this.emit('offlineQueueChange', q.length); } catch (e) {}
  }

  async _flushQueue() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_BILLS);
      const q = raw ? JSON.parse(raw) : [];
      if (q.length === 0) return;
      for (const bill of q) { if (this._dataChannel?.readyState === 'open') this._dataChannel.send(JSON.stringify({ type: 'sync-bill', billData: bill })); }
      await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_BILLS);
      this.emit('offlineQueueChange', 0);
    } catch (e) {}
  }

  async getOfflineQueueCount() {
    try { const raw = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_BILLS); return raw ? JSON.parse(raw).length : 0; } catch (e) { return 0; }
  }

  _scheduleReconnect() {
    if (this._intentionalDisconnect || this._reconnectAttempts >= 10) { this._setState(ConnectionState.DISCONNECTED); return; }
    const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 30000);
    this._reconnectAttempts++;
    this._reconnectTimer = setTimeout(() => { if (this._roomId && !this._intentionalDisconnect) this._connectSignaling(); }, delay);
  }

  disconnect() {
    this._intentionalDisconnect = true;
    this._stopPing();
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    this._cleanupPC();
    if (this._ws) { this._ws.close(); this._ws = null; }
    this._roomId = null;
    this._setState(ConnectionState.DISCONNECTED);
  }

  async unpair() {
    this.disconnect();
    try { await AsyncStorage.removeItem(STORAGE_KEYS.PAIRED_ROOM); await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_BILLS); } catch (e) {}
    this.emit('offlineQueueChange', 0);
  }

  _cleanupPC() {
    if (this._dataChannel) { try { this._dataChannel.close(); } catch (e) {} this._dataChannel = null; }
    if (this._pc) { try { this._pc.close(); } catch (e) {} this._pc = null; }
  }

  async getSavedRoomId() {
    try { return await AsyncStorage.getItem(STORAGE_KEYS.PAIRED_ROOM); } catch (e) { return null; }
  }
}

const webRTCManager = new WebRTCManagerClass();
export default webRTCManager;
