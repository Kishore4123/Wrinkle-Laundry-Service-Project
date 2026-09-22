// Throwaway verification.
// Replays database.js's legacy-bills migration against a synthetic old-schema
// database, proving the "NOT NULL constraint failed: bills.items" crash is gone
// and that existing rows survive.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const P = 'C:/Users/SANDEE~1.K/AppData/Local/Temp/legacy-test.db';

const CANONICAL = [
  'id', 'billId', 'customerName', 'customerCategory', 'phone', 'cartItems',
  'totalWeight', 'totalClothesCount', 'totalAmount', 'dueDate', 'status',
  'completedAt', 'createdAt', 'timestamp', 'createdByDevice', 'customerId',
  'publishedAt',
];

const db = new DatabaseSync(P);

// Same ADD COLUMN pass the app runs first.
for (const col of [
  ["customerCategory", "TEXT DEFAULT 'Student'"], ['cartItems', "TEXT DEFAULT '[]'"],
  ['totalWeight', 'REAL DEFAULT 0'], ['totalClothesCount', 'INTEGER DEFAULT 0'],
  ['dueDate', 'TEXT'], ['completedAt', 'TEXT'], ['createdAt', 'INTEGER'],
  ['createdByDevice', 'TEXT'], ['customerId', 'TEXT'], ['publishedAt', 'INTEGER'],
]) {
  try { db.exec(`ALTER TABLE bills ADD COLUMN ${col[0]} ${col[1]}`); } catch (e) {}
}

const before = db.prepare('PRAGMA table_info(bills)').all();
const blocking = before.filter(
  (c) => c.notnull === 1 && c.dflt_value === null && !CANONICAL.includes(c.name)
);
console.log('blocking legacy columns detected:', blocking.map((c) => c.name).join(', ') || '(none)');

if (blocking.length) {
  const carried = before.map((c) => c.name).filter((n) => CANONICAL.includes(n));
  const list = carried.join(', ');
  db.exec('PRAGMA foreign_keys=OFF');
  db.exec('BEGIN');
  db.exec(`
    CREATE TABLE bills_migrated (
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
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdByDevice TEXT,
      customerId TEXT,
      publishedAt INTEGER
    )`);
  db.exec(`INSERT INTO bills_migrated (${list}) SELECT ${list} FROM bills`);
  db.exec('DROP TABLE bills');
  db.exec('ALTER TABLE bills_migrated RENAME TO bills');
  db.exec('COMMIT');
  db.exec('PRAGMA foreign_keys=ON');
}

const after = db.prepare('PRAGMA table_info(bills)').all().map((c) => c.name);
console.log('items column gone:', !after.includes('items'));
console.log('rows preserved:', db.prepare('SELECT COUNT(*) n FROM bills').get().n);
const row = db.prepare('SELECT billId, customerName, totalAmount, status FROM bills').get();
console.log('legacy row intact:', JSON.stringify(row));

// The insert that used to fail.
let insertOk = true, err = '';
try {
  db.prepare(`
    INSERT INTO bills (billId, customerName, customerCategory, phone, cartItems,
      totalWeight, totalClothesCount, totalAmount, dueDate, status, completedAt,
      createdAt, timestamp, createdByDevice, customerId, publishedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run('NEW-001', 'After Migration', 'Student', '9111111111', '[]',
    6, 14, 480, null, 'Pending', null, Date.now(), new Date().toISOString(), null, null, null);
} catch (e) { insertOk = false; err = e.message; }

console.log(insertOk ? 'PASS insert  — new bill inserts cleanly' : `FAIL insert  — ${err}`);
console.log('final row count:', db.prepare('SELECT COUNT(*) n FROM bills').get().n);
db.close();
process.exit(insertOk && !after.includes('items') ? 0 : 1);
