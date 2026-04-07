const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'public/favicon.ico'), 
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // TỰ ĐỘNG NHẬN DIỆN DEV / PROD
  if (app.isPackaged) {
    const indexPath = path.join(__dirname, 'dist/easy-study-english/browser/index.html');
    mainWindow.loadFile(indexPath);
  } else {
    // Trong lúc phát triển, load trực tiếp từ Angular Dev Server
    mainWindow.loadURL('http://localhost:4200');
    // Mở DevTools tự động khi dev để bạn dễ debug
    mainWindow.webContents.openDevTools();
  }

  mainWindow.setMenuBarVisibility(false);
}

const fs = require('fs');
const { net } = require('electron'); // Import net để gọi API không bị CORS
const storagePath = app.isPackaged ? path.dirname(process.execPath) : __dirname;

// Network IPC Handlers (Bypass CORS triệt để)
ipcMain.handle('http-get', async (event, url) => {
  const response = await net.fetch(url);
  return await response.json();
});

ipcMain.handle('http-post', async (event, { url, body }) => {
  const response = await net.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return await response.text();
});

ipcMain.handle('save-file', async (event, { fileName, data }) => {
  const filePath = path.join(storagePath, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return true;
});

ipcMain.handle('read-file', async (event, fileName) => {
  const filePath = path.join(storagePath, fileName);
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  }
  return null;
});

ipcMain.handle('save-settings', async (event, settings) => {
  const filePath = path.join(storagePath, 'settings.json');
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
  return true;
});

ipcMain.handle('get-settings', async (event) => {
  const filePath = path.join(storagePath, 'settings.json');
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  }
  return {};
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
