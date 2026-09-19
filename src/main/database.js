const Database = require('better-sqlite3');
const path = require('path');
const fsx = require('fs');
const { app } = require('electron');

const DB_NAME = 'wrinkle-laundry.db';
const FOLDER_NAME = 'WrinkleLaundry';

// Where the data folder lives is user-configurable, so the pointer to it must
// NOT live in the data folder. It always stays in userData.
function locationConfigPath() {
  return path.join(app.getPath('userData'), 'storage-location.json');
}

function readStorageDir() {
  try {
    const { directory } = JSON.parse(fsx.readFileSync(locationConfigPath(), 'utf8'));
    if (directory && fsx.existsSync(directory)) return directory;
  } catch (e) {
    // No config yet, or it points somewhere that no longer exists (an unplugged
    // drive, a deleted folder). Fall back rather than refusing to start.
  }
  return app.getPath('userData');
}

function writeStorageDir(directory) {
  fsx.writeFileSync(locationConfigPath(), JSON.stringify({ directory }, null, 2));
}

let db = null;
let currentDir = null;

function open(directory) {
  if (db) {
    try { db.close(); } catch (e) {}
    db = null;
  }
  fsx.mkdirSync(directory, { recursive: true });
  db = new Database(path.join(directory, DB_NAME));
  currentDir = directory;
  initDB();
}

