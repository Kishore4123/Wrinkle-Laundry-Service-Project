const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const os = require('os');
const path = require('path');
const fsx = require('fs');
const db = require('./database');
const shared = require('./shared');
const { initSync, allocateBillNumber } = require('./sync');

// No File/Edit/View/Window/Help bar — this is a point-of-sale app, not a
// document editor, and the default menu just eats vertical space.
Menu.setApplicationMenu(null);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Surface renderer errors in the terminal. There is no devtools in the
  // packaged app, so without this a renderer exception is completely silent —
  // the UI just stops responding with no clue why.
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[renderer] ${message}  (${sourceId}:${line})`);
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

/**
 * A stable id for this computer, so several Command Centers in one shop stay
 * distinguishable in the device registry and in shared records.
 */
function machineIdentity() {
  const file = path.join(app.getPath('userData'), 'machine-id.json');
  try {
    const saved = JSON.parse(fsx.readFileSync(file, 'utf8'));
    if (saved.id) return saved;
  } catch (e) {
    // First run on this machine.
  }
  const identity = {
    id: `desk-${Math.random().toString(36).slice(2, 10)}`,
    name: `Command Center (${os.hostname()})`,
  };
  try { fsx.writeFileSync(file, JSON.stringify(identity, null, 2)); } catch (e) {}
  return identity;
}

const MACHINE = machineIdentity();

app.whenReady().then(() => {
  createWindow();

  initSync({
    machineId: MACHINE.id,
    machineName: MACHINE.name,
    onChange: (topic) => {
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send('sync:changed', topic || 'bills')
      );
    },
  }).catch((e) => console.error('[Sync] init failed:', e.message));

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Wrap a handler so every IPC call returns the same {success, data|error} shape.
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, payload) => {
    try {
      return { success: true, data: await fn(payload) };
    } catch (error) {
      console.error(`[IPC] ${channel} failed:`, error.message);
      return { success: false, error: error.message };
    }
  });
}

// ── Bills ──────────────────────────────────────────────────────────────────

handle('db:getBills', () => db.getBills());
handle('db:addBill', async (billData) => {
  const billId = db.addBill(billData);
  // Share it with any other Command Center in the shop. Phones are unaffected —
  // they pull bills on demand via search.
  await shared.publishDeskBill(billData).catch(() => {});
  return billId;
});
handle('db:deleteBill', (billId) => { db.deleteBill(billId); });

handle('db:updateBillStatus', async ({ id, status }) => {
  const before = db.findBillById(id);
  const wasCompleted = before && before.status === 'Completed';

  db.updateBillStatus(id, status);
  const bill = db.findBillById(id);

  // Marking a bill paid rolls its weight and amount into the customer's
  // lifetime stats, exactly as the mobile app does. Guarded against double
  // counting if the same bill is completed twice.
  if (bill && status === 'Completed' && !wasCompleted && bill.customerId) {
    await shared.addCustomerStats(bill.customerId, bill.totalWeight || 0, bill.totalAmount || 0);
  }

  // Tell every phone, not just the one that raised the bill — any of them may
  // be holding a copy pulled down via search.
  if (bill) {
    await shared.broadcastStatus(id, status, bill.completedAt).catch(() => {});
  }
});

handle('sync:allocateBillNumber', () => allocateBillNumber());

// ── Pricing config ─────────────────────────────────────────────────────────

handle('config:getPricing', () => shared.getPricing());
handle('config:savePricing', (categories) => shared.savePricing(categories));

// ── Customers ──────────────────────────────────────────────────────────────

handle('customers:list', () => db.getCustomers());
handle('customers:save', (customer) => shared.saveCustomer(customer));
handle('customers:delete', (id) => shared.removeCustomer(id));

// ── Device control ─────────────────────────────────────────────────────────

handle('devices:list', () => shared.listDevices());
handle('devices:setPermission', ({ deviceId, canCustomize }) =>
  shared.setDevicePermission(deviceId, canCustomize));
handle('devices:rename', ({ deviceId, name }) => shared.renameDevice(deviceId, name));
handle('devices:forget', (deviceId) => shared.forgetDevice(deviceId));

// ── Reporting ──────────────────────────────────────────────────────────────

handle('stats:revenue', (opts) => db.getRevenueStats(opts || {}));

// ── Expenses & finance ─────────────────────────────────────────────────────

handle('expenses:list', () => db.getExpenses());
handle('expenses:categories', () => db.expenseCategories());
handle('expenses:save', (expense) => shared.saveExpense(expense));
handle('expenses:delete', (id) => shared.removeExpense(id));
handle('stats:finance', (opts) => db.getFinanceStats(opts || {}));

// ── Storage location ───────────────────────────────────────────────────────

handle('storage:get', () => ({
  ...db.getStorageInfo(),
  machine: MACHINE,
  oneDrive: detectOneDrive(),
}));

/**
 * Windows sets OneDrive/OneDriveConsumer/OneDriveCommercial when the client is
 * installed and signed in. Returns null when OneDrive isn't set up, so the UI
 * can hide the shortcut rather than offering a path that doesn't exist.
 */
function detectOneDrive() {
  const candidates = [
    process.env.OneDriveCommercial,
    process.env.OneDriveConsumer,
    process.env.OneDrive,
    path.join(os.homedir(), 'OneDrive'),
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (fsx.existsSync(dir) && fsx.statSync(dir).isDirectory()) return dir;
    } catch (e) {
      // Unreadable candidate — try the next.
    }
  }
  return null;
}

/** One-click equivalent of picking the OneDrive folder in the file dialog. */
handle('storage:useOneDrive', () => {
  const oneDrive = detectOneDrive();
  if (!oneDrive) throw new Error('OneDrive does not appear to be set up on this computer.');
  return db.relocateStorage(oneDrive);
});

/**
 * Ask the user for a folder, then move the data folder there. The dialog is
 * modal on the main window so the app can't be edited mid-move.
 */
handle('storage:choose', async () => {
  const win = BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose where to keep Wrinkle Laundry data',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Store data here',
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };

  const moved = db.relocateStorage(result.filePaths[0]);
  return { canceled: false, ...moved };
});

// ── WhatsApp ───────────────────────────────────────────────────────────────

/**
 * Open the bill in WhatsApp. Uses wa.me rather than the whatsapp:// scheme the
 * mobile app uses, because wa.me resolves to WhatsApp Desktop when installed
 * and falls back to WhatsApp Web when it isn't.
 */
handle('app:sendWhatsApp', async ({ mobile, message }) => {
  const digits = String(mobile || '').replace(/\D/g, '');
  if (digits.length < 10) throw new Error('That customer has no valid mobile number.');
  const phone = digits.length === 10 ? `91${digits}` : digits;
  await shell.openExternal(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
});
