// app.js — shell: sidebar routing, the Bills tab, and live-sync wiring.

(function () {
    const { State, $, esc, toast, call, icon } = window.App;
    const { formatCurrency, buildBillMessage, SERVICE_TYPES } = window.Fmt;

    let billSearch = '';
    let billFilter = 'all';
    let activeTab = 'newbill';

    // What the top-right button does on each tab. Tabs without an entry hide it.
    const PRIMARY_ACTION = {
        bills: { label: '+ New Bill', run: () => switchTab('newbill') },
        customers: { label: '+ Add Customer', run: () => window.Customers.openModal(null) },
        expenses: { label: '+ Add Expense', run: () => window.Expenses.openModal() },
    };

    const TITLES = {
        newbill: 'New Bill', bills: 'Bills', customers: 'Customers',
        expenses: 'Expenses', revenue: 'Revenue', finance: 'Finance', settings: 'Settings',
    };

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
        const body = $('bills-body');
        const rows = visibleBills();
        body.innerHTML = '';
        $('bills-empty').classList.toggle('hidden', rows.length > 0);

        rows.forEach((bill) => {
            const status = bill.status || 'Pending';
            const cart = Array.isArray(bill.cartItems) ? bill.cartItems : [];
            const summary = cart.length
                ? cart.map((ci) => {
                    const svc = SERVICE_TYPES[ci.serviceType]?.label || ci.serviceType || 'Service';
                    return ci.weight ? `${svc} ${ci.weight}kg` : svc;
                }).join(', ')
                : (bill.customerCategory || '');

            const when = bill.createdAt ? new Date(bill.createdAt)
                : bill.timestamp ? new Date(bill.timestamp) : null;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${esc(bill.billId || '-')}</strong></td>
                <td>${esc(bill.customerName || 'Unknown')}<span class="cell-sub">${esc(summary)}</span></td>
                <td>${esc(bill.phone || '-')}</td>
                <td><strong>${esc(formatCurrency(bill.totalAmount || 0))}</strong></td>
                <td>${when ? esc(when.toLocaleDateString('en-IN')) : '-'}<span class="cell-sub">${when ? esc(when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })) : ''}</span></td>
                <td><span class="badge ${status === 'Pending' ? 'pending' : 'completed'}">${esc(status)}</span></td>`;

            const actions = document.createElement('td');
            actions.className = 'col-actions';

            if (status === 'Pending') {
                const complete = document.createElement('button');
                complete.className = 'btn tiny success';
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
            body.appendChild(tr);
        });

        renderBillStats();
    }

    function renderBillStats() {
        let revenue = 0, pending = 0, completed = 0, pendingValue = 0;
        State.bills.forEach((b) => {
            if ((b.status || 'Pending') === 'Completed') { completed++; revenue += b.totalAmount || 0; }
            else { pending++; pendingValue += b.totalAmount || 0; }
        });

        $('count-pending').textContent = pending;
        $('count-completed').textContent = completed;

        $('bill-stats').innerHTML = [
            statCard('receipt', '', State.bills.length, 'Total Bills', 'in the archive'),
            statCard('clock', 'amber', pending, 'Awaiting Payment', formatCurrency(pendingValue)),
            statCard('check', 'green', completed, 'Completed', formatCurrency(revenue)),
            statCard('users', '', State.customers.length, 'Customers', 'shared directory'),
        ].join('');
    }

    function statCard(ico, tone, value, label, chip) {
        return `<div class="stat">
            <div class="stat-icon ${tone}">${icon(ico)}</div>
            <div class="stat-body">
                <div class="stat-value">${esc(value)}</div>
                <div class="stat-label">${esc(label)}</div>
                ${chip ? `<span class="stat-chip">${esc(chip)}</span>` : ''}
            </div>
        </div>`;
    }

    async function markCompleted(billId) {
        const done = await call(window.api.updateBillStatus(billId, 'Completed'));
        if (done === null) return;
        await Promise.all([window.App.refreshBills(), window.App.refreshCustomers()]);
        renderBills();
        toast('Marked complete. Every phone has been notified.');
    }

    async function removeBill(billId) {
        if (!confirm(`Delete bill ${billId}?\n\nThe order is removed, but the revenue it collected stays in the books.`)) return;
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

    // ── Navigation ─────────────────────────────────────────────────────────

    function switchTab(tab) {
        activeTab = tab;
        document.querySelectorAll('.nav-item').forEach((b) =>
            b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('.panel').forEach((p) =>
            p.classList.toggle('active', p.id === `panel-${tab}`));

        $('page-title').textContent = TITLES[tab] || tab;
        $('bill-pills').classList.toggle('hidden', tab !== 'bills');

        const action = PRIMARY_ACTION[tab];
        const btn = $('btn-primary-action');
        btn.classList.toggle('hidden', !action);
        if (action) btn.textContent = action.label;

        if (tab === 'newbill') window.Billing.render();
        if (tab === 'customers') window.Customers.render();
        if (tab === 'expenses') window.Expenses.render();
        if (tab === 'settings') window.Settings.render();
        if (tab === 'revenue') window.Revenue.render();
        if (tab === 'finance') window.Finance.render();
    }

    function setConnected(connected) {
        $('conn-dot').classList.toggle('online', connected);
        $('conn-text').textContent = connected ? 'Cloud sync active' : 'Connecting...';
    }

    // ── Boot ───────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', async () => {
        document.querySelectorAll('.nav-item').forEach((btn) => {
            btn.onclick = () => switchTab(btn.dataset.tab);
        });

        $('btn-collapse').onclick = () => $('sidebar').classList.toggle('collapsed');

        $('btn-primary-action').onclick = () => {
            const action = PRIMARY_ACTION[activeTab];
            if (action) action.run();
        };

        document.querySelectorAll('#bill-pills .pill-btn').forEach((pill) => {
            pill.onclick = () => {
                billFilter = pill.dataset.filter;
                document.querySelectorAll('#bill-pills .pill-btn').forEach((p) =>
                    p.classList.toggle('active', p === pill));
                renderBills();
            };
        });

        $('bill-search').oninput = (e) => { billSearch = e.target.value; renderBills(); };

        window.Customers.bind();
        window.Expenses.bind();
        window.Billing.bind();
        window.Settings.bind();
        window.Revenue.bind();
        window.Finance.bind();

        await Promise.all([
            window.App.refreshBills(),
            window.App.refreshCustomers(),
            window.App.refreshExpenses(),
            window.App.refreshPricing(),
            window.App.refreshDevices(),
        ]);
        renderBills();

        window.api.onSyncChanged(async (topic) => {
            setConnected(true);

            if (topic === 'customers') {
                await window.App.refreshCustomers();
                if (activeTab === 'customers') window.Customers.render();
                if (activeTab === 'bills') renderBills();
            } else if (topic === 'expenses') {
                await window.App.refreshExpenses();
                if (activeTab === 'expenses') window.Expenses.render();
                if (activeTab === 'finance') window.Finance.render();
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
                if (activeTab === 'finance') window.Finance.render();
            }
        });

        // Any listener callback confirms the connection; this covers a quiet shop
        // where no document changes for a while.
        setTimeout(() => setConnected(true), 2500);
    });

    window.Bills = { render: renderBills };
})();
