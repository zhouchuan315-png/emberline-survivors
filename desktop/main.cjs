const { app, BrowserWindow, Menu, protocol, session, dialog, screen } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const ORIGIN = 'emberline://game';
const webRoot = path.join(__dirname, 'web');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wasm': 'application/wasm',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

app.setName('Emberline Survivors');
// A stable origin and data directory keep saves across moves and future updates.
const dataDirectory = app.commandLine.getSwitchValue('user-data-dir');
app.setPath('userData', dataDirectory
  ? path.resolve(dataDirectory)
  : path.join(app.getPath('appData'), 'EmberlineSurvivors'));
protocol.registerSchemesAsPrivileged([{
  scheme: 'emberline',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

function isGameURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'emberline:' && url.host === 'game' && !url.username && !url.password;
  } catch { return false; }
}

async function serveGame(request) {
  if (!isGameURL(request.url)) return new Response('Not found', { status: 404 });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const file = path.resolve(webRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(webRoot, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return new Response('Forbidden', { status: 403 });
    }
    const body = await readFile(file);
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: {
        'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        // SystemJS and the Cocos runtime compile bundled scripts locally.
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'none'",
      },
    });
  } catch (error) {
    return new Response('Not found', { status: error instanceof URIError ? 400 : 404 });
  }
}

let mainWindow;

function createWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1280, area.width - 80, Math.floor((area.height - 100) * 1.6));
  mainWindow = new BrowserWindow({
    title: '余烬防线', width, height: Math.floor(width / 1.6), useContentSize: true,
    minWidth: 800, minHeight: 500, backgroundColor: '#101818', show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, spellcheck: false,
    },
  });
  mainWindow.setAspectRatio(1.6);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isGameURL(url)) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.once('ready-to-show', () => { mainWindow.show(); mainWindow.focus(); });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    dialog.showErrorBox('游戏已停止', '请重新启动余烬防线。已保存的金币和天赋会保留。');
    app.quit();
  });
  mainWindow.loadURL(`${ORIGIN}/index.html`).catch(error => {
    dialog.showErrorBox('无法启动余烬防线', error.message);
    app.quit();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    protocol.handle('emberline', serveGame);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const local = isGameURL(details.url) || details.url.startsWith('blob:emberline://game/')
        || details.url.startsWith('data:');
      callback({ cancel: !local });
    });
    const mac = process.platform === 'darwin';
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(mac ? [{ role: 'appMenu' }] : []),
      { label: '游戏', submenu: [
        { label: '全屏', accelerator: 'F11', click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) },
        { type: 'separator' }, { role: 'quit', label: '退出' },
      ] },
      { role: 'windowMenu', label: '窗口' },
    ]));
    createWindow();
  }).catch(error => { dialog.showErrorBox('启动失败', error.message); app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { if (app.isReady()) session.defaultSession.flushStorageData(); });
}
