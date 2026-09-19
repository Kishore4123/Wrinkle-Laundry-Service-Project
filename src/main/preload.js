const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Bills
  getBills: () => ipcRenderer.invoke('db:getBills'),
  addBill: (billData) => ipcRenderer.invoke('db:addBill', billData),
  updateBillStatus: (id, status) => ipcRenderer.invoke('db:updateBillStatus', { id, status }),
  deleteBill: (billId) => ipcRenderer.invoke('db:deleteBill', billId),
  allocateBillNumber: () => ipcRenderer.invoke('sync:allocateBillNumber'),

  // Pricing
  getPricing: () => ipcRenderer.invoke('config:getPricing'),
  savePricing: (categories) => ipcRenderer.invoke('config:savePricing', categories),

  // Customers
  listCustomers: () => ipcRenderer.invoke('customers:list'),
  saveCustomer: (customer) => ipcRenderer.invoke('customers:save', customer),
  deleteCustomer: (id) => ipcRenderer.invoke('customers:delete', id),

  // Devices
  listDevices: () => ipcRenderer.invoke('devices:list'),
  setDevicePermission: (deviceId, canCustomize) =>
    ipcRenderer.invoke('devices:setPermission', { deviceId, canCustomize }),
  renameDevice: (deviceId, name) => ipcRenderer.invoke('devices:rename', { deviceId, name }),
  forgetDevice: (deviceId) => ipcRenderer.invoke('devices:forget', deviceId),

  // Reporting
  getRevenueStats: (opts) => ipcRenderer.invoke('stats:revenue', opts),

  // Expenses & finance
  listExpenses: () => ipcRenderer.invoke('expenses:list'),
  expenseCategories: () => ipcRenderer.invoke('expenses:categories'),
  saveExpense: (expense) => ipcRenderer.invoke('expenses:save', expense),
  deleteExpense: (id) => ipcRenderer.invoke('expenses:delete', id),
  getFinanceStats: (opts) => ipcRenderer.invoke('stats:finance', opts),

  // Storage location
  getStorageInfo: () => ipcRenderer.invoke('storage:get'),
  chooseStorage: () => ipcRenderer.invoke('storage:choose'),
  useOneDrive: () => ipcRenderer.invoke('storage:useOneDrive'),

  // WhatsApp
  sendWhatsApp: (mobile, message) => ipcRenderer.invoke('app:sendWhatsApp', { mobile, message }),

  // Live updates from the cloud listeners
  onSyncChanged: (cb) => ipcRenderer.on('sync:changed', (_e, topic) => cb(topic)),
});
