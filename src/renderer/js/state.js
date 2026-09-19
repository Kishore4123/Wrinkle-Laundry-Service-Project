// state.js — shared renderer state and small DOM helpers.
//
// Every tab reads from here rather than hitting IPC on its own, so a cloud
// update refreshes one cache and all four tabs redraw from it.

const State = {
    bills: [],
    customers: [],
    pricing: {},
    devices: [],
};

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

function categoryNames() {
    const names = Object.keys(State.pricing);
    return names.length ? names : ['Student', 'Public'];
}

/** Rates for one customer category, falling back to the first defined one. */
function pricingFor(category) {
    return State.pricing[category] || State.pricing[categoryNames()[0]] || { kgRates: {}, pieceRates: {} };
}

window.App = { State, $, el, esc, toast, call, refreshBills, refreshCustomers, refreshPricing, refreshDevices, categoryNames, pricingFor };
