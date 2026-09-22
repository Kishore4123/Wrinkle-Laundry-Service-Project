# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This directory contains two independent, unrelated-by-tooling but functionally paired projects for "Wrinkle Release Laundry Service":

- **`laundry app/`** — Expo/React Native mobile app used by staff to create bills and manage customers. Has its own git repository (`laundry app/.git`); the top-level `main/` folder is NOT a git repo.
- **`laundry desktop/`** — Electron + better-sqlite3 desktop app ("Wrinkle Laundry Command Center") that acts as the durable bill store and printing/QR station. No git repo currently.

The two apps exchange data through Cloud Firestore used as a transient mailbox (see "Sync architecture" below). The desktop's SQLite database is the only durable store — Firestore holds nothing once a message is consumed.

## Commands

### laundry app (Expo/React Native)
Run from `laundry app/`:
- `npm start` — start Expo dev server
- `npm run android` / `npm run ios` / `npm run web` — start for a specific platform
- No test or lint scripts are configured in `package.json`.

### laundry desktop (Electron)
Run from `laundry desktop/`:
- `npm start` — launch the Electron app (`electron .`)
- `npm run build` — build a Windows installer via `electron-builder` (output in `laundry desktop/dist/`)
- `postinstall` runs `electron-builder install-app-deps` automatically to rebuild native deps (`better-sqlite3`) for Electron's Node ABI.
- No test or lint scripts are configured.

## Architecture

### Mobile app (`laundry app/src/`)
- `screens/` — one screen per app section: `CustomersScreen`, `AddCustomerScreen`, `BillGenerationScreen`, `HistoryScreen`, `QRScannerScreen`, `SettingsScreen`. Navigation is a bottom-tab + stack setup defined in `navigation/AppNavigator.js`.
- `services/storage.js` — all local persistence via `AsyncStorage`. Two services: `CustomerService` and `BillService`. Bills are stored as a single JSON array under `@laundry_bills`; customers under `@laundry_customers`. There's a one-time migration path from a legacy `@laundry_students` key (pre-"Customer" rename) baked into `CustomerService.getAll()`.
- `BillService.save(billData, billId)` takes the bill ID as an argument — it never derives one. See "Bill IDs" under Sync architecture.
- `services/firebase.js` — Firebase app handle, anonymous auth, the Firestore instance, and this install's device ID. React Native requires `getReactNativePersistence(AsyncStorage)` for auth and `experimentalForceLongPolling: true` for Firestore; without them the session is lost on restart and listeners stall silently.
- `services/SyncService.js` — all Firestore traffic: counter allocation, bill push, pending flush, remote search, and the per-device inbox listener. See "Sync architecture".
- `services/SyncContext.js` — React context exposing `isOnline`, `pendingCount`, `flush`, `syncBill`, and `searchRemote` to components.
- `services/settingsStorage.js` — app settings persisted separately from bills/customers.
- `utils/helpers.js` — formatting utilities and WhatsApp message builders (`buildBillMessage`, `buildOrderReadyMessage`) that generate the receipt text sent to customers via `whatsapp://` deep links. Bill messages support both new cart-based bills (`bill.cartItems`) and legacy single-service bills — keep both code paths in sync when changing bill shape.
- `theme/theme.js` — defines `SERVICE_TYPES`, referenced by both the bill screens and the WhatsApp message formatter.

### Desktop app (`laundry desktop/src/`)
- `main/main.js` — Electron main process. Creates the window, starts the Firestore listeners, and exposes operations to the renderer via `ipcMain.handle` (`db:getBills`, `db:addBill`, `db:updateBillStatus`, `db:deleteBill`, `sync:allocateBillNumber`). `contextIsolation` is on; the renderer talks to `main` only through `preload.js`'s bridged `window.api`. `db:updateBillStatus` also routes the change back to the phone that created the bill.
- `main/database.js` — `better-sqlite3` wrapper. Schema lives in `bills` table with a manual "add column if missing" migration loop (no formal migration framework). `addBill` is a **single atomic upsert** keyed on `billId` (never check-then-insert: Firestore can deliver the same document to two overlapping snapshot callbacks, and the read-then-write version lost that race with a UNIQUE constraint error). It maps the mobile app's field names (`bill.mobile`, `bill.weight`, `bill.clothesCount`, etc.) onto the DB's canonical column names (`phone`, `totalWeight`, `totalClothesCount`) — this mapping is the contract between the two apps' bill shapes.
- `main/shared.js` — durable shared state: pricing, the customer directory, the device registry, and `broadcastStatus`.
- `main/sync.js` — Firestore listeners and writes. Ingests bills from `bills_inbox` into SQLite, answers `search_requests` from the archive, allocates bill numbers from the shared counter, and pushes status changes to the originating device's inbox. Lives in the main process because the renderer is sandboxed.
- `renderer/js/app.js` — all renderer UI logic: the bill table, metrics, the New Order form, and the Complete/Delete row actions.

