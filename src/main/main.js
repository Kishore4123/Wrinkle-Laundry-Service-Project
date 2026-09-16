const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./database');

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

ipcMain.handle('db:updateBillStatus', (event, { id, status }) => {
  try {
    db.updateBillStatus(id, status);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

const QRCode = require('qrcode');

ipcMain.handle('app:generateQR', async (event, text) => {
  try {
    const url = await QRCode.toDataURL(text, {
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
    return { success: true, data: url };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
