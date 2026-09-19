// finance.js — Profit & loss.
//
// Revenue comes from the immutable ledger and expenses from the expenses table,
// so this tab always agrees with the Revenue and Expenses tabs.

(function () {
    const { $, esc, call, icon } = window.App;
    const { formatCurrency } = window.Fmt;

    // Revenue and expense are opposed quantities, not two categories, so they
    // use the diverging pair rather than two categorical hues. Both validated
    // for contrast against the light surface.
    const REVENUE = '#2563eb';
    const EXPENSE = '#d97706';
    const GRID = '#e6eaf3';
    const AXIS = '#94a3b8';

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let mode = 'months';
    let count = 12;

    const windowLabel = () =>
        mode === 'years' ? `last ${count} years`
            : mode === 'days' ? `last ${count} days`
                : `last ${count} months`;

    async function render() {
        const s = await call(window.api.getFinanceStats({ mode, count }), null);
        const host = $('finance-body');
        if (!s) { host.innerHTML = '<p class="help">Could not load finance data.</p>'; return; }

        const marginText = s.margin === null ? '—' : `${(s.margin * 100).toFixed(1)}%`;
        const profitTone = s.windowProfit >= 0 ? 'pos' : 'neg';

        host.innerHTML = `
            <div class="stat-grid">
                ${stat('trend', 'green', formatCurrency(s.windowRevenue), 'Revenue', windowLabel())}
                ${stat('wallet', 'amber', formatCurrency(s.windowExpense), 'Expenses', windowLabel())}
                ${stat('coins', s.windowProfit >= 0 ? 'green' : 'red', formatCurrency(s.windowProfit), 'Profit', windowLabel(), profitTone)}
                ${stat('percent', '', marginText, 'Profit Margin', windowLabel())}
            </div>

            <div class="card card-pad">
                <div class="chart-head">
                    <div class="chart-title">Revenue vs expenses — ${esc(windowLabel())}</div>
                    <div class="chart-sub">Profit is the gap between the pair. Hover a period for exact figures.</div>
                </div>
                ${groupedChart(s.series)}
                <div class="legend">
                    <span><i style="background:${REVENUE}"></i>Revenue</span>
                    <span><i style="background:${EXPENSE}"></i>Expenses</span>
                </div>
            </div>

            <div class="chart-row">
                <div class="card card-pad">
                    <div class="chart-head">
                        <div class="chart-title">Where the money goes</div>
                        <div class="chart-sub">All expenses to date, by category</div>
                    </div>
                    ${breakdown(s.expenseByCategory)}
                </div>
                <div class="card card-pad">
                    <div class="chart-head">
                        <div class="chart-title">All-time position</div>
                        <div class="chart-sub">Every paid bill and every recorded expense</div>
                    </div>
                    <div class="kv"><span>Total revenue</span><strong>${esc(formatCurrency(s.totalRevenue))}</strong></div>
                    <div class="kv"><span>Total expenses</span><strong>${esc(formatCurrency(s.totalExpense))}</strong></div>
                    <div class="kv"><span>Expenses recorded</span><strong>${s.expenseCount}</strong></div>
                    <div class="kv grand">
                        <span>Net profit</span>
                        <strong class="${s.totalProfit >= 0 ? 'stat-value pos' : 'stat-value neg'}" style="font-size:1.05rem">
                            ${esc(formatCurrency(s.totalProfit))}
                        </strong>
                    </div>
                </div>
            </div>`;

        attachTooltips(s.series);
    }

    function stat(ico, tone, value, label, chip, valueTone) {
        return `<div class="stat">
            <div class="stat-icon ${tone}">${icon(ico)}</div>
            <div class="stat-body">
                <div class="stat-value ${valueTone || ''}">${esc(value)}</div>
                <div class="stat-label">${esc(label)}</div>
                <span class="stat-chip">${esc(chip)}</span>
            </div>
        </div>`;
    }

    // ── Paired bars: revenue and expense side by side per period ───────────

    function groupedChart(rows) {
        if (!rows.length) return '<p class="help">No data yet.</p>';

        const W = 900, H = 260;
        const padL = 64, padR = 16, padT = 16, padB = 34;
        const plotW = W - padL - padR, plotH = H - padT - padB;

        const max = Math.max(...rows.flatMap((d) => [d.revenue, d.expense]), 1);
        const niceMax = niceCeiling(max);

        const slot = plotW / rows.length;
        // Two bars per slot with a 2px gap between them and 2px to the neighbour.
        const barW = Math.max(2, (slot - 6) / 2);

        let grid = '', yLabels = '';
        for (let i = 0; i <= 4; i++) {
            const v = (niceMax / 4) * i;
            const y = padT + plotH - (v / niceMax) * plotH;
            grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`;
            yLabels += `<text x="${padL - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="${AXIS}">${shortMoney(v)}</text>`;
        }

        let bars = '', xLabels = '';
        const step = Math.ceil(rows.length / 8);
        rows.forEach((d, i) => {
            const base = padL + i * slot + (slot - (barW * 2 + 2)) / 2;
            bars += bar(base, d.revenue, niceMax, plotH, padT, barW, REVENUE, i);
            bars += bar(base + barW + 2, d.expense, niceMax, plotH, padT, barW, EXPENSE, i);
            if (i % step === 0 || i === rows.length - 1) {
                xLabels += `<text x="${base + barW + 1}" y="${H - 12}" text-anchor="middle" font-size="10" fill="${AXIS}">${esc(tickLabel(d.key))}</text>`;
            }
        });

        return `<div class="chart-holder">
            <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
                ${grid}${yLabels}${bars}${xLabels}
                <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="${GRID}" stroke-width="1"/>
            </svg>
            <div class="tooltip hidden" id="fin-tooltip"></div>
        </div>`;
    }

    function bar(x, value, niceMax, plotH, padT, barW, fill, index) {
        const h = niceMax === 0 ? 0 : (value / niceMax) * plotH;
        const baseline = padT + plotH;
        if (h <= 0) return `<rect class="bar" data-i="${index}" x="${x}" y="${baseline - 1}" width="${barW}" height="1" fill="${GRID}"/>`;
        const y = baseline - h;
        const r = Math.min(4, barW / 2, h);
        return `<path class="bar" data-i="${index}"
            d="M${x},${baseline} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${baseline} Z"
            fill="${fill}"/>`;
    }

    function breakdown(rows) {
        if (!rows.length) return '<p class="help">No expenses recorded yet.</p>';
        const max = Math.max(...rows.map((r) => r.amount), 1);
        return '<div class="hbars">' + rows.map((r) => {
            const pct = Math.max(1, (r.amount / max) * 100);
            return `<div class="hbar">
                <span class="hbar-name">${esc(r.name)}</span>
                <span class="hbar-track"><span class="hbar-fill" style="width:${pct}%;background:${EXPENSE}"></span></span>
                <span class="hbar-val">${esc(formatCurrency(r.amount))}</span>
            </div>`;
        }).join('') + '</div>';
    }

    function niceCeiling(v) {
        if (v <= 0) return 1;
        const mag = Math.pow(10, Math.floor(Math.log10(v)));
        return Math.ceil(v / mag) * mag;
    }

    function shortMoney(v) {
        if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
        if (v >= 1000) return `₹${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
        return `₹${Math.round(v)}`;
    }

    function tickLabel(key) {
        const p = key.split('-');
        if (p.length === 3) return `${p[2]}/${p[1]}`;
        if (p.length === 2) return `${MONTHS[Number(p[1]) - 1]} ${p[0].slice(-2)}`;
        return key;
    }

    function fullLabel(key) {
        const p = key.split('-');
        if (p.length === 3) return `${p[2]} ${MONTHS[Number(p[1]) - 1]} ${p[0]}`;
        if (p.length === 2) return `${MONTHS[Number(p[1]) - 1]} ${p[0]}`;
        return key;
    }

    function attachTooltips(rows) {
        const tip = $('fin-tooltip');
        if (!tip) return;
        document.querySelectorAll('#finance-body .chart-svg .bar').forEach((el) => {
            el.addEventListener('mousemove', (ev) => {
                const d = rows[Number(el.dataset.i)];
                if (!d) return;
                tip.innerHTML = `<strong>${esc(fullLabel(d.key))}</strong><br>`
                    + `Revenue ${esc(formatCurrency(d.revenue))}<br>`
                    + `Expenses ${esc(formatCurrency(d.expense))}<br>`
                    + `Profit ${esc(formatCurrency(d.profit))}`;
                const host = el.closest('.chart-holder').getBoundingClientRect();
                tip.style.left = `${ev.clientX - host.left + 12}px`;
                tip.style.top = `${ev.clientY - host.top - 12}px`;
                tip.classList.remove('hidden');
            });
            el.addEventListener('mouseleave', () => tip.classList.add('hidden'));
        });
    }

    function bind() {
        $('finance-range').onchange = (e) => {
            const [m, c] = String(e.target.value).split(':');
            mode = m || 'months';
            count = Number(c) || 12;
            render();
        };
    }

    window.Finance = { bind, render };
})();
