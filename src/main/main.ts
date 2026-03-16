import { app, BrowserWindow, ipcMain, IpcMainEvent, Menu } from 'electron';
import * as path from 'path';
import type { IPty } from 'node-pty';
import * as pty from 'node-pty';

let mainWindow: BrowserWindow | null = null;
const ptys = new Map<string, IPty>();
const outputBuffers = new Map<string, string[]>();
const readyTerminals = new Set<string>();

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

  mainWindow.on('close', () => {
    for (const ptyProc of ptys.values()) {
      ptyProc.kill();
    }
    ptys.clear();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu(): void {
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('sidebar:toggle');
            }
          },
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Terminal',
      submenu: [
        {
          label: 'New Terminal',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('terminal:create');
            }
          },
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

// IPC: create a new pty
ipcMain.on('pty:create', (_event: IpcMainEvent, id: string, cwd?: string) => {
  const shell = process.env.SHELL || '/bin/zsh';
  const finalCwd = cwd || process.cwd();

  const ptyProcess = pty.spawn(shell, ['--login'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: finalCwd,
    env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
  });

  ptys.set(id, ptyProcess);
  outputBuffers.set(id, []);

  ptyProcess.onData((data: string) => {
    if (readyTerminals.has(id) && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:data', id, data);
    } else {
      const buffer = outputBuffers.get(id);
      if (buffer) buffer.push(data);
    }
  });

  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:exit', id, exitCode);
    }
    ptys.delete(id);
    outputBuffers.delete(id);
    readyTerminals.delete(id);
  });
});

// IPC: kill a pty
ipcMain.on('pty:kill', (_event: IpcMainEvent, id: string) => {
  const ptyProcess = ptys.get(id);
  if (ptyProcess) {
    ptyProcess.kill();
    ptys.delete(id);
    outputBuffers.delete(id);
    readyTerminals.delete(id);
  }
});

// IPC: renderer signals terminal is ready to receive data
ipcMain.on('pty:ready', (_event: IpcMainEvent, id: string) => {
  readyTerminals.add(id);
  const buffer = outputBuffers.get(id) || [];
  for (const data of buffer) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:data', id, data);
    }
  }
  outputBuffers.delete(id);
});

// IPC: renderer input → pty
ipcMain.on('pty:write', (_event: IpcMainEvent, id: string, data: string) => {
  ptys.get(id)?.write(data);
});

// IPC: renderer resize → pty
ipcMain.on('pty:resize', (_event: IpcMainEvent, id: string, cols: number, rows: number) => {
  ptys.get(id)?.resize(cols, rows);
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  for (const ptyProc of ptys.values()) {
    ptyProc.kill();
  }
  ptys.clear();
  app.quit();
});
