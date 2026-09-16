// webrtc.js — Desktop WebRTC client for connecting to the mobile companion app
const SIGNALING_URL = 'wss://wrinkle-laundry-signaling-server.onrender.com';

const ICE_SERVERS = [
    { urls: "stun:stun.relay.metered.ca:80" },
    { urls: "turn:standard.relay.metered.ca:80", username: "fd92abe3b0ace7d024fd51b7", credential: "Yz6QY6qEa5s/lNab" },
    { urls: "turn:standard.relay.metered.ca:80?transport=tcp", username: "fd92abe3b0ace7d024fd51b7", credential: "Yz6QY6qEa5s/lNab" },
    { urls: "turn:standard.relay.metered.ca:443", username: "fd92abe3b0ace7d024fd51b7", credential: "Yz6QY6qEa5s/lNab" },
    { urls: "turns:standard.relay.metered.ca:443?transport=tcp", username: "fd92abe3b0ace7d024fd51b7", credential: "Yz6QY6qEa5s/lNab" }
];

let ws;
let peerConnection;
let dataChannel;
let reconnectTimer;
let candidateQueue = [];
window.currentRoomId = 'WRK-' + Math.random().toString(36).substr(2, 4).toUpperCase();

const statusIndicator = document.getElementById('connection-status');
const statusText = statusIndicator.querySelector('.text');
const metricSync = document.getElementById('metric-sync');
const pairingStatusText = document.getElementById('pairing-status-text');

function updateConnectionUI(state, text) {
    statusText.textContent = text;
    if (state === 'online') {
        statusIndicator.classList.add('online');
        statusIndicator.classList.remove('offline');
        metricSync.textContent = 'Online';
        metricSync.classList.add('sync-online');
        metricSync.classList.remove('sync-offline');
        document.getElementById('qr-modal').classList.add('hidden');
        pairingStatusText.textContent = 'Connected to mobile companion!';
    } else {
        statusIndicator.classList.add('offline');
        statusIndicator.classList.remove('online');
        metricSync.textContent = 'Offline';
        metricSync.classList.add('sync-offline');
        metricSync.classList.remove('sync-online');
    }
}

function cleanupPeerConnection() {
    if (dataChannel) {
        try { dataChannel.close(); } catch (e) {}
        dataChannel = null;
    }
    if (peerConnection) {
        try { peerConnection.close(); } catch (e) {}
        peerConnection = null;
    }
    candidateQueue = [];
}

function connectSignaling() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(SIGNALING_URL);

    ws.onopen = () => {
        console.log('[WebRTC] Connected to signaling server');
        ws.send(JSON.stringify({ type: 'join', roomId: window.currentRoomId, clientType: 'desktop' }));
        if (window.updateQR) window.updateQR(window.currentRoomId);
        pairingStatusText.textContent = 'Waiting for mobile companion...';
    };

    ws.onmessage = async (message) => {
        let msg;
        try { msg = JSON.parse(message.data); } catch (e) { return; }

        switch (msg.type) {
            case 'joined':
                console.log('[WebRTC] Joined room:', msg.roomId || window.currentRoomId);
                break;

            case 'peer-joined':
                console.log('[WebRTC] Mobile peer joined. Creating offer...');
                pairingStatusText.textContent = 'Mobile companion detected! Handshaking...';
                await createOffer();
                break;

            case 'offer':
                console.log('[WebRTC] Received SDP offer from mobile');
                await handleOffer(msg.sdp);
                break;

            case 'answer':
                console.log('[WebRTC] Received SDP answer');
                if (peerConnection) {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                    flushCandidates();
                }
                break;

            case 'candidate':
                handleCandidate(msg.candidate);
                break;

            case 'peer-left':
                console.log('[WebRTC] Mobile peer left');
                cleanupPeerConnection();
                updateConnectionUI('offline', 'Mobile disconnected');
                pairingStatusText.textContent = 'Mobile disconnected. Waiting for reconnection...';
                break;
        }
    };

    ws.onerror = (err) => {
        console.warn('[WebRTC] Signaling error:', err);
    };

    ws.onclose = () => {
        console.log('[WebRTC] Signaling connection closed, reconnecting in 5s...');
        updateConnectionUI('offline', 'Reconnecting...');
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectSignaling, 5000);
    };
}

