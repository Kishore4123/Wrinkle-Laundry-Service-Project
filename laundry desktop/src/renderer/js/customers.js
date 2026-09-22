// customers.js — Customers tab. Writes go to the shared directory, so a
// customer added here appears on every phone and vice versa.

(function () {
    const { State, $, esc, toast, call, categoryNames } = window.App;
    const { formatCurrency, isValidMobile, generateId } = window.Fmt;

    let searchQuery = '';

    function visibleCustomers() {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return State.customers;
        return State.customers.filter((c) =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.mobile || '').includes(q) ||
            (c.category || '').toLowerCase().includes(q)
        );
    }

    function render() {
        const tbody = $('customers-body');
        const rows = visibleCustomers();
        tbody.innerHTML = '';
        $('customers-empty').classList.toggle('hidden', rows.length > 0);

        rows.forEach((c) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(c.name)}</td>
                <td>${esc(c.mobile)}</td>
                <td><span class="badge neutral">${esc(c.category || 'Student')}</span></td>
                <td>${(c.totalWeight || 0).toFixed(1)} kg</td>
                <td>${formatCurrency(c.totalAmountPaid || 0)}</td>`;

            const actions = document.createElement('td');
            actions.className = 'col-actions';

            const edit = document.createElement('button');
            edit.className = 'btn tiny ghost';
            edit.textContent = 'Edit';
            edit.onclick = () => openModal(c);

            const del = document.createElement('button');
            del.className = 'btn tiny danger';
            del.textContent = 'Delete';
            del.onclick = () => remove(c);

            actions.append(edit, del);
            tr.appendChild(actions);
            tbody.appendChild(tr);
        });
    }

    // Set when the bill screen opens this modal, so the new customer can be
    // handed straight back and selected without a detour to the Customers tab.
    let onSaved = null;

    function openModal(customer, options = {}) {
        const isEdit = !!customer;
        onSaved = options.onSaved || null;

        $('customer-modal-title').textContent = isEdit ? 'Edit Customer' : 'Add Customer';
        $('customer-id').value = isEdit ? customer.id : '';
        $('customer-name').value = isEdit ? customer.name : (options.name || '');
        $('customer-mobile').value = isEdit ? customer.mobile : (options.mobile || '');

        const select = $('customer-category');
        select.innerHTML = '';
        categoryNames().forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (isEdit && customer.category === name) opt.selected = true;
            select.appendChild(opt);
        });

        $('customer-modal').classList.remove('hidden');
    }

    function closeModal() {
        $('customer-modal').classList.add('hidden');
        onSaved = null;
    }

    async function save(event) {
        event.preventDefault();
        const id = $('customer-id').value;
        const name = $('customer-name').value.trim();
        const mobile = $('customer-mobile').value.trim();
        const category = $('customer-category').value;

        if (!name) return toast('Enter a name.', 'error');
        if (!isValidMobile(mobile)) return toast('Mobile must be exactly 10 digits.', 'error');

        const existing = id ? State.customers.find((c) => c.id === id) : null;
        const record = {
            id: id || generateId(),
            name,
            mobile,
            category,
            totalWeight: existing?.totalWeight || 0,
            totalAmountPaid: existing?.totalAmountPaid || 0,
            createdAt: existing?.createdAt || Date.now(),
        };

        const saved = await call(window.api.saveCustomer(record));
        if (saved === null) return;

        closeModal();
        await window.App.refreshCustomers();
        render();
        toast(id ? 'Customer updated on all devices.' : 'Customer added on all devices.');

        if (onSaved) {
            // Hand back the stored row rather than the draft, so the caller gets
            // whatever the database actually holds.
            const stored = State.customers.find((c) => c.id === record.id) || record;
            const cb = onSaved;
            onSaved = null;
            cb(stored);
        }
    }

    async function remove(customer) {
        if (!confirm(`Delete ${customer.name}? This removes them from every device.`)) return;
        const done = await call(window.api.deleteCustomer(customer.id));
        if (done === null) return;
        await window.App.refreshCustomers();
        render();
        toast('Customer deleted everywhere.');
    }

    function bind() {
        $('btn-cancel-customer').onclick = closeModal;
        $('customer-form').onsubmit = save;
        $('customer-search').oninput = (e) => { searchQuery = e.target.value; render(); };
        $('customer-mobile').oninput = (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
        };
    }

    window.Customers = { bind, render, openModal };
})();
