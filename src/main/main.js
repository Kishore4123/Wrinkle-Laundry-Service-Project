const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const db = require('./database');
const shared = require('./shared');
const { initSync, allocateBillNumber, pushStatus } = require('./sync');

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

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  createWindow();

  initSync({
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
handle('db:addBill', (billData) => db.addBill(billData));
handle('db:deleteBill', (billId) => { db.deleteBill(billId); });

handle('db:updateBillStatus', async ({ id, status }) => {
  db.updateBillStatus(id, status);
  const bill = db.findBillById(id);

  // Marking a bill paid rolls its weight and amount into the customer's
  // lifetime stats, exactly as the mobile app does.
  if (bill && status === 'Completed' && bill.customerId) {
    await shared.addCustomerStats(bill.customerId, bill.totalWeight || 0, bill.totalAmount || 0);
  }

  // Route the change back to the phone that created the bill, if any.
  if (bill && bill.createdByDevice) {
    await pushStatus(id, status, bill.completedAt, bill.createdByDevice).catch(() => {});
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

handle('stats:revenue', (days) => db.getRevenueStats(days || 30));

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