async function createOffer() {
    cleanupPeerConnection();
    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Desktop must create the DataChannel since it's the offerer
    dataChannel = peerConnection.createDataChannel('laundry-sync', { ordered: true });
    setupDataChannel();

    peerConnection.ondatachannel = (event) => {
        console.log('[WebRTC] Received DataChannel:', event.channel.label);
        dataChannel = event.channel;
        setupDataChannel();
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'candidate',
                roomId: window.currentRoomId,
                candidate: event.candidate
            }));
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection?.iceConnectionState;
        console.log('[WebRTC] ICE state:', state);
        if (state === 'failed') {
            updateConnectionUI('offline', 'Connection failed');
            pairingStatusText.textContent = 'Connection failed. Please re-pair.';
            cleanupPeerConnection();
        } else if (state === 'disconnected') {
            updateConnectionUI('offline', 'Connection lost');
            pairingStatusText.textContent = 'Connection lost. Waiting to recover...';
        } else if (state === 'connected' || state === 'completed') {
            console.log('[WebRTC] ICE connected');
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    ws.send(JSON.stringify({
        type: 'offer',
        roomId: window.currentRoomId,
        sdp: peerConnection.localDescription
    }));
    console.log('[WebRTC] Sent SDP offer');
}

async function handleOffer(sdp) {
    cleanupPeerConnection();

    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    peerConnection.ondatachannel = (event) => {
        console.log('[WebRTC] Received DataChannel:', event.channel.label);
        dataChannel = event.channel;
        setupDataChannel();
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'candidate',
                roomId: window.currentRoomId,
                candidate: event.candidate
            }));
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection?.iceConnectionState;
        console.log('[WebRTC] ICE state:', state);
        if (state === 'failed') {
            updateConnectionUI('offline', 'Connection failed');
            pairingStatusText.textContent = 'Connection failed. Please re-pair.';
            cleanupPeerConnection();
        } else if (state === 'disconnected') {
            updateConnectionUI('offline', 'Connection lost');
            pairingStatusText.textContent = 'Connection lost. Waiting to recover...';
        } else if (state === 'connected' || state === 'completed') {
            console.log('[WebRTC] ICE connected');
        }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    flushCandidates();
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    ws.send(JSON.stringify({
        type: 'answer',
        roomId: window.currentRoomId,
        sdp: peerConnection.localDescription
    }));
    console.log('[WebRTC] Sent SDP answer');
}

function handleCandidate(candidate) {
    if (peerConnection) {
        if (peerConnection.remoteDescription) {
            peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
                .catch(e => console.error('[WebRTC] ICE candidate error:', e));
        } else {
            candidateQueue.push(candidate);
        }
    }
}

function flushCandidates() {
    for (const candidate of candidateQueue) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(e => console.error('[WebRTC] ICE candidate queue error:', e));
    }
    candidateQueue = [];
}

function setupDataChannel() {
    dataChannel.onopen = () => {
        console.log('[WebRTC] DataChannel OPEN');
        updateConnectionUI('online', 'P2P Connected');
    };

    dataChannel.onclose = () => {
        console.log('[WebRTC] DataChannel CLOSED');
        updateConnectionUI('offline', 'Disconnected');
        pairingStatusText.textContent = 'Connection closed. Waiting for mobile...';
    };

    dataChannel.onerror = (err) => {
        console.error('[WebRTC] DataChannel error:', err);
    };

    dataChannel.onmessage = async (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch (e) { return; }

        console.log('[WebRTC] DataChannel message:', data.type);

        switch (data.type) {
            case 'sync-bill': {
                const result = await window.api.addBill(data.billData);
                if (dataChannel && dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify({
                        type: 'sync-bill-ack',
                        billId: data.billData.id || data.billData.billId,
                        status: 'saved'
                    }));
                }
                if (window.refreshBills) window.refreshBills();
                break;
            }

            case 'retrieve-bills': {
                const res = await window.api.getBills();
                if (res.success && dataChannel && dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify({
                        type: 'retrieve-bills-response',
                        bills: res.data
                    }));
                }
                break;
            }

            case 'ping': {
                if (dataChannel && dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify({ type: 'pong' }));
                }
                break;
            }

            default:
                console.log('[WebRTC] Unknown message type:', data.type);
        }
    };
}

window.sendDataChannelMessage = (msgObj) => {
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(msgObj));
        return true;
    }
    return false;
};

connectSignaling();