function initDB() {
  // Main bills table — columns aligned to what the mobile app sends
  db.exec(`
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      billId TEXT UNIQUE,
      customerName TEXT NOT NULL,
      customerCategory TEXT DEFAULT 'Student',
      phone TEXT NOT NULL DEFAULT '',
      cartItems TEXT DEFAULT '[]',
      totalWeight REAL DEFAULT 0,
      totalClothesCount INTEGER DEFAULT 0,
      totalAmount REAL NOT NULL DEFAULT 0,
      dueDate TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      completedAt TEXT,
      createdAt INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add columns that may not exist on older DBs (safe migration)
  const columnsToAdd = [
    { name: 'customerCategory', type: "TEXT DEFAULT 'Student'" },
    { name: 'cartItems', type: "TEXT DEFAULT '[]'" },
    { name: 'totalWeight', type: 'REAL DEFAULT 0' },
    { name: 'totalClothesCount', type: 'INTEGER DEFAULT 0' },
    { name: 'dueDate', type: 'TEXT' },
    { name: 'completedAt', type: 'TEXT' },
    { name: 'createdAt', type: 'INTEGER' },
    { name: 'createdByDevice', type: 'TEXT' },
    { name: 'customerId', type: 'TEXT' },
  ];

  for (const col of columnsToAdd) {
    try {
      db.exec(`ALTER TABLE bills ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // Column already exists — ignore
    }
  }

  // Local mirror of the shared customer directory. Firestore is authoritative;
  // this copy keeps the desktop usable when the connection drops.
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL DEFAULT '',
      category TEXT DEFAULT 'Student',
      totalWeight REAL DEFAULT 0,
      totalAmountPaid REAL DEFAULT 0,
      createdAt INTEGER,
      updatedAt INTEGER
    )
  `);

  // Key/value store for shared config (pricing JSON), cached the same way.
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt INTEGER
    )
  `);

  // Immutable record of money actually collected.
  //
  // Deliberately separate from `bills`: deleting a bill is a bookkeeping action
  // on the order, and must never rewrite history by erasing revenue that was
  // genuinely taken. Every revenue figure in the app reads from here, never
  // from the bills table.
  db.exec(`
    CREATE TABLE IF NOT EXISTS revenue_ledger (
      billId TEXT PRIMARY KEY,
      amount REAL NOT NULL DEFAULT 0,
      weight REAL DEFAULT 0,
      customerCategory TEXT,
      customerId TEXT,
      customerName TEXT,
      services TEXT DEFAULT '[]',
      collectedAt INTEGER NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_ledger_collected ON revenue_ledger (collectedAt)');

  backfillLedger();
}

/**
 * One-time catch-up for databases that predate the ledger: any bill already
 * marked Completed gets an entry, so upgrading doesn't show zero revenue.
 */
function backfillLedger() {
  const already = db.prepare('SELECT COUNT(*) AS n FROM revenue_ledger').get().n;
  if (already > 0) return;
  const completed = db.prepare("SELECT * FROM bills WHERE status = 'Completed'").all();
  for (const bill of completed) {
    recordRevenue({ ...bill, cartItems: safeJsonParse(bill.cartItems, []) });
  }
}

function collectedTimestamp(bill) {
  const fromCompleted = bill.completedAt ? Date.parse(bill.completedAt) : NaN;
  if (Number.isFinite(fromCompleted)) return fromCompleted;
  if (Number.isFinite(bill.createdAt)) return bill.createdAt;
  const fromTimestamp = bill.timestamp ? Date.parse(bill.timestamp) : NaN;
  return Number.isFinite(fromTimestamp) ? fromTimestamp : Date.now();
}

/** Idempotent on billId — completing an already-recorded bill updates, never duplicates. */
function recordRevenue(bill) {
  const services = (bill.cartItems || []).map((ci) => ({
    serviceType: ci.serviceType || 'OTHER',
    subtotal: ci.subtotal || 0,
  }));

  db.prepare(`
    INSERT INTO revenue_ledger (billId, amount, weight, customerCategory, customerId, customerName, services, collectedAt)
    VALUES (@billId, @amount, @weight, @customerCategory, @customerId, @customerName, @services, @collectedAt)
    ON CONFLICT(billId) DO UPDATE SET
      amount = excluded.amount,
      weight = excluded.weight,
      customerCategory = excluded.customerCategory,
      customerId = excluded.customerId,
      customerName = excluded.customerName,
      services = excluded.services,
      collectedAt = excluded.collectedAt
  `).run({
    billId: bill.billId || bill.id,
    amount: bill.totalAmount || 0,
    weight: bill.totalWeight || 0,
    customerCategory: bill.customerCategory || 'Student',
    customerId: bill.customerId || null,
    customerName: bill.customerName || null,
    services: JSON.stringify(services),
    collectedAt: collectedTimestamp(bill),
  });
}

open(readStorageDir());

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

function pad(n) { return String(n).padStart(2, '0'); }
function dayKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function monthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function yearKey(d) { return String(d.getFullYear()); }

module.exports = {
  // ── Storage location ────────────────────────────────────────────────────

  getStorageInfo: () => ({
    directory: currentDir,
    dbPath: path.join(currentDir, DB_NAME),
    isDefault: currentDir === app.getPath('userData'),
  }),

  /**
   * Move the data folder to a directory the user picked. Creates a
   * "WrinkleLaundry" folder inside it, copies the database across, then
   * switches to it. The old file is renamed rather than deleted so a failed
   * move is always recoverable.
   */
  relocateStorage: (targetParent) => {
    const targetDir = path.join(targetParent, FOLDER_NAME);
    const targetDb = path.join(targetDir, DB_NAME);
    const sourceDb = path.join(currentDir, DB_NAME);

    if (path.resolve(targetDir) === path.resolve(currentDir)) {
      return { directory: currentDir, dbPath: sourceDb, moved: false };
    }

    fsx.mkdirSync(targetDir, { recursive: true });

    // If the target already holds a database, adopt it rather than overwriting —
    // re-selecting a folder used previously should resume that data, not destroy it.
    const adopting = fsx.existsSync(targetDb);

    if (db) { try { db.close(); } catch (e) {} db = null; }

    if (!adopting) {
      fsx.copyFileSync(sourceDb, targetDb);
      // Copy sidecar files too if the journal mode ever produces them.
      for (const suffix of ['-wal', '-shm']) {
        if (fsx.existsSync(sourceDb + suffix)) fsx.copyFileSync(sourceDb + suffix, targetDb + suffix);
      }
    }

    open(targetDir);
    writeStorageDir(targetDir);

    if (!adopting && fsx.existsSync(sourceDb)) {
      try { fsx.renameSync(sourceDb, sourceDb + '.bak'); } catch (e) {}
    }

    return { directory: targetDir, dbPath: targetDb, moved: true, adopted: adopting };
  },

  // ── Bills ───────────────────────────────────────────────────────────────

  getBills: () => {
    const rows = db.prepare('SELECT * FROM bills ORDER BY timestamp DESC').all();
    return rows.map((row) => ({
      ...row,
      cartItems: safeJsonParse(row.cartItems, []),
      items: row.items ? safeJsonParse(row.items, []) : undefined,
    }));
  },

  /**
   * Add or update a bill from mobile sync.
   * Handles the mobile app's field naming convention:
   *   Mobile sends: { id, customerName, mobile, cartItems, totalAmount, status, ... }
   *   DB expects:   { billId, customerName, phone, cartItems, totalAmount, status, ... }
   */
  addBill: (bill) => {
    const billId = bill.billId || bill.id || ('SYNC-' + Date.now());
    const customerName = bill.customerName || bill.studentName || 'Unknown';
    const phone = bill.phone || bill.mobile || '';
    const customerCategory = bill.customerCategory || 'Student';
    const cartItemsArr = bill.cartItems || bill.items || [];
    const cartItems = JSON.stringify(cartItemsArr);
    const totalWeight = bill.totalWeight || bill.weight || 0;
    const totalClothesCount = bill.totalClothesCount || bill.clothesCount || 0;
    const totalAmount = bill.totalAmount || 0;
    const dueDate = bill.dueDate || null;
    const status = bill.status || 'Pending';
    const completedAt = bill.completedAt || null;
    const createdAt = bill.createdAt || Date.now();
    const timestamp = bill.timestamp || new Date().toISOString();
    // Which device originated this bill — status changes are routed back to it.
    const createdByDevice = bill.createdByDevice || null;
    // Links the bill to the shared customer directory so marking it paid can
    // roll the amount into that customer's lifetime stats.
    const customerId = bill.customerId || bill.studentId || null;

    // A single atomic upsert rather than check-then-insert: Firestore can
    // deliver the same document to two overlapping snapshot callbacks, and the
    // old read-then-write pattern lost that race with a UNIQUE constraint error.
    db.prepare(`
      INSERT INTO bills (billId, customerName, customerCategory, phone, cartItems,
        totalWeight, totalClothesCount, totalAmount, dueDate, status, completedAt,
        createdAt, timestamp, createdByDevice, customerId)
      VALUES (@billId, @customerName, @customerCategory, @phone, @cartItems,
        @totalWeight, @totalClothesCount, @totalAmount, @dueDate, @status, @completedAt,
        @createdAt, @timestamp, @createdByDevice, @customerId)
      ON CONFLICT(billId) DO UPDATE SET
        customerName = excluded.customerName,
        customerCategory = excluded.customerCategory,
        phone = excluded.phone,
        cartItems = excluded.cartItems,
        totalWeight = excluded.totalWeight,
        totalClothesCount = excluded.totalClothesCount,
        totalAmount = excluded.totalAmount,
        dueDate = excluded.dueDate,
        status = excluded.status,
        completedAt = excluded.completedAt,
        createdAt = excluded.createdAt,
        timestamp = excluded.timestamp,
        createdByDevice = COALESCE(excluded.createdByDevice, bills.createdByDevice),
        customerId = COALESCE(excluded.customerId, bills.customerId)
    `).run({
      billId, customerName, customerCategory, phone, cartItems,
      totalWeight, totalClothesCount, totalAmount,
      dueDate, status, completedAt, createdAt, timestamp, createdByDevice, customerId,
    });

    // A bill can arrive from a phone already marked paid, so the ledger is
    // written here too — not only when this desktop completes a bill itself.
    if (status === 'Completed') {
      recordRevenue({
        billId, totalAmount, totalWeight, customerCategory, customerId,
        customerName, cartItems: cartItemsArr, completedAt, createdAt, timestamp,
      });
    }

    return billId;
  },

  updateBillStatus: (billId, status) => {
    const completedAt = status === 'Completed' ? new Date().toISOString() : null;
    db.prepare('UPDATE bills SET status = ?, completedAt = ? WHERE billId = ?')
      .run(status, completedAt, billId);

    if (status === 'Completed') {
      const bill = db.prepare('SELECT * FROM bills WHERE billId = ?').get(billId);
      if (bill) recordRevenue({ ...bill, cartItems: safeJsonParse(bill.cartItems, []) });
    }
  },

  findBillById: (billId) => {
    const row = db.prepare('SELECT * FROM bills WHERE billId = ?').get(billId);
    if (!row) return undefined;
    return { ...row, cartItems: safeJsonParse(row.cartItems, []) };
  },

  findBillsByPhone: (phone) => {
    const rows = db.prepare('SELECT * FROM bills WHERE phone = ? ORDER BY timestamp DESC').all(phone);
    return rows.map((row) => ({ ...row, cartItems: safeJsonParse(row.cartItems, []) }));
  },

  /** Removes the order. The revenue ledger is deliberately left untouched. */
  deleteBill: (billId) => {
    db.prepare('DELETE FROM bills WHERE billId = ?').run(billId);
  },

  // ── Customers (mirror of the shared directory) ──────────────────────────

  getCustomers: () => db.prepare('SELECT * FROM customers ORDER BY name COLLATE NOCASE').all(),

  upsertCustomer: (c) => {
    db.prepare(`
      INSERT INTO customers (id, name, mobile, category, totalWeight, totalAmountPaid, createdAt, updatedAt)
      VALUES (@id, @name, @mobile, @category, @totalWeight, @totalAmountPaid, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        mobile = excluded.mobile,
        category = excluded.category,
        totalWeight = excluded.totalWeight,
        totalAmountPaid = excluded.totalAmountPaid,
        updatedAt = excluded.updatedAt
    `).run({
      id: c.id,
      name: c.name || 'Unknown',
      mobile: c.mobile || '',
      category: c.category || 'Student',
      totalWeight: c.totalWeight || 0,
      totalAmountPaid: c.totalAmountPaid || 0,
      createdAt: c.createdAt || Date.now(),
      updatedAt: c.updatedAt || Date.now(),
    });
  },

  deleteCustomer: (id) => {
    db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  },

  /** Accumulate lifetime stats, mirroring CustomerService.updateStats on mobile. */
  addCustomerStats: (id, addedWeight, addedAmount) => {
    db.prepare(`
      UPDATE customers
      SET totalWeight = COALESCE(totalWeight, 0) + ?,
          totalAmountPaid = COALESCE(totalAmountPaid, 0) + ?,
          updatedAt = ?
      WHERE id = ?
    `).run(addedWeight || 0, addedAmount || 0, Date.now(), id);
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  },

  // ── Shared config cache ─────────────────────────────────────────────────

  getConfig: (key) => {
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key);
    return row ? safeJsonParse(row.value, null) : null;
  },

  setConfig: (key, value) => {
    db.prepare(`
      INSERT INTO app_config (key, value, updatedAt) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
    `).run(key, JSON.stringify(value), Date.now());
  },

  // ── Revenue reporting (always from the ledger) ──────────────────────────

  /**
   * @param {object} opts
   *   mode  — 'days' | 'months' | 'years'
   *   count — how many buckets back from now (days: 30, months: 12, years: 5)
   *
   * Revenue figures come from revenue_ledger so deleting a bill never reduces
   * them. Pending figures come from the bills table, because an unpaid bill is
   * a live order rather than history.
   */
  getRevenueStats: ({ mode = 'days', count = 30 } = {}) => {
    const entries = db.prepare('SELECT * FROM revenue_ledger').all();
    const bills = db.prepare('SELECT status, totalAmount FROM bills').all();

    const buckets = new Map();
    const now = new Date();

    if (mode === 'months') {
      for (let i = count - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.set(monthKey(d), { revenue: 0, bills: 0 });
      }
    } else if (mode === 'years') {
      for (let i = count - 1; i >= 0; i--) {
        buckets.set(String(now.getFullYear() - i), { revenue: 0, bills: 0 });
      }
    } else {
      for (let i = count - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        buckets.set(dayKey(d), { revenue: 0, bills: 0 });
      }
    }

    const keyFor = mode === 'months' ? monthKey : mode === 'years' ? yearKey : dayKey;

    let totalRevenue = 0;
    const byCategory = new Map();
    const byService = new Map();

    for (const entry of entries) {
      totalRevenue += entry.amount || 0;

      const cat = entry.customerCategory || 'Student';
      byCategory.set(cat, (byCategory.get(cat) || 0) + (entry.amount || 0));

      for (const svc of safeJsonParse(entry.services, [])) {
        const name = svc.serviceType || 'OTHER';
        byService.set(name, (byService.get(name) || 0) + (svc.subtotal || 0));
      }

      const slot = buckets.get(keyFor(new Date(entry.collectedAt)));
      if (slot) { slot.revenue += entry.amount || 0; slot.bills += 1; }
    }

    let pendingCount = 0, pendingValue = 0;
    for (const b of bills) {
      if ((b.status || 'Pending') !== 'Completed') {
        pendingCount++;
        pendingValue += b.totalAmount || 0;
      }
    }

    const series = Array.from(buckets, ([key, v]) => ({ key, ...v }));

    return {
      mode,
      series,
      // Sum over the visible window, so the tile matches the chart.
      windowRevenue: series.reduce((s, b) => s + b.revenue, 0),
      windowBills: series.reduce((s, b) => s + b.bills, 0),
      totalRevenue,
      collectedCount: entries.length,
      pendingCount,
      pendingValue,
      totalBills: bills.length,
      byCategory: Array.from(byCategory, ([name, revenue]) => ({ name, revenue }))
        .sort((a, b) => b.revenue - a.revenue),
      byService: Array.from(byService, ([name, revenue]) => ({ name, revenue }))
        .sort((a, b) => b.revenue - a.revenue),
    };
  },
};
