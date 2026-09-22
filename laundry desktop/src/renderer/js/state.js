// state.js — shared renderer state and small DOM helpers.
//
// Every tab reads from here rather than hitting IPC on its own, so a cloud
// update refreshes one cache and all four tabs redraw from it.

const State = {
    bills: [],
    customers: [],
    expenses: [],
    expenseCategories: [],
    pricing: {},
    devices: [],
};

// Inline SVG icons — no icon font, no CDN, so the UI renders with no network.
const ICONS = {
    receipt: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
    wallet: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    trend: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/>',
    percent: '<path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    sum: '<path d="M18 7V4H6l6 8-6 8h12v-3"/>',
    tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/>',
};

/** Returns an inline SVG string for one of the ICONS above. */
function icon(name) {
    const body = ICONS[name] || ICONS.receipt;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function $(id) { return document.getElementById(id); }

function el(tag, className, html) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (html !== undefined) n.innerHTML = html;
    return n;
}

/** Escape anything that came from a customer or another device before it hits innerHTML. */
function esc(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

let toastTimer = null;
function toast(message, kind = 'info') {
    const node = $('toast');
    node.textContent = message;
    node.className = `toast ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.add('hidden'), 3200);
}

/**
 * Replacement for window.prompt, which Electron does not implement — calling it
 * throws "prompt() is and will not be supported", which is why renaming used to
 * fail silently. Resolves to the trimmed string, or null if cancelled.
 */
function askText({ title, help, value = '', okLabel = 'Save' }) {
    return new Promise((resolve) => {
        const overlay = $('prompt-modal');
        const input = $('prompt-input');
        const form = $('prompt-form');

        $('prompt-title').textContent = title;
        $('prompt-help').textContent = help || '';
        $('prompt-help').classList.toggle('hidden', !help);
        $('btn-prompt-ok').textContent = okLabel;
        input.value = value;

        const done = (result) => {
            overlay.classList.add('hidden');
            form.onsubmit = null;
            $('btn-prompt-cancel').onclick = null;
            overlay.onmousedown = null;
            document.removeEventListener('keydown', onKey);
            resolve(result);
        };

        const onKey = (e) => { if (e.key === 'Escape') done(null); };

        form.onsubmit = (e) => {
            e.preventDefault();
            const text = input.value.trim();
            done(text.length ? text : null);
        };
        $('btn-prompt-cancel').onclick = () => done(null);
        // Click the backdrop (not the dialog itself) to dismiss.
        overlay.onmousedown = (e) => { if (e.target === overlay) done(null); };
        document.addEventListener('keydown', onKey);

        overlay.classList.remove('hidden');
        input.focus();
        input.select();
    });
}

/** Unwrap the {success, data|error} envelope every IPC handler returns. */
async function call(promise, fallback = null) {
    const res = await promise;
    if (!res || !res.success) {
        if (res && res.error) toast(res.error, 'error');
        return fallback;
    }
    return res.data;
}

async function refreshBills() {
    State.bills = (await call(window.api.getBills(), [])) || [];
}

async function refreshCustomers() {
    State.customers = (await call(window.api.listCustomers(), [])) || [];
}

async function refreshPricing() {
    State.pricing = (await call(window.api.getPricing(), {})) || {};
}

async function refreshDevices() {
    State.devices = (await call(window.api.listDevices(), [])) || [];
}

async function refreshExpenses() {
    State.expenses = (await call(window.api.listExpenses(), [])) || [];
    if (!State.expenseCategories.length) {
        State.expenseCategories = (await call(window.api.expenseCategories(), [])) || ['Other'];
    }
}

function categoryNames() {
    const names = Object.keys(State.pricing);
    return names.length ? names : ['Student', 'Public'];
}

/** Rates for one customer category, falling back to the first defined one. */
function pricingFor(category) {
    return State.pricing[category] || State.pricing[categoryNames()[0]] || { kgRates: {}, pieceRates: {} };
}

window.App = {
    State, $, el, esc, icon, toast, call, askText,
    refreshBills, refreshCustomers, refreshExpenses, refreshPricing, refreshDevices,
    categoryNames, pricingFor,
};
