const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getBills: (options) => ipcRenderer.invoke('db:getBills', options),
  addBill: (billData) => ipcRenderer.invoke('db:addBill', billData),
  updateBillStatus: (id, status) => ipcRenderer.invoke('db:updateBillStatus', { id, status }),
  deleteBill: (billId) => ipcRenderer.invoke('db:deleteBill', billId),
  allocateBillNumber: () => ipcRenderer.invoke('sync:allocateBillNumber'),
  onSyncChanged: (cb) => ipcRenderer.on('sync:changed', cb)
});
