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
  ];

  for (const col of columnsToAdd) {
    try {
      db.exec(`ALTER TABLE bills ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // Column already exists — ignore
    }
  }
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
          timestamp = ?
        WHERE billId = ?
      `);
      updateStmt.run(
        customerName, customerCategory, phone, cartItems,
        totalWeight, totalClothesCount, totalAmount,
        dueDate, status, completedAt, createdAt, timestamp, billId
      );
      return existing.id;
    }

    // Insert new bill
    const insertStmt = db.prepare(`
      INSERT INTO bills (billId, customerName, customerCategory, phone, cartItems,
        totalWeight, totalClothesCount, totalAmount, dueDate, status, completedAt, createdAt, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = insertStmt.run(
      billId, customerName, customerCategory, phone, cartItems,
      totalWeight, totalClothesCount, totalAmount,
      dueDate, status, completedAt, createdAt, timestamp
    );
    return info.lastInsertRowid;
  },

  updateBillStatus: (billId, status) => {
    const completedAt = status === 'Completed' ? new Date().toISOString() : null;
    const stmt = db.prepare('UPDATE bills SET status = ?, completedAt = ? WHERE billId = ?');
    stmt.run(status, completedAt, billId);
  },
};

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}
