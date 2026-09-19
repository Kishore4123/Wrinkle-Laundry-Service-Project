// billing.js — New Bill flow, mirroring the mobile BillGenerationScreen.
//
// Cart item shape is identical to mobile's so the same bill renders the same
// receipt on either device:
//   { serviceType, isPiecewise, weight, items[], ratePerKg, subtotal }

(function () {
    const { State, $, esc, toast, call, pricingFor } = window.App;
    const { SERVICE_TYPES, CLOTHING_CATEGORIES, formatCurrency, formatBillId, datePrefixToday, buildBillMessage } = window.Fmt;

    const SERVICE_KEYS = ['WASH_ONLY', 'WASH_AND_IRON', 'IRON_STEAM'];

    let draft = null;
    let lastBill = null;

    function blankDraft() {
        return {
            customer: null,
            serviceType: 'WASH_ONLY',
            mode: 'kg',
            weight: '',
            clothingItems: [],   // [{ key, label, count }]
            piecewiseItems: [],  // [{ label, rate, count }]
            cart: [],
        };
    }

    function open() {
        draft = blankDraft();
        $('bill-customer-search').value = '';
        $('bill-due-date').value = '';
        $('bill-selected-customer').classList.add('hidden');
        $('bill-customer-results').classList.add('hidden');
        render();
        $('order-modal').classList.remove('hidden');
    }

    function close() {
        $('order-modal').classList.add('hidden');
        draft = null;
    }

    // ── Rate lookup ────────────────────────────────────────────────────────

    function currentCategory() {
        return draft.customer?.category || 'Student';
    }

    function kgRate() {
        const p = pricingFor(currentCategory());
        return p.kgRates?.[draft.serviceType] ?? SERVICE_TYPES[draft.serviceType]?.defaultRate ?? 0;
    }

    function pieceRates() {
        return pricingFor(currentCategory()).pieceRates?.[draft.serviceType] || {};
    }

    function currentSubtotal() {
        if (draft.mode === 'kg') {
            return Math.round((parseFloat(draft.weight) || 0) * kgRate() * 100) / 100;
        }
        return draft.piecewiseItems.reduce((sum, i) => sum + i.count * i.rate, 0);
    }

    // ── Rendering ──────────────────────────────────────────────────────────

    function render() {
        renderServices();
        renderModes();
        renderKgSection();
        renderPieceSection();
        renderCart();
    }

    function renderServices() {
        const row = $('bill-service-row');
        row.innerHTML = '';
        SERVICE_KEYS.forEach((key) => {
            const svc = SERVICE_TYPES[key];
            const rate = pricingFor(currentCategory()).kgRates?.[key];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'service-btn' + (draft.serviceType === key ? ' active' : '');
            btn.innerHTML = `<span class="svc-icon">${svc.icon}</span><span>${esc(svc.label)}</span>` +
                (rate ? `<small>₹${rate}/kg</small>` : '<small>per piece</small>');
            btn.onclick = () => {
                draft.serviceType = key;
                // Steam ironing is piece-only, matching the mobile app.
                if (key === 'IRON_STEAM') draft.mode = 'piece';
                draft.piecewiseItems = [];
                render();
            };
            row.appendChild(btn);
        });
    }

    function renderModes() {
        const ironOnly = draft.serviceType === 'IRON_STEAM';
        document.querySelectorAll('#bill-mode-row .seg-btn').forEach((btn) => {
            const mode = btn.dataset.mode;
            btn.classList.toggle('active', draft.mode === mode);
            btn.disabled = ironOnly && mode === 'kg';
            btn.onclick = () => { draft.mode = mode; render(); };
        });
        $('bill-kg-section').classList.toggle('hidden', draft.mode !== 'kg');
        $('bill-piece-section').classList.toggle('hidden', draft.mode !== 'piece');
    }

    function renderKgSection() {
        $('bill-weight').value = draft.weight;
        $('bill-rate-hint').textContent =
            `Rate for ${currentCategory()}: ₹${kgRate()}/kg → subtotal ${formatCurrency(currentSubtotal())}`;

        const picker = $('bill-clothing-picker');
        picker.innerHTML = '';
        CLOTHING_CATEGORIES.forEach((cat) => {
            const existing = draft.clothingItems.find((i) => i.key === cat.key);
            picker.appendChild(counterRow(cat.label, existing?.count || 0, null, (next) => {
                const idx = draft.clothingItems.findIndex((i) => i.key === cat.key);
                if (next <= 0) {
                    if (idx !== -1) draft.clothingItems.splice(idx, 1);
                } else if (idx === -1) {
                    draft.clothingItems.push({ key: cat.key, label: cat.label, count: next });
                } else {
                    draft.clothingItems[idx].count = next;
                }
                renderKgSection();
            }));
        });
    }

    function renderPieceSection() {
        const picker = $('bill-piece-picker');
        picker.innerHTML = '';
        const rates = pieceRates();
        const names = Object.keys(rates);

        if (names.length === 0) {
            picker.innerHTML = '<p class="help-text">No per-piece prices set for this service. Add them under Settings.</p>';
            return;
        }

        names.forEach((name) => {
            const rate = rates[name];
            const existing = draft.piecewiseItems.find((i) => i.label === name);
            picker.appendChild(counterRow(name, existing?.count || 0, rate, (next) => {
                const idx = draft.piecewiseItems.findIndex((i) => i.label === name);
                if (next <= 0) {
                    if (idx !== -1) draft.piecewiseItems.splice(idx, 1);
                } else if (idx === -1) {
                    draft.piecewiseItems.push({ label: name, rate, count: next });
                } else {
                    draft.piecewiseItems[idx].count = next;
                }
                renderPieceSection();
            }));
        });

        const total = document.createElement('p');
        total.className = 'rate-hint';
        total.textContent = `Subtotal: ${formatCurrency(currentSubtotal())}`;
        picker.appendChild(total);
    }

    function counterRow(label, count, rate, onChange) {
        const row = document.createElement('div');
        row.className = 'counter-row' + (count > 0 ? ' has-count' : '');
        const priceTag = rate ? `<small>₹${rate}</small>` : '';
        row.innerHTML = `<span class="counter-label">${esc(label)} ${priceTag}</span>`;

        const controls = document.createElement('div');
        controls.className = 'counter-controls';
        const minus = document.createElement('button');
        minus.type = 'button'; minus.className = 'counter-btn'; minus.textContent = '−';
        minus.onclick = () => onChange(count - 1);
        const value = document.createElement('span');
        value.className = 'counter-value'; value.textContent = count;
        const plus = document.createElement('button');
        plus.type = 'button'; plus.className = 'counter-btn'; plus.textContent = '+';
        plus.onclick = () => onChange(count + 1);
        controls.append(minus, value, plus);
        row.appendChild(controls);
        return row;
    }

    function renderCart() {
        const list = $('bill-cart');
        list.innerHTML = '';

        if (draft.cart.length === 0) {
            list.innerHTML = '<p class="help-text">Nothing added yet. Build a service above and add it to the cart.</p>';
        }

        draft.cart.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'cart-card';
            const label = SERVICE_TYPES[item.serviceType]?.label || item.serviceType;
            const detail = item.isPiecewise
                ? item.items.map((i) => `${esc(i.label)} ×${i.count}`).join(', ')
                : `${item.weight} kg @ ₹${item.ratePerKg}/kg`;
            card.innerHTML = `
                <div>
                    <strong>${esc(label)}</strong>
                    <p class="cart-detail">${detail || '—'}</p>
                </div>
                <div class="cart-right">
                    <span>${formatCurrency(item.subtotal)}</span>
                </div>`;
            const remove = document.createElement('button');
            remove.type = 'button'; remove.className = 'link-btn danger'; remove.textContent = 'Remove';
            remove.onclick = () => { draft.cart.splice(index, 1); renderCart(); };
            card.querySelector('.cart-right').appendChild(remove);
            list.appendChild(card);
        });

        const totalAmount = draft.cart.reduce((s, i) => s + i.subtotal, 0);
        const totalWeight = draft.cart.reduce((s, i) => s + (i.weight || 0), 0);
        const totalPieces = draft.cart.reduce((s, i) => s + (i.items || []).reduce((a, b) => a + b.count, 0), 0);
        $('bill-cart-summary').innerHTML = `
            <div><span>Total weight</span><strong>${totalWeight} kg</strong></div>
            <div><span>Total items</span><strong>${totalPieces}</strong></div>
            <div class="grand"><span>Total</span><strong>${formatCurrency(totalAmount)}</strong></div>`;
    }

    // ── Customer search ────────────────────────────────────────────────────

    function searchCustomers(query) {
        const box = $('bill-customer-results');
        const q = query.trim().toLowerCase();
        if (!q) { box.classList.add('hidden'); return; }

        const matches = State.customers.filter((c) =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.mobile || '').includes(q) ||
            (c.category || '').toLowerCase().includes(q)
        ).slice(0, 8);

        box.innerHTML = '';
        if (matches.length === 0) {
            box.innerHTML = '<p class="help-text">No match. Add the customer from the Customers tab first.</p>';
        }
        matches.forEach((c) => {
            const row = document.createElement('button');
            row.type = 'button'; row.className = 'result-row';
            row.innerHTML = `<strong>${esc(c.name)}</strong><span>${esc(c.mobile)} · ${esc(c.category)}</span>`;
            row.onclick = () => selectCustomer(c);
            box.appendChild(row);
        });
        box.classList.remove('hidden');
    }

    function selectCustomer(c) {
        draft.customer = c;
        $('bill-customer-search').value = '';
        $('bill-customer-results').classList.add('hidden');
        const box = $('bill-selected-customer');
        box.innerHTML = `<strong>${esc(c.name)}</strong><span>${esc(c.mobile)} · ${esc(c.category)}</span>`;
        box.classList.remove('hidden');
        render();
    }

    // ── Actions ────────────────────────────────────────────────────────────

    function addToCart() {
        if (draft.mode === 'kg' && !(parseFloat(draft.weight) > 0)) {
            return toast('Enter a valid weight.', 'error');
        }
        if (draft.mode === 'piece' && draft.piecewiseItems.length === 0) {
            return toast('Add at least one item.', 'error');
        }

        draft.cart.push({
            serviceType: draft.serviceType,
            isPiecewise: draft.mode === 'piece',
            weight: draft.mode === 'kg' ? parseFloat(draft.weight) || 0 : 0,
            items: draft.mode === 'kg' ? [...draft.clothingItems] : [...draft.piecewiseItems],
            ratePerKg: draft.mode === 'kg' ? kgRate() : 0,
            subtotal: currentSubtotal(),
        });

        draft.weight = '';
        draft.clothingItems = [];
        draft.piecewiseItems = [];
        render();
    }

    async function generateBill() {
        if (!draft.customer) return toast('Select a customer first.', 'error');
        if (draft.cart.length === 0) return toast('Add at least one service to the cart.', 'error');

        // The bill number comes from the shared counter, so it is unique across
        // every phone and this desktop. No connection means no number.
        const numRes = await window.api.allocateBillNumber();
        if (!numRes.success) {
            return toast('No internet connection — a bill number cannot be reserved.', 'error');
        }

        const billId = formatBillId(datePrefixToday(), numRes.data);
        const dueDateRaw = $('bill-due-date').value;
        const dueDate = dueDateRaw
            ? new Date(dueDateRaw).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : null;

        const bill = {
            billId,
            id: billId,
            customerId: draft.customer.id,
            customerName: draft.customer.name,
            customerCategory: draft.customer.category || 'Student',
            phone: draft.customer.mobile,
            mobile: draft.customer.mobile,
            cartItems: draft.cart,
            totalWeight: draft.cart.reduce((s, i) => s + (i.weight || 0), 0),
            totalClothesCount: draft.cart.reduce((s, i) => s + (i.items || []).reduce((a, b) => a + b.count, 0), 0),
            totalAmount: Math.round(draft.cart.reduce((s, i) => s + i.subtotal, 0) * 100) / 100,
            dueDate,
            status: 'Pending',
            createdAt: Date.now(),
            timestamp: new Date().toISOString(),
        };

        const saved = await call(window.api.addBill(bill));
        if (saved === null) return;

        lastBill = bill;
        close();
        await window.App.refreshBills();
        window.Bills.render();
        showConfirmation(bill);
    }

    function showConfirmation(bill) {
        $('confirm-body').innerHTML = `
            <div class="confirm-row"><span>Bill No</span><strong>${esc(bill.id)}</strong></div>
            <div class="confirm-row"><span>Customer</span><strong>${esc(bill.customerName)}</strong></div>
            <div class="confirm-row"><span>Items</span><strong>${bill.totalClothesCount}</strong></div>
            <div class="confirm-row"><span>Weight</span><strong>${bill.totalWeight} kg</strong></div>
            <div class="confirm-row grand"><span>Total</span><strong>${formatCurrency(bill.totalAmount)}</strong></div>
            <p class="help-text">The receipt below opens in WhatsApp, identical to what the phones send.</p>`;
        $('confirm-modal').classList.remove('hidden');
    }

    async function sendWhatsApp() {
        if (!lastBill) return;
        const res = await window.api.sendWhatsApp(lastBill.mobile, buildBillMessage(lastBill));
        if (!res.success) return toast(res.error, 'error');
        $('confirm-modal').classList.add('hidden');
    }

    function bind() {
        $('btn-new-order').onclick = open;
        $('btn-cancel-order').onclick = close;
        $('btn-add-to-cart').onclick = addToCart;
        $('btn-generate-bill').onclick = generateBill;
        $('btn-close-confirm').onclick = () => $('confirm-modal').classList.add('hidden');
        $('btn-send-whatsapp').onclick = sendWhatsApp;
        $('bill-customer-search').oninput = (e) => searchCustomers(e.target.value);
        $('bill-weight').oninput = (e) => {
            draft.weight = e.target.value.replace(/[^0-9.]/g, '');
            e.target.value = draft.weight;
            $('bill-rate-hint').textContent =
                `Rate for ${currentCategory()}: ₹${kgRate()}/kg → subtotal ${formatCurrency(currentSubtotal())}`;
        };
    }

    window.Billing = { bind, open };
})();