### Sync architecture (mobile ↔ desktop)

Firestore started as a purely transient mailbox. It no longer is: supporting **more than one Command Center** forced the bill archive and the revenue ledger to become durable shared collections, because a consume-and-delete mailbox leaves a bill on whichever desktop drained it first and nowhere else. Phone→desktop delivery is still a mailbox; the archive behind it is not. Firebase project: `stress-monitor-7005a` (config at the repo root: `firebase.json`, `.firebaserc`, `firestore.rules`).

Collections split into two groups. **Transient** ones are deleted the moment the other side consumes them; **durable** ones live there permanently because every device must see the same current value.

| Path | Kind | Writer | Reader | Lifecycle |
|---|---|---|---|---|
| `counters/bill_number` | durable | all devices | all devices | permanent (single doc) |
| `bills_inbox/{billId}` | transient | mobile | desktop | deleted after desktop ingests |
| `search_requests/{requestId}` | transient | mobile | desktop | deleted after desktop answers |
| `device_inbox/{deviceId}/messages/{msgId}` | transient | desktop | one mobile | deleted after that mobile applies |
| `bills/{billId}` | durable | every device | all desktops | the shared archive; deleted only by a user action |
| `ledger/{billId}` | durable | every desktop | all desktops | **never deleted** — see below |
| `expenses/{expenseId}` | durable | every desktop | all desktops | deleted only by a user action |
| `config/pricing` | durable | any permitted device | all devices | single doc, last-write-wins |
| `customers/{customerId}` | durable | all devices | all devices | deleted only by a user action |
| `devices/{deviceId}` | durable | desktop (+ self-registration) | all devices | deleted only by "Forget" |

Both apps mirror the durable collections into local storage (AsyncStorage on mobile, the `customers` and `app_config` tables on desktop) so they keep working offline with the last-known values.

- **Bill IDs come from one centralized counter**, allocated in a Firestore transaction. Format `WR-YYMMDD-NNN`, where `NNN` is the global counter value (minimum three digits, grows past 999). It never resets. The old scheme — scanning local bills for the day's max sequence — was removed because it produced duplicate IDs across devices. **A device with no connectivity cannot create a bill**; this is deliberate, since the number is printed on the customer's receipt and can never change after issue.
- `device_inbox` is partitioned per device because there are **multiple mobile devices**. A shared outbox would let the first phone to read a message delete it before the others saw it. `deviceId` is a locally-generated UUID in AsyncStorage (`@wrinkle_device_id`) — there is no central device registry.
- **Desktop-created bills are never uploaded.** They live in SQLite only. Mobiles can still find them via a search request, which the desktop answers from that archive.
- Mobile keeps its own bills until the user deletes them; syncing never removes a local copy. A `synced` flag plus `flushPending()` covers a push that fails after the number was allocated.
- Remote lookup matches **exact bill ID or exact phone number only** (it is served from SQLite and kept deliberately narrow). Local search keeps full substring matching. It is wired to `onSubmitEditing`, never `onChangeText` — per-keystroke remote lookups would cost a Firestore write each.
- The desktop's Firestore listeners live in the **main process** (`laundry desktop/src/main/sync.js`), not the renderer, because the renderer runs with `contextIsolation: true` / `nodeIntegration: false` and cannot require the SDK.
- Both apps authenticate with **anonymous auth**; rules require `request.auth != null` and deny everything outside the paths above.
- A search-miss needs the desktop running to be answered; the phone reports "shop computer is offline" after a 10s timeout.

### Pricing, customers and device control

