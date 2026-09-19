// settings.js — Pricing editor and Device Control.
//
// Item NAMES are shared across every category (a Saree is the same garment
// whoever brings it in); PRICES are per category. So add/rename/delete apply
// everywhere, while editing a price touches only the selected category.

(function () {
    const { State, $, esc, toast, call, categoryNames } = window.App;
    const { SERVICE_TYPES, formatDateShort } = window.Fmt;

    const PIECE_SERVICES = ['WASH_ONLY', 'WASH_AND_IRON', 'IRON_STEAM'];
    const KG_SERVICES = ['WASH_ONLY', 'WASH_AND_IRON'];

    let selected = null;
    let workingCopy = null; // edits stay local until Save Pricing

    function ensureWorking() {
        if (!workingCopy) workingCopy = JSON.parse(JSON.stringify(State.pricing || {}));
        if (!selected || !workingCopy[selected]) selected = Object.keys(workingCopy)[0] || null;
        return workingCopy;
    }

    function render() {
        const cats = ensureWorking();
        renderPills(cats);
        renderEditor(cats);
        renderDevices();
        renderStorage();
    }

    // ── Storage location ───────────────────────────────────────────────────

    async function renderStorage() {
        const info = await call(window.api.getStorageInfo(), null);
        const node = $('storage-path');
        if (!info) { node.textContent = 'Unavailable'; return; }
        node.innerHTML = `<code>${esc(info.directory)}</code>` +
            (info.isDefault ? '<span class="chip">Default location</span>' : '');
    }

    async function chooseStorage() {
        const result = await call(window.api.chooseStorage(), null);
        if (!result || result.canceled) return;

        await renderStorage();
        toast(result.adopted
            ? 'Switched to the existing data already in that folder.'
            : 'Data folder moved. The previous file was kept as a .bak backup.');

        // The database handle now points somewhere else, so every cached table
        // in the renderer is stale.
        await Promise.all([
            window.App.refreshBills(),
            window.App.refreshCustomers(),
            window.App.refreshPricing(),
        ]);
        workingCopy = null;
        render();
        if (window.Bills) window.Bills.render();
    }

    function renderPills(cats) {
        const row = $('category-pills');
        row.innerHTML = '';
        Object.keys(cats).forEach((name) => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'pill' + (selected === name ? ' active' : '');
            pill.textContent = name;
            pill.onclick = () => { selected = name; render(); };

            const del = document.createElement('span');
            del.className = 'pill-x';
            del.textContent = '×';
            del.title = `Delete ${name}`;
            del.onclick = (e) => {
                e.stopPropagation();
                if (Object.keys(cats).length <= 1) return toast('At least one category is required.', 'error');
                if (!confirm(`Delete category "${name}" and its prices?`)) return;
                delete cats[name];
                selected = Object.keys(cats)[0];
                render();
            };
            pill.appendChild(del);
            row.appendChild(pill);
        });
    }

    function renderEditor(cats) {
        const host = $('pricing-editor');
        host.innerHTML = '';
        if (!selected) {
            host.innerHTML = '<p class="help-text">No categories yet. Add one above.</p>';
            return;
        }
        const cat = cats[selected];
        cat.kgRates = cat.kgRates || {};
        cat.pieceRates = cat.pieceRates || {};

        const kgBlock = document.createElement('div');
        kgBlock.className = 'rate-block';
        kgBlock.innerHTML = `<h3>Per Kg Rates — ${esc(selected)}</h3>`;
        KG_SERVICES.forEach((key) => {
            kgBlock.appendChild(rateRow(SERVICE_TYPES[key].label, cat.kgRates[key] ?? '', (v) => {
                cat.kgRates[key] = v;
            }));
        });
        host.appendChild(kgBlock);

        PIECE_SERVICES.forEach((svcKey) => {
            cat.pieceRates[svcKey] = cat.pieceRates[svcKey] || {};
            const rates = cat.pieceRates[svcKey];

            const block = document.createElement('div');
            block.className = 'rate-block';
            block.innerHTML = `<h3>${esc(SERVICE_TYPES[svcKey].label)} — Per Piece</h3>`;

            Object.keys(rates).forEach((item) => {
                const row = rateRow(item, rates[item], (v) => { rates[item] = v; });

                const rename = document.createElement('button');
                rename.className = 'link-btn';
                rename.textContent = 'Rename';
                rename.onclick = () => renameItem(cats, svcKey, item);

                const del = document.createElement('button');
                del.className = 'link-btn danger';
                del.textContent = 'Delete';
                del.onclick = () => {
                    if (!confirm(`Remove "${item}" from every category?`)) return;
                    Object.keys(cats).forEach((c) => {
                        if (cats[c].pieceRates?.[svcKey]) delete cats[c].pieceRates[svcKey][item];
                    });
                    render();
                };

                row.appendChild(rename);
                row.appendChild(del);
                block.appendChild(row);
            });

            const adder = document.createElement('div');
            adder.className = 'inline-form';
            adder.innerHTML = `
                <input type="text" class="search-input" placeholder="New item name" data-role="name">
                <input type="text" class="rate-input" placeholder="₹" data-role="price">`;
            const addBtn = document.createElement('button');
            addBtn.className = 'btn secondary';
            addBtn.textContent = 'Add Item';
            addBtn.onclick = () => {
                const name = adder.querySelector('[data-role="name"]').value.trim();
                const price = parseFloat(adder.querySelector('[data-role="price"]').value) || 0;
                if (!name) return toast('Enter an item name.', 'error');
                if (rates[name] !== undefined) return toast('That item already exists.', 'error');
                // Item names are shared, so seed it into every category.
                Object.keys(cats).forEach((c) => {
                    cats[c].pieceRates = cats[c].pieceRates || {};
                    cats[c].pieceRates[svcKey] = cats[c].pieceRates[svcKey] || {};
                    if (cats[c].pieceRates[svcKey][name] === undefined) {
                        cats[c].pieceRates[svcKey][name] = price;
                    }
                });
                render();
                toast(`"${name}" added to every category.`);
            };
            adder.appendChild(addBtn);
            block.appendChild(adder);

            host.appendChild(block);
        });
    }

    function rateRow(label, value, onChange) {
        const row = document.createElement('div');
        row.className = 'rate-row';
        const name = document.createElement('span');
        name.className = 'rate-name';
        name.textContent = label;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'rate-input';
        input.value = value;
        input.oninput = (e) => {
            e.target.value = e.target.value.replace(/[^0-9.]/g, '');
            onChange(parseFloat(e.target.value) || 0);
        };

        row.append(name, input);
        return row;
    }

    function renameItem(cats, svcKey, oldName) {
        const newName = prompt(
            'Rename this item. The name changes in every category; prices are unaffected.',
            oldName
        );
        if (!newName || newName.trim() === oldName) return;
        const target = newName.trim();

        if (cats[selected]?.pieceRates?.[svcKey]?.[target] !== undefined) {
            return toast('Another item already uses that name.', 'error');
        }

        Object.keys(cats).forEach((c) => {
            const rates = cats[c].pieceRates?.[svcKey];
            if (!rates || rates[oldName] === undefined) return;
            // Rebuild in place so the renamed item keeps its position.
            cats[c].pieceRates[svcKey] = Object.fromEntries(
                Object.entries(rates).map(([k, v]) => (k === oldName ? [target, v] : [k, v]))
            );
        });
        render();
        toast('Item renamed in every category.');
    }

    function addCategory() {
        const cats = ensureWorking();
        const name = $('new-category-name').value.trim();
        if (!name) return toast('Enter a category name.', 'error');
        if (cats[name]) return toast('That category already exists.', 'error');

        const template = cats[selected] || Object.values(cats)[0] || { kgRates: {}, pieceRates: {} };
        cats[name] = JSON.parse(JSON.stringify(template));
        $('new-category-name').value = '';
        selected = name;
        render();
    }

    async function savePricing() {
        const cats = ensureWorking();
        const saved = await call(window.api.savePricing(cats));
        if (saved === null) return;
        await window.App.refreshPricing();
        workingCopy = null;
        render();
        toast('Pricing saved — every device updated.');
    }

    // ── Device control ─────────────────────────────────────────────────────

    function renderDevices() {
        const host = $('devices-list');
        host.innerHTML = '';

        if (!State.devices.length) {
            host.innerHTML = '<p class="help-text">No devices have connected yet.</p>';
            return;
        }

        State.devices
            .slice()
            .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
            .forEach((device) => {
                const card = document.createElement('div');
                card.className = 'device-card';

                const lastSeen = device.lastSeen ? formatDateShort(device.lastSeen) : 'unknown';
                card.innerHTML = `
                    <div class="device-info">
                        <strong>${esc(device.name || device.deviceId)}</strong>
                        <span>${esc(device.platform || 'mobile')} · last seen ${lastSeen}</span>
                    </div>`;

                const controls = document.createElement('div');
                controls.className = 'device-controls';

                if (device.isDesktop) {
                    controls.innerHTML = '<span class="chip">This computer</span>';
                } else {
                    const toggle = document.createElement('label');
                    toggle.className = 'switch';
                    const input = document.createElement('input');
                    input.type = 'checkbox';
                    input.checked = device.canCustomize === true;
                    input.onchange = async () => {
                        const res = await window.api.setDevicePermission(device.deviceId, input.checked);
                        if (!res.success) { input.checked = !input.checked; return toast(res.error, 'error'); }
                        toast(input.checked
                            ? `${device.name || 'Device'} can now edit pricing.`
                            : `${device.name || 'Device'} can no longer edit pricing.`);
                    };
                    const track = document.createElement('span');
                    track.className = 'switch-track';
                    toggle.append(input, track);

                    const label = document.createElement('span');
                    label.className = 'switch-label';
                    label.textContent = 'Can edit pricing';

                    const rename = document.createElement('button');
                    rename.className = 'link-btn';
                    rename.textContent = 'Rename';
                    rename.onclick = async () => {
                        const name = prompt('Name this device (e.g. "Ravi\'s phone")', device.name || '');
                        if (!name) return;
                        const res = await window.api.renameDevice(device.deviceId, name.trim());
                        if (!res.success) return toast(res.error, 'error');
                        await window.App.refreshDevices();
                        render();
                    };

                    const forget = document.createElement('button');
                    forget.className = 'link-btn danger';
                    forget.textContent = 'Forget';
                    forget.onclick = async () => {
                        if (!confirm(`Forget ${device.name || 'this device'}? It re-registers if the app opens again.`)) return;
                        const res = await window.api.forgetDevice(device.deviceId);
                        if (!res.success) return toast(res.error, 'error');
                        await window.App.refreshDevices();
                        render();
                    };

                    controls.append(label, toggle, rename, forget);
                }

                card.appendChild(controls);
                host.appendChild(card);
            });
    }

    function bind() {
        $('btn-add-category').onclick = addCategory;
        $('btn-save-pricing').onclick = savePricing;
        $('btn-choose-storage').onclick = chooseStorage;
    }

    /** Drop local edits when the cloud pushes a newer config. */
    function invalidate() {
        workingCopy = null;
    }

    window.Settings = { bind, render, invalidate };
})();
