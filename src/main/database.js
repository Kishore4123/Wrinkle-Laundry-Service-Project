const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

// Get path to user data directory for persistence
const dbPath = path.join(app.getPath('userData'), 'wrinkle-laundry.db');
const db = new Database(dbPath, { verbose: console.log });

// Initialize database schema
function initDB() {
  // Main bills table — columns aligned to what the mobile app sends
  const createBillsTable = `
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
  `;
  db.exec(createBillsTable);

  // Add columns that may not exist on older DBs (safe migration)
  const columnsToAdd = [
    { name: 'customerCategory', type: 'TEXT DEFAULT \'Student\'' },
    { name: 'cartItems', type: 'TEXT DEFAULT \'[]\'' },
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
}

initDB();

module.exports = {
  getBills: () => {
    const stmt = db.prepare('SELECT * FROM bills ORDER BY timestamp DESC');
    const rows = stmt.all();
    return rows.map(row => ({
      ...row,
      cartItems: safeJsonParse(row.cartItems, []),
      // Keep legacy 'items' field parsed too if it exists
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
    // Map mobile field names → DB field names
    const billId = bill.billId || bill.id || ('SYNC-' + Date.now());
    const customerName = bill.customerName || bill.studentName || 'Unknown';
    const phone = bill.phone || bill.mobile || '';
    const customerCategory = bill.customerCategory || 'Student';
    const cartItems = JSON.stringify(bill.cartItems || bill.items || []);
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

    // Check if bill already exists (upsert)
    const checkStmt = db.prepare('SELECT id FROM bills WHERE billId = ?');
    const existing = checkStmt.get(billId);

    if (existing) {
      // Update existing bill
      const updateStmt = db.prepare(`
        UPDATE bills SET
          customerName = ?,
          customerCategory = ?,
          phone = ?,
          cartItems = ?,
          totalWeight = ?,
          totalClothesCount = ?,
          totalAmount = ?,
          dueDate = ?,
          status = ?,
          completedAt = ?,
          createdAt = ?,
          timestamp = ?,
          createdByDevice = COALESCE(?, createdByDevice),
          customerId = COALESCE(?, customerId)
        WHERE billId = ?
      `);
      updateStmt.run(
        customerName, customerCategory, phone, cartItems,
        totalWeight, totalClothesCount, totalAmount,
        dueDate, status, completedAt, createdAt, timestamp, createdByDevice, customerId, billId
      );
      return existing.id;
    }

    // Insert new bill
    const insertStmt = db.prepare(`
      INSERT INTO bills (billId, customerName, customerCategory, phone, cartItems,
        totalWeight, totalClothesCount, totalAmount, dueDate, status, completedAt, createdAt, timestamp, createdByDevice, customerId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = insertStmt.run(
      billId, customerName, customerCategory, phone, cartItems,
      totalWeight, totalClothesCount, totalAmount,
      dueDate, status, completedAt, createdAt, timestamp, createdByDevice, customerId
    );
    return info.lastInsertRowid;
  },

  updateBillStatus: (billId, status) => {
    const completedAt = status === 'Completed' ? new Date().toISOString() : null;
    const stmt = db.prepare('UPDATE bills SET status = ?, completedAt = ? WHERE billId = ?');
    stmt.run(status, completedAt, billId);
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
    if (!row) return null;
    return safeJsonParse(row.value, null);
  },

  setConfig: (key, value) => {
    db.prepare(`
      INSERT INTO app_config (key, value, updatedAt) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
    `).run(key, JSON.stringify(value), Date.now());
  },

  // ── Revenue reporting ───────────────────────────────────────────────────

  /**
   * Revenue per calendar day over the last N days, plus headline totals.
   * Only completed bills count toward revenue — pending ones aren't paid yet.
   */
  getRevenueStats: (days = 30) => {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const bills = db.prepare('SELECT * FROM bills').all();

    const billDate = (b) => {
      const ts = b.createdAt || (b.timestamp ? Date.parse(b.timestamp) : null);
      return Number.isFinite(ts) ? ts : null;
    };

    const byDay = new Map();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      byDay.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        { revenue: 0, bills: 0 });
    }

    let totalRevenue = 0, completedCount = 0, pendingCount = 0, pendingValue = 0;
    const byCategory = new Map();
    const byService = new Map();

    for (const b of bills) {
      const amount = b.totalAmount || 0;
      const isComplete = (b.status || 'Pending') === 'Completed';
      if (isComplete) {
        totalRevenue += amount;
        completedCount++;
        const cat = b.customerCategory || 'Student';
        byCategory.set(cat, (byCategory.get(cat) || 0) + amount);
        for (const ci of safeJsonParse(b.cartItems, [])) {
          const svc = ci.serviceType || 'OTHER';
          byService.set(svc, (byService.get(svc) || 0) + (ci.subtotal || 0));
        }
      } else {
        pendingCount++;
        pendingValue += amount;
      }

      const ts = billDate(b);
      if (ts && ts >= since && isComplete) {
        const d = new Date(ts);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const slot = byDay.get(key);
        if (slot) { slot.revenue += amount; slot.bills += 1; }
      }
    }

    return {
      daily: Array.from(byDay, ([date, v]) => ({ date, ...v })),
      totalRevenue,
      completedCount,
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

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}
