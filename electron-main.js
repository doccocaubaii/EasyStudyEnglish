const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'public/favicon.ico'), // Nếu có icon
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load Angular app from dist folder
  // Angular 17+ output: dist/<project-name>/browser/index.html
  const indexPath = path.join(__dirname, 'dist/easy-study-english/browser/index.html');
  mainWindow.loadFile(indexPath);

  // Mở DevTools nếu cần (có thể xóa khi đóng gói chính thức)
  // mainWindow.webContents.openDevTools();

  // Ẩn Menu Bar mặc định (tùy chọn)
  mainWindow.setMenuBarVisibility(false);
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
