import { app, BrowserWindow, ipcMain, IpcMainEvent } from 'electron';
import * as path from 'path';
import type { IPty } from 'node-pty';
import * as pty from 'node-pty';

let mainWindow: BrowserWindow | null = null;
let ptyProcess: IPty | null = null;
let outputBuffer: string[] = [];
let rendererReady = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#1e1e1e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show();
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

function spawnPty(cwd: string): void {
  const shell = process.env.SHELL || '/bin/zsh';

  ptyProcess = pty.spawn(shell, ['--login'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
  });

  ptyProcess.onData((data: string) => {
    if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:data', data);
    } else {
      outputBuffer.push(data);
    }
  });

  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
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
ipcMain.on('pty:write', (_event: IpcMainEvent, data: string) => {
  if (ptyProcess) {
    ptyProcess.write(data);
  }
});

// IPC: renderer resize → pty
ipcMain.on('pty:resize', (_event: IpcMainEvent, cols: number, rows: number) => {
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
