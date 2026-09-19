// billing.js — the New Bill tab, laid out as a point-of-sale screen: pick a
// customer, pick a service, tap items, watch the live order build on the right.
//
// Cart item shape is identical to mobile's so the same bill renders the same
// receipt on either device:
//   { serviceType, isPiecewise, weight, items[], ratePerKg, subtotal }

(function () {
    const { State, $, esc, toast, call, pricingFor } = window.App;
    const { SERVICE_TYPES, CLOTHING_CATEGORIES, formatCurrency, formatBillId, datePrefixToday, buildBillMessage } = window.Fmt;

    const SERVICE_KEYS = ['WASH_ONLY', 'WASH_AND_IRON', 'IRON_STEAM'];

    let draft = blankDraft();
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

    /** Called when the tab is opened; keeps any half-built order intact. */
    function render() {
        renderCustomer();
        renderServices();
        renderModes();
        renderKgSection();
        renderPieceSection();
        renderCart();
    }

    function reset() {
        draft = blankDraft();
        $('bill-customer-search').value = '';
        $('bill-due-date').value = '';
        $('bill-customer-results').classList.add('hidden');
        render();
    }

    // ── Rate lookup ────────────────────────────────────────────────────────

    const currentCategory = () => draft.customer?.category || 'Student';

    function kgRate() {
        const p = pricingFor(currentCategory());
        return p.kgRates?.[draft.serviceType] ?? SERVICE_TYPES[draft.serviceType]?.defaultRate ?? 0;
    }

    const pieceRates = () => pricingFor(currentCategory()).pieceRates?.[draft.serviceType] || {};

    function currentSubtotal() {
        if (draft.mode === 'kg') {
            return Math.round((parseFloat(draft.weight) || 0) * kgRate() * 100) / 100;
        }
        return draft.piecewiseItems.reduce((sum, i) => sum + i.count * i.rate, 0);
    }

    // ── Customer ───────────────────────────────────────────────────────────

    function renderCustomer() {
        const box = $('bill-selected-customer');
        if (!draft.customer) { box.classList.add('hidden'); return; }
        box.innerHTML = `<strong>${esc(draft.customer.name)}</strong>
            <span>${esc(draft.customer.mobile)} · ${esc(draft.customer.category || 'Student')}</span>`;

        const clear = document.createElement('button');
        clear.className = 'link-btn danger';
        clear.textContent = 'Change';
        clear.onclick = () => { draft.customer = null; render(); };
        box.appendChild(clear);
        box.classList.remove('hidden');
    }

    /**
     * Matches on name, mobile or category. An empty query lists everyone, so
     * clicking the box is enough to browse — you don't have to guess a spelling.
     */
    function searchCustomers(query) {
        const box = $('bill-customer-results');
        const q = query.trim().toLowerCase();

        const matches = (q
            ? State.customers.filter((c) =>
                (c.name || '').toLowerCase().includes(q) ||
                (c.mobile || '').includes(q) ||
                (c.category || '').toLowerCase().includes(q))
            : State.customers
        ).slice(0, 8);

        box.innerHTML = '';

        if (State.customers.length === 0) {
            box.innerHTML = '<p class="help" style="padding:0.7rem 0.85rem">No customers yet. Use “+ New Customer” to add the first one.</p>';
            box.classList.remove('hidden');
            return;
        }

        matches.forEach((c) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'result-item';
            row.innerHTML = `<strong>${esc(c.name)}</strong><span>${esc(c.mobile)} · ${esc(c.category || 'Student')}</span>`;
            row.onclick = () => selectCustomer(c);
            box.appendChild(row);
        });

        if (matches.length === 0) {
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'result-item';
            add.innerHTML = `<strong>Add “${esc(query.trim())}” as a new customer</strong><span>No match in the directory</span>`;
            add.onclick = () => quickAddCustomer(query.trim());
            box.appendChild(add);
        }

        box.classList.remove('hidden');
    }

    function selectCustomer(c) {
        draft.customer = c;
        $('bill-customer-search').value = '';
        $('bill-customer-results').classList.add('hidden');
        render();
    }

    /**
     * Add a customer without leaving the till. If what was typed looks like a
     * phone number it prefills the mobile field, otherwise the name.
     */
    function quickAddCustomer(typed) {
        $('bill-customer-results').classList.add('hidden');
        const digits = String(typed || '').replace(/\D/g, '');
        const looksLikePhone = digits.length >= 6;
        window.Customers.openModal(null, {
            name: looksLikePhone ? '' : typed,
            mobile: looksLikePhone ? digits.slice(0, 10) : '',
            onSaved: (customer) => selectCustomer(customer),
        });
    }

    // ── Services & mode ────────────────────────────────────────────────────

    function renderServices() {
        const row = $('bill-service-row');
        row.innerHTML = '';
        SERVICE_KEYS.forEach((key) => {
            const svc = SERVICE_TYPES[key];
            const rate = pricingFor(currentCategory()).kgRates?.[key];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'service-card' + (draft.serviceType === key ? ' active' : '');
            btn.innerHTML = `<span class="ico">${svc.icon}</span><span>${esc(svc.label)}</span>` +
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
        document.querySelectorAll('#bill-mode-row .seg').forEach((btn) => {
            const mode = btn.dataset.mode;
            btn.classList.toggle('active', draft.mode === mode);
            btn.disabled = ironOnly && mode === 'kg';
            btn.onclick = () => { draft.mode = mode; render(); };
        });
        $('bill-kg-section').classList.toggle('hidden', draft.mode !== 'kg');
        $('bill-piece-section').classList.toggle('hidden', draft.mode !== 'piece');
    }

    // ── Item pickers ───────────────────────────────────────────────────────

    function renderKgSection() {
        $('bill-weight').value = draft.weight;
        updateRateHint();

        const grid = $('bill-clothing-picker');
        grid.innerHTML = '';
        CLOTHING_CATEGORIES.forEach((cat) => {
            const existing = draft.clothingItems.find((i) => i.key === cat.key);
            grid.appendChild(itemTile(cat.label, null, existing?.count || 0, (next) => {
                const idx = draft.clothingItems.findIndex((i) => i.key === cat.key);
                if (next <= 0) { if (idx !== -1) draft.clothingItems.splice(idx, 1); }
                else if (idx === -1) draft.clothingItems.push({ key: cat.key, label: cat.label, count: next });
                else draft.clothingItems[idx].count = next;
                renderKgSection();
            }));
        });
    }

    function updateRateHint() {
        $('bill-rate-hint').textContent =
            `${currentCategory()} rate ₹${kgRate()}/kg → subtotal ${formatCurrency(currentSubtotal())}`;
    }

    function renderPieceSection() {
        const grid = $('bill-piece-picker');
        grid.innerHTML = '';
        const rates = pieceRates();
        const names = Object.keys(rates);

        $('bill-piece-total').textContent = `Subtotal ${formatCurrency(currentSubtotal())}`;

        if (names.length === 0) {
            grid.innerHTML = '<p class="help">No per-piece prices set for this service. Add them under Settings.</p>';
            return;
        }

        names.forEach((name) => {
            const rate = rates[name];
            const existing = draft.piecewiseItems.find((i) => i.label === name);
            grid.appendChild(itemTile(name, rate, existing?.count || 0, (next) => {
                const idx = draft.piecewiseItems.findIndex((i) => i.label === name);
                if (next <= 0) { if (idx !== -1) draft.piecewiseItems.splice(idx, 1); }
                else if (idx === -1) draft.piecewiseItems.push({ label: name, rate, count: next });
                else draft.piecewiseItems[idx].count = next;
                renderPieceSection();
            }));
        });
    }

    /** A tappable card: click anywhere to add one, use −/+ to fine-tune. */
    function itemTile(label, rate, count, onChange) {
        const tile = document.createElement('div');
        tile.className = 'item-tile' + (count > 0 ? ' on' : '');
        tile.innerHTML = `
            <div class="item-name">${esc(label)}</div>
            <div class="item-rate">${rate ? '₹' + rate : '—'}</div>`;

        const controls = document.createElement('div');
        controls.className = 'item-counter';

        const minus = document.createElement('button');
        minus.type = 'button'; minus.textContent = '−';
        minus.onclick = (e) => { e.stopPropagation(); onChange(count - 1); };

        const val = document.createElement('span');
        val.className = 'val'; val.textContent = count;

        const plus = document.createElement('button');
        plus.type = 'button'; plus.textContent = '+';
        plus.onclick = (e) => { e.stopPropagation(); onChange(count + 1); };

        controls.append(minus, val, plus);
        tile.appendChild(controls);
        tile.onclick = () => onChange(count + 1);
        return tile;
    }

    // ── Live order ─────────────────────────────────────────────────────────

    function renderCart() {
        const list = $('bill-cart');
        list.innerHTML = '';

        if (draft.cart.length === 0) {
            list.innerHTML = '<p class="help" style="padding:1.5rem 0;text-align:center">No items added yet.</p>';
        }

        draft.cart.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'cart-item';
            const label = SERVICE_TYPES[item.serviceType]?.label || item.serviceType;
            const detail = item.isPiecewise
                ? item.items.map((i) => `${esc(i.label)} ×${i.count}`).join(', ')
                : `${item.weight} kg @ ₹${item.ratePerKg}/kg`;
            card.innerHTML = `
                <div>
                    <strong>${esc(label)}</strong>
                    <p class="detail">${detail || '—'}</p>
                </div>
                <div class="cart-right"><span>${formatCurrency(item.subtotal)}</span></div>`;

            const remove = document.createElement('button');
            remove.type = 'button'; remove.className = 'link-btn danger'; remove.textContent = 'Remove';
            remove.onclick = () => { draft.cart.splice(index, 1); renderCart(); };
            card.querySelector('.cart-right').appendChild(remove);
            list.appendChild(card);
        });

        const totalAmount = draft.cart.reduce((s, i) => s + i.subtotal, 0);
        const totalWeight = draft.cart.reduce((s, i) => s + (i.weight || 0), 0);
        const totalPieces = draft.cart.reduce((s, i) => s + (i.items || []).reduce((a, b) => a + b.count, 0), 0);

        $('cart-count').textContent = `${draft.cart.length} item${draft.cart.length === 1 ? '' : 's'}`;
        $('bill-cart-summary').innerHTML = `
            <div><span>Total weight</span><strong>${totalWeight} kg</strong></div>
            <div><span>Garments</span><strong>${totalPieces}</strong></div>
            <div class="grand"><span>Sub Total</span><strong>${formatCurrency(totalAmount)}</strong></div>`;
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
        // every phone and every desktop. No connection means no number.
        const numRes = await window.api.allocateBillNumber();
        if (!numRes.success) {
            return toast('No internet connection — a bill number cannot be reserved.', 'error');
        }

        const billId = formatBillId(datePrefixToday(), numRes.data);
        const dueRaw = $('bill-due-date').value;
        const dueDate = dueRaw
            ? new Date(dueRaw).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
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
        reset();
        await window.App.refreshBills();
        window.Bills.render();
        showConfirmation(bill);
    }

    function showConfirmation(bill) {
        $('confirm-body').innerHTML = `
            <div class="kv"><span>Bill No</span><strong>${esc(bill.id)}</strong></div>
            <div class="kv"><span>Customer</span><strong>${esc(bill.customerName)}</strong></div>
            <div class="kv"><span>Garments</span><strong>${bill.totalClothesCount}</strong></div>
            <div class="kv"><span>Weight</span><strong>${bill.totalWeight} kg</strong></div>
            <div class="kv grand"><span>Total</span><strong>${formatCurrency(bill.totalAmount)}</strong></div>
            <p class="help" style="margin-top:0.85rem">The receipt sent below is identical to what the phones send.</p>`;
        $('confirm-modal').classList.remove('hidden');
    }

    async function sendWhatsApp() {
        if (!lastBill) return;
        const res = await window.api.sendWhatsApp(lastBill.mobile, buildBillMessage(lastBill));
        if (!res.success) return toast(res.error, 'error');
        $('confirm-modal').classList.add('hidden');
    }

    function bind() {
        $('btn-add-to-cart').onclick = addToCart;
        $('btn-generate-bill').onclick = generateBill;
        $('btn-clear-cart').onclick = () => {
            if (draft.cart.length && !confirm('Clear this order?')) return;
            reset();
        };
        $('btn-close-confirm').onclick = () => $('confirm-modal').classList.add('hidden');
        $('btn-send-whatsapp').onclick = sendWhatsApp;
        $('btn-quick-customer').onclick = () => quickAddCustomer($('bill-customer-search').value);

        const search = $('bill-customer-search');
        search.oninput = (e) => searchCustomers(e.target.value);
        search.onfocus = () => { if (!draft.customer) searchCustomers(search.value); };

        // Clicking away closes the dropdown, but not when the click is on the
        // dropdown itself — that would cancel the selection before it registers.
        document.addEventListener('mousedown', (e) => {
            const box = $('bill-customer-results');
            if (box.classList.contains('hidden')) return;
            if (e.target === search || box.contains(e.target)) return;
            box.classList.add('hidden');
        });

        $('bill-weight').oninput = (e) => {
            draft.weight = e.target.value.replace(/[^0-9.]/g, '');
            e.target.value = draft.weight;
            updateRateHint();
        };
    }

    window.Billing = { bind, render, reset };
})();
