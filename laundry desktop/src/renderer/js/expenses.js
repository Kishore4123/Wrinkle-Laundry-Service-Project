// expenses.js — Expense entry and listing.
//
// Expenses are shared state: saving one publishes it to Firestore so every
// Command Center in the shop sees the same books.

(function () {
    const { State, $, esc, toast, call } = window.App;
    const { formatCurrency, formatDateShort, generateId } = window.Fmt;

    let search = '';
    let categoryFilter = 'all';

    function visible() {
        const q = search.trim().toLowerCase();
        return State.expenses.filter((e) => {
            if (categoryFilter !== 'all' && (e.category || 'Other') !== categoryFilter) return false;
            if (!q) return true;
            return (e.title || '').toLowerCase().includes(q)
                || (e.category || '').toLowerCase().includes(q)
                || (e.note || '').toLowerCase().includes(q);
        });
    }

    function startOfMonth() {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    }

    function renderStats() {
        const all = State.expenses;
        const monthStart = startOfMonth();
        const thisMonth = all.filter((e) => (e.spentAt || 0) >= monthStart);
        const monthTotal = thisMonth.reduce((s, e) => s + (e.amount || 0), 0);
        const allTotal = all.reduce((s, e) => s + (e.amount || 0), 0);

        const biggest = new Map();
        for (const e of thisMonth) {
            biggest.set(e.category || 'Other', (biggest.get(e.category || 'Other') || 0) + (e.amount || 0));
        }
        const top = Array.from(biggest).sort((a, b) => b[1] - a[1])[0];

        $('expense-stats').innerHTML = [
            stat('wallet', 'amber', formatCurrency(monthTotal), 'Spent This Month', `${thisMonth.length} entries`),
            stat('sum', '', formatCurrency(allTotal), 'Spent All Time', `${all.length} entries`),
            stat('tag', '', top ? esc(top[0]) : '—', 'Biggest Category', top ? formatCurrency(top[1]) : 'this month'),
        ].join('');
    }

    function stat(icon, tone, value, label, chip) {
        return `<div class="stat">
            <div class="stat-icon ${tone}">${window.App.icon(icon)}</div>
            <div class="stat-body">
                <div class="stat-value">${value}</div>
                <div class="stat-label">${esc(label)}</div>
                ${chip ? `<span class="stat-chip">${esc(chip)}</span>` : ''}
            </div>
        </div>`;
    }

    function render() {
        renderStats();
        renderFilter();

        const rows = visible();
        const body = $('expenses-body');
        body.innerHTML = '';
        $('expenses-empty').classList.toggle('hidden', rows.length > 0);

        rows.forEach((e) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(formatDateShort(e.spentAt))}</td>
                <td>${esc(e.title)}</td>
                <td><span class="badge neutral">${esc(e.category || 'Other')}</span></td>
                <td><strong>${esc(formatCurrency(e.amount))}</strong></td>
                <td><span class="cell-sub">${esc(e.note || '—')}</span></td>`;

            const actions = document.createElement('td');
            actions.className = 'col-actions';

            const edit = document.createElement('button');
            edit.className = 'btn tiny ghost';
            edit.textContent = 'Edit';
            edit.onclick = () => openModal(e);

            const del = document.createElement('button');
            del.className = 'btn tiny danger';
            del.textContent = 'Delete';
            del.onclick = () => remove(e);

            actions.append(edit, del);
            tr.appendChild(actions);
            body.appendChild(tr);
        });
    }

    function renderFilter() {
        const select = $('expense-filter');
        const current = select.value || 'all';
        const cats = Array.from(new Set(State.expenseCategories.concat(
            State.expenses.map((e) => e.category || 'Other')
        )));
        select.innerHTML = '<option value="all">All categories</option>' +
            cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
        select.value = cats.includes(current) || current === 'all' ? current : 'all';
    }

    function openModal(expense) {
        const isEdit = !!expense;
        $('expense-modal-title').textContent = isEdit ? 'Edit Expense' : 'Add Expense';
        $('expense-id').value = isEdit ? expense.id : '';
        $('expense-title').value = isEdit ? expense.title : '';
        $('expense-amount').value = isEdit ? expense.amount : '';
        $('expense-note').value = isEdit ? (expense.note || '') : '';

        const select = $('expense-category');
        select.innerHTML = State.expenseCategories
            .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
        if (isEdit) select.value = expense.category || 'Other';

        const when = new Date(isEdit ? expense.spentAt : Date.now());
        $('expense-date').value = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;

        $('expense-modal').classList.remove('hidden');
    }

    function closeModal() { $('expense-modal').classList.add('hidden'); }

    async function save(event) {
        event.preventDefault();
        const id = $('expense-id').value;
        const title = $('expense-title').value.trim();
        const amount = parseFloat($('expense-amount').value);
        const dateStr = $('expense-date').value;

        if (!title) return toast('Give the expense a title.', 'error');
        if (!(amount > 0)) return toast('Enter an amount greater than zero.', 'error');

        const existing = id ? State.expenses.find((e) => e.id === id) : null;
        const record = {
            id: id || generateId(),
            title,
            amount,
            category: $('expense-category').value || 'Other',
            note: $('expense-note').value.trim() || null,
            // Parse as local midnight so the date shown matches the date picked.
            spentAt: dateStr ? new Date(dateStr + 'T00:00:00').getTime() : Date.now(),
            createdAt: existing?.createdAt || Date.now(),
        };

        const saved = await call(window.api.saveExpense(record));
        if (saved === null) return;

        closeModal();
        await window.App.refreshExpenses();
        render();
        toast(id ? 'Expense updated.' : 'Expense recorded.');
    }

    async function remove(expense) {
        if (!confirm(`Delete "${expense.title}" (${window.Fmt.formatCurrency(expense.amount)})?`)) return;
        const done = await call(window.api.deleteExpense(expense.id));
        if (done === null) return;
        await window.App.refreshExpenses();
        render();
        toast('Expense deleted.');
    }

    function bind() {
        $('btn-cancel-expense').onclick = closeModal;
        $('expense-form').onsubmit = save;
        $('expense-search').oninput = (e) => { search = e.target.value; render(); };
        $('expense-filter').onchange = (e) => { categoryFilter = e.target.value; render(); };
        $('expense-amount').oninput = (e) => {
            e.target.value = e.target.value.replace(/[^0-9.]/g, '');
        };
    }

    window.Expenses = { bind, render, openModal: () => openModal(null) };
})();
