const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const pty = require('node-pty');

let mainWindow = null;
let ptyProcess = null;
let outputBuffer = [];
let rendererReady = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#1e1e1e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const cwd = process.cwd();
  mainWindow.setTitle(path.basename(cwd));

  spawnPty(cwd);

  mainWindow.on('close', () => {
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcess = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function spawnPty(cwd) {
  const shell = process.env.SHELL || '/bin/zsh';

  ptyProcess = pty.spawn(shell, ['--login'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  ptyProcess.onData((data) => {
    if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:data', data);
    } else {
      outputBuffer.push(data);
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:exit', exitCode);
    }
    ptyProcess = null;
  });
}

// IPC: renderer signals it's ready to receive data
ipcMain.on('pty:ready', () => {
  rendererReady = true;
  for (const data of outputBuffer) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:data', data);
    }
  }
  outputBuffer = [];
});

// IPC: renderer input → pty
ipcMain.on('pty:write', (_, data) => {
  if (ptyProcess) {
    ptyProcess.write(data);
  }
});

// IPC: renderer resize → pty
ipcMain.on('pty:resize', (_, cols, rows) => {
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
  app.quit();
});