- **Item names are shared across every customer category; prices are per category.** A "Saree" is the same garment whoever brings it in, so adding, renaming or deleting an item applies to all categories at once (`addItemEverywhere` / `renameItemEverywhere` / `removeItemEverywhere` in `settingsStorage.js`, mirrored in the desktop's `settings.js`). Editing a *price* touches only the category being edited.
- Whichever app connects to an empty shop first seeds `config/pricing` from its built-in defaults — `DEFAULT_CATEGORIES_PRICING` in `theme/theme.js` on mobile, `src/main/defaultPricing.js` on desktop. **These two must agree on day one**; afterwards the shared document is authoritative and neither is consulted again.
- **Device control is UI-gated, not rules-enforced.** The desktop's Device Control tab flips `canCustomize` on a device doc; the mobile Settings screen hides its editors when that flag is false. A determined user could bypass it — the threat model is "which worker's phone can change prices", not defending against a modified APK.
- A phone registers itself on launch (`registerDevice`) and never writes its own `canCustomize`; `merge: true` leaves the desktop's value intact on re-registration.
- Marking a bill paid rolls its weight and amount into the customer's lifetime stats on **both** platforms (`CustomerService.updateStats` on mobile, `shared.addCustomerStats` on desktop) and republishes the customer. The desktop guards against double-counting by checking the bill was not already `Completed`.
- **Completion syncs both ways.** A phone marking a bill paid flags it unsynced and republishes it to `bills_inbox`; the desktop marking a bill paid calls `shared.broadcastStatus`, which writes to **every** registered phone's inbox rather than only the originating one — any phone may hold a copy pulled down via search, and each applies the update only if it actually has that bill.

### Revenue is a ledger, not a sum over bills

`revenue_ledger` is a separate table, written whenever a bill becomes `Completed` (both when this desktop completes one and when an already-paid bill arrives from a phone). It is keyed on `billId` and upserts, so completing twice never double-counts.

**Deleting a bill deliberately does not touch the ledger.** Deleting is a bookkeeping action on the order; it must never rewrite history by erasing money that was actually collected. Every revenue figure in the app reads from `revenue_ledger` — never `SUM(bills.totalAmount)`. Pending figures still come from the `bills` table, because an unpaid bill is a live order rather than history.

Databases predating the ledger are backfilled from existing completed bills on first run, so upgrading never shows zero revenue.

`getRevenueStats({ mode, count })` buckets by `'days'`, `'months'` or `'years'`; the Revenue tab exposes 7/30/90 days, 6/12 months and 5 years.

### Storage location

The desktop's data folder is user-selectable from Settings. The pointer to it (`storage-location.json`) always stays in `userData` — it cannot live in the folder being moved. Choosing a folder creates `WrinkleLaundry` inside it, copies the database across, and renames the old file to `.bak` rather than deleting it. If the target already contains a database it is **adopted, not overwritten**, so re-selecting a previously used folder resumes that data. A configured directory that no longer exists (unplugged drive) falls back to `userData` rather than refusing to start.

### Desktop UI (`renderer/js/`)

Plain scripts loaded in order, each attaching one global — no bundler, no modules.

- `format.js` (`window.Fmt`) — **port of the mobile `utils/helpers.js`**. `buildBillMessage` must stay byte-identical to the mobile version; customers receive receipts from both, and a drift would be visible. Change one, change the other.
- `state.js` (`window.App`) — shared caches, DOM/IPC helpers, and the inline SVG `icon()` set. Tabs read from here rather than calling IPC themselves.
- `billing.js`, `customers.js`, `expenses.js`, `settings.js`, `revenue.js`, `finance.js` — one tab each.
- `app.js` — shell, sidebar routing, the Bills tab, and the live-sync subscription that refreshes the right cache per topic. It also owns the top-bar primary button, whose label and action swap per tab (`PRIMARY_ACTION`) — individual tabs must not bind it.
- `styles/app.css` is the whole design system: dark navy sidebar against a light working area, white cards, tinted stat tiles. There is no second stylesheet.
- Charts in `revenue.js` and `finance.js` are hand-rolled inline SVG: no chart library and no CDN, so the dashboards work with no internet. Revenue charts are single-series (identity from the axis, no legend); the finance chart pairs revenue against expenses, which are opposed quantities rather than two categories, so it uses a diverging pair plus a legend.
- Anything originating from another device is escaped with `esc()` before it reaches `innerHTML`.

**Static checks worth re-running after UI edits** (no test framework here): every `$('id')` must exist in `index.html`, every `window.X` must be defined somewhere, and every `window.api.X` must be exposed in `preload.js`. A missing id or an undefined global is a silent runtime crash — that class of bug took down the mobile History tab once already.

**`window.prompt()` does not exist in Electron** — it throws `prompt() is and will not be supported`, which silently killed item rename and device rename. Use `App.askText({ title, help, value })`, which resolves to the trimmed string or `null`. `alert()` and `confirm()` do work.

**Debugging the renderer:** the packaged app has no devtools, so `main.js` forwards renderer console errors to the terminal. For anything deeper, start with `npx electron . --remote-debugging-port=9333` and drive it with `scripts/verify/probe-renderer.js "<expression>"` — that evaluates JavaScript in the live page without stealing focus, which matters because this is the user's working machine.

### New Bill is a tab, not a modal

`billing.js` renders the `newbill` panel as a point-of-sale screen: customer bar, service cards, item tiles, and a sticky "Live Order" column. The draft survives tab switches — only `reset()` clears it, after a bill is generated or the user clicks Clear. Customer selection lists everyone on focus (not just on typing), matches name/mobile/category, and offers an inline "add as new customer" that returns straight to the till via the `onSaved` callback on `Customers.openModal`.

### Expenses and finance

- `expenses` table plus an `expenses` Firestore collection, mirrored the same way customers are, so several Command Centers share one set of books.
- Finance derives everything: profit is ledger revenue minus expenses over the same buckets the Revenue tab uses, so the two tabs can never disagree. Margin is `null` rather than `0` when nothing was earned, so the UI shows "—" instead of a misleading 0%.

### Multiple Command Centers

- Each desktop registers under a **stable per-machine id** (`machine-id.json` in `userData`), not the literal `"desktop"` — otherwise two would overwrite each other's registry entry.
- Desktop-raised bills publish to **`desk_bills`**, a durable collection, rather than `bills_inbox`. The inbox is consume-and-delete, so with two desktops whichever saw a document first would delete it before the other did. Each desktop skips its own writes via `recordedByDesk`.
- **The bill archive is shared, not per-machine.** When a desktop drains a bill from `bills_inbox` it republishes it to `bills` *before* deleting the mailbox doc — otherwise the bill would exist only on whichever Command Center happened to look first. Desktop-raised bills publish there too.
- **`publishedAt` drives a backfill.** A row with `publishedAt IS NULL` has never reached the shared archive; `shared.publishPending()` runs on startup and after status changes to push those up. This is what carries an existing machine's whole history — phone bills consumed before the archive existed, and every revenue entry — to a newly installed Command Center. Mirroring *from* the cloud sets `publishedAt` so it cannot echo back.
- `cartItems` is an array locally but a JSON **string** in the shared archive. `addBill` normalises it; `recordRevenue` maps over it and will throw on a raw string.

### OneDrive is a backup, never the live database

**A live SQLite file inside OneDrive does not sync.** The app holds the handle open for as long as it runs, and OneDrive skips open files — so the data only appears on other machines after the app is closed, moved out and back. Learned the hard way.

So the live database stays in `userData`, and the app writes a **consistent snapshot** (SQLite's online backup API, safe mid-write) to `OneDrive/WrinkleLaundry Backup/` every 10 minutes, 30 seconds after launch, and on quit. Settings detects a database sitting inside a cloud folder and offers a one-click repair that moves it local and turns backups on.

Cross-machine *sharing* is Firestore's job, not OneDrive's — OneDrive is disaster recovery.

### Legacy database migration

The first version of this app had `items TEXT NOT NULL` on `bills`. A machine still holding that schema fails **every** insert with `NOT NULL constraint failed: bills.items`, because nothing populates it any more. SQLite cannot drop a constraint with `ALTER TABLE`, so `migrateLegacyBills()` rebuilds the table to the canonical schema and copies the overlapping columns across. It runs after the `ADD COLUMN` pass and triggers only when a NOT NULL column without a default exists outside `CANONICAL_BILL_COLUMNS` — so add new columns to that list or the migration will try to drop them.
