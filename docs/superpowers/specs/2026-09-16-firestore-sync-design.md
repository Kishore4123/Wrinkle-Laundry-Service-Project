# Firestore Sync — Design

**Date:** 2026-09-16
**Status:** Approved for planning
**Replaces:** WebRTC peer-to-peer sync (signaling server + Metered TURN relay)

## Problem

The Wrinkle laundry system runs two apps: an Expo/React Native mobile app used by
workers who collect clothes in the field, and an Electron desktop app that sits in
the shop and holds the durable SQLite archive.

They currently sync over WebRTC, using a hosted signaling server and a Metered.ca
TURN relay whose credentials are hardcoded into both clients. That design has three
defects:

1. **Shared third-party quota.** Every deployment ships the same TURN credentials, so
   all customers draw from one free-tier bandwidth pool. One busy shop can exhaust it
   for everyone, and the vendor cannot fix that without paying.
2. **Both peers must be online simultaneously.** A bill created in the field reaches
   the shop only if the desktop is running at that moment.
3. **The reverse direction is dead code.** `app.js` sends `sync-bill` and `sync-status`
   to mobile, but `WebRTCManager._handleData` has no handler for either — both fall
   through to a `dataMessage` event that nothing subscribes to.

The business model is a one-time payment with local-first storage, explicitly sold
against competitors who charge annual server fees. Any replacement must not introduce
a recurring cost.

## Solution

Use Cloud Firestore as a **transient message mailbox**, not a database. Documents are
deleted as soon as they are consumed, so stored data stays near zero and the free
tier is never approached on storage. The desktop's SQLite database remains the single
authoritative archive.

Each shop gets its own Firebase project, so no quota is ever shared between customers.

### Collections

| Path | Writer | Reader | Lifecycle |
|---|---|---|---|
| `counters/bill_number` | all devices | all devices | permanent (single doc) |
| `bills_inbox/{billId}` | mobile | desktop | deleted after desktop ingests |
| `search_requests/{requestId}` | mobile | desktop | deleted after desktop answers |
| `device_inbox/{deviceId}/messages/{messageId}` | desktop | one mobile | deleted after that mobile applies |

`device_inbox` is partitioned per device because the system has **multiple mobile
devices**. A single shared outbox would break: the first phone to read a status update
would delete it before the others saw it. Each phone listens only to its own subtree.

`deviceId` is a UUID generated locally on first launch and stored in AsyncStorage.
There is no central device registry — collision probability is negligible and
registration would add a setup step and an online dependency for no benefit.

## Bill numbering

Bill IDs are allocated from **one centralized counter**, `counters/bill_number`,
incremented inside a Firestore transaction. Format: `WR-YYMMDD-NNN`, where `YYMMDD` is
the creation date and `NNN` is the global counter value padded to a *minimum* of three
digits — it grows to four and beyond past bill 999 rather than wrapping. The counter
never resets, so numbers ascend continuously across all devices and across days.

Every bill-generating device draws from this counter — mobile and desktop alike.

**Accepted consequence:** allocation requires a live Firestore transaction, so a device
with no connectivity **cannot create a bill**. This is a deliberate trade for
guaranteed-unique, gapless numbering. The failure must surface as an explicit,
actionable message ("No internet connection — a bill number cannot be reserved"), never
as a silent failure or a provisional number, because the bill number is printed on the
customer's WhatsApp receipt and must never change after issue.

The previous scheme — scanning local bills for the day's maximum sequence — is removed.
It produced duplicate IDs whenever two devices created bills without syncing in between.

Existing `WR-YYMMDD-XXX` bills remain valid historical records; no migration is applied
to them.

## Data flows

### Mobile creates a bill

1. Allocate the next number via transaction on `counters/bill_number`.
2. Build `billId`; save the bill to AsyncStorage with `synced: false`.
3. Write the full bill to `bills_inbox/{billId}`; on the write promise resolving, set
   `synced: true` locally.
4. Desktop's `bills_inbox` listener fires, calls the existing `addBill()` upsert
   (unchanged — its mobile→DB field mapping still does the work), then deletes the doc
   and refreshes its list.

The local copy is **retained on the phone until the user explicitly deletes it**. It is
never removed as a side effect of syncing.

Because step 1 already requires connectivity, step 3 will almost always succeed
immediately. A `synced` flag plus a `flushPending()` pass on app start still covers the
narrow window where the counter succeeds but the push fails.

### Desktop creates a bill

Allocates from the same counter, then writes directly to SQLite. **Desktop-created bills
are never uploaded to Firestore.** They live in the shop archive only.

Consequence: a field worker cannot look up a bill created at the shop counter unless the
desktop answers a search request for it (see below) — which it will, since search is
served from SQLite.

### Mobile searches for a bill

1. Search local AsyncStorage first, using the existing substring matching.
2. On a miss, write `search_requests/{requestId}` carrying `deviceId`, the query, and
   its type.
3. Desktop's listener queries SQLite, writes the results to
   `device_inbox/{deviceId}/messages/{requestId}`, and deletes the request.
