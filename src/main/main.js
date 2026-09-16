const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./database');
const { initSync, allocateBillNumber, pushStatus } = require('./sync');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  // Open DevTools in development
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  initSync({
    onChange: () => {
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('sync:changed'));
    },
  }).catch((e) => console.error('[Sync] init failed:', e.message));

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers for Database ---

ipcMain.handle('db:getBills', (event, { filter, limit } = {}) => {
  try {
    return { success: true, data: db.getBills() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:addBill', (event, billData) => {
  try {
    const id = db.addBill(billData);
    return { success: true, data: id };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:updateBillStatus', async (event, { id, status }) => {
  try {
    db.updateBillStatus(id, status);
    // Route the change back to the phone that created the bill, if any.
    const bill = db.findBillById(id);
    if (bill && bill.createdByDevice) {
      await pushStatus(id, status, bill.completedAt, bill.createdByDevice).catch(() => {});
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:deleteBill', (event, billId) => {
  try {
    db.deleteBill(billId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sync:allocateBillNumber', async () => {
  try {
    return { success: true, data: await allocateBillNumber() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
