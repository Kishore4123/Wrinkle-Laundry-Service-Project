// app.js — Desktop Command Center main UI logic
let currentBills = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Load initial data
    await loadBills();

    // Setup event listeners
    document.getElementById('btn-new-order').addEventListener('click', () => {
        document.getElementById('order-modal').classList.remove('hidden');
    });

    document.getElementById('btn-cancel-order').addEventListener('click', () => {
        document.getElementById('order-modal').classList.add('hidden');
        document.getElementById('new-order-form').reset();
    });

    document.getElementById('new-order-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('order-name').value;
        const phone = document.getElementById('order-phone').value;
        const items = document.getElementById('order-items').value.split(',').map(i => i.trim());
        const total = parseFloat(document.getElementById('order-total').value);

        // Bill numbers come from the shared Firestore counter so that phones and
        // this desktop can never mint the same number.
        const numRes = await window.api.allocateBillNumber();
        if (!numRes.success) {
            alert('No internet connection — a bill number cannot be reserved. Please reconnect and try again.');
            return;
        }
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const billId = `WR-${yy}${mm}${dd}-${String(numRes.data).padStart(3, '0')}`;

        const billData = {
            billId,
            customerName: name,
            phone,
            items,
            totalAmount: total,
            status: 'Pending',
            timestamp: new Date().toISOString()
        };

        // Save locally. Desktop-created bills are never uploaded — they live in
        // the shop archive only.
        const res = await window.api.addBill(billData);
        if (res.success) {
            document.getElementById('order-modal').classList.add('hidden');
            document.getElementById('new-order-form').reset();
            await loadBills();
        }
    });

    document.getElementById('search-input').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = currentBills.filter(b =>
            (b.customerName || '').toLowerCase().includes(query) ||
            (b.phone || '').includes(query) ||
            (b.billId || '').toLowerCase().includes(query)
        );
        renderTable(filtered);
    });

    // Refresh whenever the main process ingests a bill from a phone.
    if (window.api.onSyncChanged) window.api.onSyncChanged(() => loadBills());

    // Firestore manages its own reconnection, so this is a static indicator.
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
        statusEl.classList.add('online');
        statusEl.classList.remove('offline');
        const t = statusEl.querySelector('.text');
        if (t) t.textContent = 'Cloud Sync Active';
    }
    const metricSync = document.getElementById('metric-sync');
    if (metricSync) {
        metricSync.textContent = 'Online';
        metricSync.classList.add('sync-online');
        metricSync.classList.remove('sync-offline');
    }
});

async function loadBills() {
    const res = await window.api.getBills();
    if (res.success) {
        currentBills = res.data;
        renderTable(currentBills);
        updateMetrics();
    }
}

window.refreshBills = loadBills;

function renderTable(bills) {
    const tbody = document.getElementById('orders-tbody');
    tbody.innerHTML = '';

    bills.forEach(bill => {
        const tr = document.createElement('tr');

        const status = bill.status || 'Pending';
        const statusClass = status.toLowerCase() === 'pending' ? 'status-pending' : 'status-completed';

        // Build items display — handle both mobile cart format and desktop format
        let itemsStr = '';
        if (bill.cartItems && Array.isArray(bill.cartItems) && bill.cartItems.length > 0) {
            // Mobile format: cartItems is an array of { serviceType, weight, items, subtotal }
            itemsStr = bill.cartItems.map(ci => {
                const svcLabel = getServiceLabel(ci.serviceType);
                const weight = ci.weight ? `${ci.weight}kg` : '';
                return `${svcLabel} ${weight}`.trim();
            }).join(', ');
        } else if (bill.items) {
            // Desktop / legacy format
            itemsStr = Array.isArray(bill.items) ? bill.items.join(', ') : String(bill.items);
        } else {
            itemsStr = '-';
        }

        // Format amount with ₹
        const amount = typeof bill.totalAmount === 'number' ? bill.totalAmount.toFixed(2) : '0.00';

        // Format date
        const dateStr = bill.timestamp
            ? new Date(bill.timestamp).toLocaleString('en-IN')
            : bill.createdAt
                ? new Date(bill.createdAt).toLocaleString('en-IN')
                : '-';

        tr.innerHTML = `
            <td>${bill.billId || '-'}</td>
            <td>
                <div>${bill.customerName || 'Unknown'}</div>
                ${bill.customerCategory ? `<small style="color: var(--text-muted); font-size: 0.75rem;">${bill.customerCategory}</small>` : ''}
            </td>
            <td>${bill.phone || '-'}</td>
            <td>₹${amount}</td>
            <td><small>${dateStr}</small></td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td>
                ${status === 'Pending'
                    ? `<button class="btn secondary" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="markCompleted('${bill.billId}')">Complete</button>`
                    : bill.completedAt
                        ? `<small style="color: var(--text-muted);">${new Date(bill.completedAt).toLocaleDateString('en-IN')}</small>`
                        : ''
                }
                <button class="btn secondary" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; margin-left: 0.3rem;" onclick="deleteBill('${bill.billId}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function getServiceLabel(serviceType) {
    const labels = {
        'WASH_ONLY': 'Washing Only',
        'WASH_AND_IRON': 'Wash & Iron',
        'IRON_STEAM': 'Steam Ironing',
    };
    return labels[serviceType] || serviceType || 'Service';
}

window.markCompleted = async (billId) => {
    // The main process routes the status change back to the originating phone.
    const res = await window.api.updateBillStatus(billId, 'Completed');
    if (res.success) loadBills();
};

window.deleteBill = async (billId) => {
    if (!confirm(`Delete bill ${billId}? This removes it from the shop archive permanently.`)) return;
    const res = await window.api.deleteBill(billId);
    if (res.success) loadBills();
};

function updateMetrics() {
    let revenue = 0;
    let active = 0;
    let completed = 0;

    currentBills.forEach(b => {
        const status = b.status || 'Pending';
        if (status === 'Pending') {
            active++;
        } else if (status === 'Completed') {
            completed++;
            revenue += b.totalAmount || 0;
        }
    });

    document.getElementById('metric-revenue').textContent = `₹${revenue.toFixed(2)}`;
    document.getElementById('metric-active').textContent = active;
    document.getElementById('metric-completed').textContent = completed;
}
