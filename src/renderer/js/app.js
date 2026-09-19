// app.js — shell: tab routing, the Bills tab, and live-sync wiring.

(function () {
    const { State, $, esc, toast, call } = window.App;
    const { formatCurrency, buildBillMessage, SERVICE_TYPES } = window.Fmt;

    let billSearch = '';
    let billFilter = 'all';
    let activeTab = 'bills';

    // ── Bills tab ──────────────────────────────────────────────────────────

    function visibleBills() {
        const q = billSearch.trim().toLowerCase();
        return State.bills.filter((b) => {
            if (billFilter !== 'all' && (b.status || 'Pending') !== billFilter) return false;
            if (!q) return true;
            return (b.customerName || '').toLowerCase().includes(q)
                || (b.phone || '').includes(q)
                || (b.billId || '').toLowerCase().includes(q);
        });
    }

    function renderBills() {
        const tbody = $('orders-tbody');
        const rows = visibleBills();
        tbody.innerHTML = '';
        $('bills-empty').classList.toggle('hidden', rows.length > 0);

        rows.forEach((bill) => {
            const status = bill.status || 'Pending';
            const statusClass = status === 'Pending' ? 'status-pending' : 'status-completed';

            let itemsStr = '';
            const cart = Array.isArray(bill.cartItems) ? bill.cartItems : [];
            if (cart.length) {
                itemsStr = cart.map((ci) => {
                    const svc = SERVICE_TYPES[ci.serviceType]?.label || ci.serviceType || 'Service';
                    return ci.weight ? `${svc} ${ci.weight}kg` : svc;
                }).join(', ');
            } else if (bill.items) {
                itemsStr = Array.isArray(bill.items) ? bill.items.join(', ') : String(bill.items);
            }

            const when = bill.createdAt ? new Date(bill.createdAt)
                : bill.timestamp ? new Date(bill.timestamp) : null;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(bill.billId || '-')}</td>
                <td>
                    <div>${esc(bill.customerName || 'Unknown')}</div>
                    <small class="muted">${esc(itemsStr || bill.customerCategory || '')}</small>
                </td>
                <td>${esc(bill.phone || '-')}</td>
                <td>${esc(formatCurrency(bill.totalAmount || 0))}</td>
                <td><small>${when ? when.toLocaleString('en-IN') : '-'}</small></td>
                <td><span class="status-badge ${statusClass}">${esc(status)}</span></td>`;

            const actions = document.createElement('td');
            actions.className = 'actions-col';

            if (status === 'Pending') {
                const complete = document.createElement('button');
                complete.className = 'btn tiny secondary';
                complete.textContent = 'Complete';
                complete.onclick = () => markCompleted(bill.billId);
                actions.appendChild(complete);
            }

            const wa = document.createElement('button');
            wa.className = 'btn tiny whatsapp';
            wa.textContent = 'WhatsApp';
            wa.onclick = () => sendBill(bill);
            actions.appendChild(wa);

            const del = document.createElement('button');
            del.className = 'btn tiny danger';
            del.textContent = 'Delete';
            del.onclick = () => removeBill(bill.billId);
            actions.appendChild(del);

            tr.appendChild(actions);
            tbody.appendChild(tr);
        });

        updateMetrics();
    }

    function updateMetrics() {
        let revenue = 0, active = 0, completed = 0;
        State.bills.forEach((b) => {
            if ((b.status || 'Pending') === 'Completed') {
                completed++;
                revenue += b.totalAmount || 0;
            } else {
                active++;
            }
        });
        $('metric-revenue').textContent = formatCurrency(revenue);
        $('metric-active').textContent = active;
        $('metric-completed').textContent = completed;
    }

    async function markCompleted(billId) {
        const done = await call(window.api.updateBillStatus(billId, 'Completed'));
        if (done === null) return;
        await Promise.all([window.App.refreshBills(), window.App.refreshCustomers()]);
        renderBills();
        toast('Marked complete. The phone that raised it has been notified.');
    }

    async function removeBill(billId) {
        if (!confirm(`Delete bill ${billId}? This removes it from the shop archive permanently.`)) return;
        const done = await call(window.api.deleteBill(billId));
        if (done === null) return;
        await window.App.refreshBills();
        renderBills();
    }

    async function sendBill(bill) {
        const payload = { ...bill, id: bill.billId, mobile: bill.phone };
        const res = await window.api.sendWhatsApp(bill.phone, buildBillMessage(payload));
        if (!res.success) toast(res.error, 'error');
    }

    // ── Tabs ───────────────────────────────────────────────────────────────

    function switchTab(tab) {
        activeTab = tab;
        document.querySelectorAll('.tab-btn').forEach((b) =>
            b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('.tab-panel').forEach((p) =>
            p.classList.toggle('active', p.id === `panel-${tab}`));

        if (tab === 'customers') window.Customers.render();
        if (tab === 'settings') window.Settings.render();
        if (tab === 'revenue') window.Revenue.render();
    }

    // ── Connection indicator ───────────────────────────────────────────────

    function setConnected(connected) {
        const pill = $('connection-status');
        pill.classList.toggle('online', connected);
        pill.classList.toggle('offline', !connected);
        pill.querySelector('.text').textContent = connected ? 'Cloud Sync Active' : 'Connecting...';

        const metric = $('metric-sync');
        metric.textContent = connected ? 'Online' : 'Offline';
        metric.classList.toggle('sync-online', connected);
        metric.classList.toggle('sync-offline', !connected);
    }

    // ── Boot ───────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', async () => {
        document.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.onclick = () => switchTab(btn.dataset.tab);
        });

        $('search-input').oninput = (e) => { billSearch = e.target.value; renderBills(); };
        $('bill-filter').onchange = (e) => { billFilter = e.target.value; renderBills(); };

        window.Customers.bind();
        window.Billing.bind();
        window.Settings.bind();
        window.Revenue.bind();

        await Promise.all([
            window.App.refreshBills(),
            window.App.refreshCustomers(),
            window.App.refreshPricing(),
            window.App.refreshDevices(),
        ]);
        renderBills();

        // The first listener callback is proof the cloud connection is live.
        window.api.onSyncChanged(async (topic) => {
            setConnected(true);

            if (topic === 'customers') {
                await window.App.refreshCustomers();
                if (activeTab === 'customers') window.Customers.render();
            } else if (topic === 'pricing') {
                await window.App.refreshPricing();
                // Drop in-progress local edits rather than silently overwriting
                // what another device just published.
                window.Settings.invalidate();
                if (activeTab === 'settings') window.Settings.render();
            } else if (topic === 'devices') {
                await window.App.refreshDevices();
                if (activeTab === 'settings') window.Settings.render();
            } else {
                await window.App.refreshBills();
                if (activeTab === 'bills') renderBills();
                if (activeTab === 'revenue') window.Revenue.render();
            }
        });

        // Assume connected once the main process has had a moment to sign in;
        // any listener callback confirms it.
        setTimeout(() => setConnected(true), 2500);
    });

    window.Bills = { render: renderBills };
})();
