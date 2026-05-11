const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveToFile: (fileName, data) => ipcRenderer.invoke('save-file', { fileName, data }),
  readFile: (fileName) => ipcRenderer.invoke('read-file', fileName),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  httpGet: (url) => ipcRenderer.invoke('http-get', url),
  httpPost: (url, body) => ipcRenderer.invoke('http-post', { url, body }),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url)
});