4. Mobile's inbox listener receives the results, **caches them permanently into
   AsyncStorage** so all normal bill functions work on them, then deletes the message.
5. If no response arrives within 10 seconds, report "Shop computer is offline" and show
   local results only.

Remote lookup supports **exact bill ID and exact phone number** only. Firestore-side
substring matching is not possible, and here the query is served from SQLite anyway, so
the constraint is kept deliberately narrow: it covers the real cases (a customer presents
a bill QR, or gives their number) without inviting expensive scans. Local search keeps
its full substring behaviour.

### Status changes

- **Desktop → mobile:** desktop updates SQLite, looks up the bill's `createdByDevice`,
  and writes a status message to that device's inbox. That mobile applies it via a new
  `BillService.applyRemoteStatus()` and deletes the message.
- **Mobile → desktop:** the mobile re-pushes the full bill to `bills_inbox/{billId}`.
  The existing upsert handles it. No separate message type is needed.

Conflicts resolve last-write-wins. For a single shop marking bills complete, ordering
disputes are not a realistic failure mode and versioning would be unwarranted complexity.

### Deletion

- Deleting on mobile removes the local copy. If a `bills_inbox` doc is still pending, it
  is removed too.
- The desktop gains its own delete action, removing the bill from SQLite.
- The two archives are independent by design: deleting a bill from a worker's phone must
  not erase the shop's record of it.

## Security

Both apps sign in with **Firebase Anonymous Authentication** at startup. Rules require
`request.auth != null` and grant access only to the four collection paths above;
everything else is denied. This means extracting the config from the APK is not by itself
enough to read or tamper with shop data.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /counters/{counter}                      { allow read, write: if request.auth != null; }
    match /bills_inbox/{billId}                    { allow read, write: if request.auth != null; }
    match /search_requests/{requestId}             { allow read, write: if request.auth != null; }
    match /device_inbox/{deviceId}/messages/{msgId}{ allow read, write: if request.auth != null; }
    match /{document=**}                           { allow read, write: if false; }
  }
}
```

## SDK choice

The plain `firebase` JS SDK on both sides. Electron's renderer is Chromium, so it works
directly. On Expo it avoids a native rebuild, which `@react-native-firebase` would force.
React Native requires two non-obvious settings:

- `initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })` — without
  this the anonymous session is lost on every app restart.
- `initializeFirestore(app, { experimentalForceLongPolling: true })` — RN's streaming
  support is unreliable and listeners silently stall without it.

## Cost

Per bill: 1 counter transaction, 1 write, 1 desktop read, 1 delete — roughly 4–6
operations. At 200 bills/day that is about 1,200 operations against free-tier ceilings of
20K writes / 50K reads / 20K deletes per day, or under 6% utilisation. Stored bytes return
to near zero after each handoff, so the 1 GB storage ceiling is never a factor.

## Removals

**Mobile**
- `src/services/WebRTCManager.js` — deleted
- `src/services/WebRTCContext.js` → `src/services/SyncContext.js`, preserving the
  `isConnected` / `syncBill` surface so screen call sites barely change
- `src/components/PairingModal.js` — deleted; pairing is meaningless once the Firebase
  config *is* the pairing
- `react-native-webrtc` and `@config-plugins/react-native-webrtc` dependencies
- the WebRTC config plugin and the `RECORD_AUDIO` permission in `app.json`
- the `@wrinkle_offline_bills` parallel queue, superseded by the `synced` flag
- `expo-camera` is **kept** — `QRScannerScreen` uses it for customer bill lookup, which is
  unrelated to pairing

**Desktop**
- `src/renderer/js/webrtc.js` → `src/renderer/js/sync.js`
- `src/renderer/js/qr-modal.js`, the pairing modal markup in `index.html`, the
  `app:generateQR` IPC handler, and the `qrcode` dependency — all exist solely to display
  the pairing room code

**Schema:** `bills` gains a `createdByDevice` column via the existing
"add column if missing" migration loop in `database.js`.

## Verification

Neither app has test infrastructure, and standing one up is outside this change's scope.
Verification is:

1. A throwaway Node script that writes a bill into `bills_inbox` and asserts the desktop
   ingests it into SQLite and deletes the doc — this proves the desktop half without a
   phone.
2. A second script issuing a `search_requests` doc and asserting a correctly addressed
   `device_inbox` response.
3. Manual end-to-end runs for the mobile half: create a bill online, confirm it lands in
   SQLite; kill connectivity and confirm bill creation fails with the explicit message;
   search for a bill absent locally and confirm it is fetched and cached.

## Open risks

- **Desktop must be running** for a mobile search-miss to be answered. Acceptable while
  the shop computer is on during business hours, but it is a behavioural regression from
  a design that retained bills in the cloud.
- **No offline bill creation.** Explicitly accepted above; the sharpest user-visible
  consequence of centralized numbering.
- **Per-customer Firebase projects** are a manual packaging step at each sale. Out of
  scope here, but it is what keeps quotas isolated.
