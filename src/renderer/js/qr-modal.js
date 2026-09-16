const btnPair = document.getElementById('btn-pair');
const qrModal = document.getElementById('qr-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const roomCodeDisplay = document.getElementById('room-code');
const qrCanvas = document.getElementById('qr-canvas');

// Toggles
btnPair.addEventListener('click', () => {
    qrModal.classList.remove('hidden');
    // Ensure roomId is generated in webrtc.js and accessible
    if(window.currentRoomId) {
        generateQR(window.currentRoomId);
    }
});

btnCloseModal.addEventListener('click', () => {
    qrModal.classList.add('hidden');
});

async function generateQR(roomId) {
    roomCodeDisplay.textContent = roomId;
    const qrData = JSON.stringify({ roomId, app: "wrinkle-laundry" });
    
    const qrImage = document.getElementById('qr-image');
    const res = await window.api.generateQR(qrData);
    if(res.success) {
        qrImage.src = res.data;
    } else {
        console.error("Failed to generate QR code", res.error);
    }
}

// Expose so webrtc.js can call it once connected to signaling server
window.updateQR = generateQR;
