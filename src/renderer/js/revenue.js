// revenue.js — Revenue dashboard.
//
// Charts are hand-rolled inline SVG: no library, no network, and full control
// of the mark specs. Every chart here is single-series, so identity is carried
// by the axis/label rather than by colour, and no legend is needed.

(function () {
    const { $, esc, call } = window.App;
    const { formatCurrency, SERVICE_TYPES } = window.Fmt;

    // Validated against the dark surface #1e293b (lightness band, chroma floor,
    // CVD separation, normal-vision floor, contrast — all pass).
    const SERIES = '#3987e5';
    const GRID = 'rgba(255,255,255,0.08)';
    const AXIS_TEXT = '#94a3b8';

    let currentDays = 30;

    async function render() {
        const stats = await call(window.api.getRevenueStats(currentDays), null);
        const host = $('revenue-body');
        if (!stats) {
            host.innerHTML = '<p class="help-text">Could not load revenue data.</p>';
            return;
        }

        host.innerHTML = `
            <div class="metrics-grid">
                ${tile('Revenue Collected', formatCurrency(stats.totalRevenue), 'good')}
                ${tile('Awaiting Payment', formatCurrency(stats.pendingValue), 'warn')}
                ${tile('Completed Bills', stats.completedCount, '')}
                ${tile('Pending Bills', stats.pendingCount, '')}
            </div>

            <div class="glass card-pad chart-card">
                <h3 class="chart-title">Revenue collected — last ${currentDays} days</h3>
                <p class="chart-sub">Only paid bills count. Hover a bar for the day's total.</p>
                ${dailyChart(stats.daily)}
            </div>

            <div class="chart-row">
                <div class="glass card-pad chart-card">
                    <h3 class="chart-title">By customer category</h3>
                    ${breakdownChart(stats.byCategory, (d) => d.name)}
                </div>
                <div class="glass card-pad chart-card">
                    <h3 class="chart-title">By service</h3>
                    ${breakdownChart(stats.byService, (d) => SERVICE_TYPES[d.name]?.label || d.name)}
                </div>
            </div>`;

        attachTooltips(stats.daily);
    }

    function tile(label, value, tone) {
        return `<div class="metric-card glass">
            <p class="label">${esc(label)}</p>
            <p class="value ${tone ? 'tone-' + tone : ''}">${esc(value)}</p>
        </div>`;
    }

    // ── Daily revenue: vertical bars ───────────────────────────────────────

    function dailyChart(daily) {
        if (!daily.length) return '<p class="help-text">No data yet.</p>';

        const W = 900, H = 240;
        const padL = 64, padR = 16, padT = 16, padB = 34;
        const plotW = W - padL - padR;
        const plotH = H - padT - padB;

        const max = Math.max(...daily.map((d) => d.revenue), 1);
        const niceMax = niceCeiling(max);

        // 2px gap between adjacent bars, per the mark spec.
        const slot = plotW / daily.length;
        const barW = Math.max(2, slot - 2);

        let gridLines = '';
        let yLabels = '';
        const TICKS = 4;
        for (let i = 0; i <= TICKS; i++) {
            const v = (niceMax / TICKS) * i;
            const y = padT + plotH - (v / niceMax) * plotH;
            gridLines += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`;
            yLabels += `<text x="${padL - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="${AXIS_TEXT}">${shortMoney(v)}</text>`;
        }

        let bars = '';
        let xLabels = '';
        daily.forEach((d, i) => {
            const h = niceMax === 0 ? 0 : (d.revenue / niceMax) * plotH;
            const x = padL + i * slot + (slot - barW) / 2;
            const y = padT + plotH - h;
            if (h > 0) {
                // 4px rounded data-end, anchored to the baseline.
                const r = Math.min(4, barW / 2, h);
                bars += `<path class="bar" data-i="${i}"
                    d="M${x},${padT + plotH} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${padT + plotH} Z"
                    fill="${SERIES}"/>`;
            } else {
                bars += `<rect class="bar" data-i="${i}" x="${x}" y="${padT + plotH - 1}" width="${barW}" height="1" fill="${GRID}"/>`;
            }
            // Label roughly every 5th day so ticks never collide.
            const step = Math.ceil(daily.length / 8);
            if (i % step === 0 || i === daily.length - 1) {
                xLabels += `<text x="${x + barW / 2}" y="${H - 12}" text-anchor="middle" font-size="10" fill="${AXIS_TEXT}">${dayLabel(d.date)}</text>`;
            }
        });

        return `<div class="chart-holder">
            <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
                ${gridLines}${yLabels}${bars}${xLabels}
                <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="${GRID}" stroke-width="1"/>
            </svg>
            <div class="chart-tooltip hidden" id="chart-tooltip"></div>
        </div>`;
    }

    // ── Breakdown: horizontal bars with direct labels ──────────────────────

    function breakdownChart(rows, labelFn) {
        if (!rows.length) return '<p class="help-text">No completed bills yet.</p>';
        const max = Math.max(...rows.map((r) => r.revenue), 1);

        return `<div class="hbar-list">` + rows.map((r) => {
            const pct = Math.max(1, (r.revenue / max) * 100);
            return `<div class="hbar-row">
                <span class="hbar-label">${esc(labelFn(r))}</span>
                <span class="hbar-track"><span class="hbar-fill" style="width:${pct}%;background:${SERIES}"></span></span>
                <span class="hbar-value">${esc(formatCurrency(r.revenue))}</span>
            </div>`;
        }).join('') + `</div>`;
    }

    // ── Helpers ────────────────────────────────────────────────────────────

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

    function dayLabel(iso) {
        const [, m, d] = iso.split('-');
        return `${d}/${m}`;
    }

    function attachTooltips(daily) {
        const tip = $('chart-tooltip');
        if (!tip) return;
        document.querySelectorAll('.chart-svg .bar').forEach((bar) => {
            bar.addEventListener('mousemove', (e) => {
                const d = daily[Number(bar.dataset.i)];
                if (!d) return;
                tip.innerHTML = `<strong>${esc(d.date)}</strong><br>${esc(formatCurrency(d.revenue))} · ${d.bills} bill${d.bills === 1 ? '' : 's'}`;
                const host = bar.closest('.chart-holder').getBoundingClientRect();
                tip.style.left = `${e.clientX - host.left + 12}px`;
                tip.style.top = `${e.clientY - host.top - 12}px`;
                tip.classList.remove('hidden');
            });
            bar.addEventListener('mouseleave', () => tip.classList.add('hidden'));
        });
    }

    function bind() {
        $('revenue-range').onchange = (e) => {
            currentDays = Number(e.target.value) || 30;
            render();
        };
    }

    window.Revenue = { bind, render };
})();
