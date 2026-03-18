import { app, BrowserWindow, ipcMain, IpcMainEvent, Menu, dialog, shell } from 'electron';
import * as path from 'path';
import type { IPty, IDisposable } from 'node-pty';
import * as pty from 'node-pty';
import { startSocketServer, stopSocketServer } from './socket-server';
import {
  createSession,
  getSession,
  getAllSessions,
  setSessionStatus,
  removeSession,
} from './session-store';
import { resolveByName } from './name-resolver';
import { setWriter, enqueue, clearQueue } from './message-queue';
import { getServerSocketPath } from '../shared/constants';
import type { SocketRequest } from '../shared/protocol';

// Parse --cwd from argv (passed by `nap open`)
function parseCwdFromArgv(): string {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) return args[i + 1];
  }
  return process.cwd();
}

const projectCwd = parseCwdFromArgv();
const socketPath = getServerSocketPath(projectCwd);

let mainWindow: BrowserWindow | null = null;

interface PtyEntry {
  process: IPty;
  dataDisposable: IDisposable;
  exitDisposable: IDisposable;
}

const ptys = new Map<string, PtyEntry>();
const outputBuffers = new Map<string, string[]>();
const readyTerminals = new Set<string>();

// Track live ptys so we can wait for them all to exit before quitting
let pendingExits = 0;
let quitAfterExits = false;

function checkQuit(): void {
  if (quitAfterExits && pendingExits === 0) {
    app.quit();
  }
}

function killAllPtys(): void {
  for (const entry of ptys.values()) {
    entry.dataDisposable.dispose();
    entry.process.kill();
  }
}

function killPty(id: string): void {
  const entry = ptys.get(id);
  if (entry) {
    entry.dataDisposable.dispose();
    entry.process.kill();
    outputBuffers.delete(id);
    readyTerminals.delete(id);
    clearQueue(id);
  }
}

function writeToPty(id: string, data: string): void {
  ptys.get(id)?.process.write(data);
}

function createPtyProcess(
  id: string,
  opts: { command?: string; cwd?: string },
): void {
  const userShell = process.env.SHELL || '/bin/zsh';
  const args = opts.command ? ['-c', opts.command] : ['--login'];
  const finalCwd = opts.cwd || projectCwd;

  const ptyProcess = pty.spawn(userShell, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: finalCwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      NAP_SESSION_ID: id,
    } as Record<string, string>,
  });

  pendingExits++;

  const dataDisposable = ptyProcess.onData((data: string) => {
    if (readyTerminals.has(id) && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:data', id, data);
    } else {
      const buffer = outputBuffers.get(id);
      if (buffer) buffer.push(data);
    }
  });

  const exitDisposable = ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:exit', id, exitCode);
    }
    ptys.delete(id);
    outputBuffers.delete(id);
    readyTerminals.delete(id);
    const session = getSession(id);
    if (session && session.status !== 'done') {
      setSessionStatus(id, 'exited');
    }
    pendingExits--;
    checkQuit();
  });

  ptys.set(id, { process: ptyProcess, dataDisposable, exitDisposable });
  outputBuffers.set(id, []);
}

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
    if (!process.env['NAP_TEST'] || process.env['HEADED']) mainWindow!.show();
  });

  mainWindow.setTitle(path.basename(projectCwd));

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
        {
          label: 'Close Terminal',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('terminal:close-active');
            }
          },
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

// IPC: create a new pty (renderer-initiated)
ipcMain.on(
  'pty:create',
  (
    _event: IpcMainEvent,
    id: string,
    opts?: { name?: string; parentId?: string; cwd?: string },
  ) => {
    const name = opts?.name || 'shell';
    const cwd = opts?.cwd || projectCwd;
    const parentId = opts?.parentId || null;

    createSession({ id, name, cwd, parentId });
    createPtyProcess(id, { cwd });
  },
);

// IPC: kill a pty
ipcMain.on('pty:kill', (_event: IpcMainEvent, id: string) => {
  killPty(id);
});

// IPC: close a pty (kill + remove session)
ipcMain.on('pty:close', (_event: IpcMainEvent, id: string) => {
  killPty(id);
  removeSession(id);
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
  ptys.get(id)?.process.write(data);
});

// IPC: renderer resize → pty
ipcMain.on('pty:resize', (_event: IpcMainEvent, id: string, cols: number, rows: number) => {
  ptys.get(id)?.process.resize(cols, rows);
});

// Pending log requests: requestId → resolve callback
const pendingLogRequests = new Map<number, (lines: string[]) => void>();
let logRequestCounter = 0;

// IPC: renderer sends log buffer back
ipcMain.on(
  'socket:log-response',
  (_event: IpcMainEvent, requestId: number, lines: string[]) => {
    const resolve = pendingLogRequests.get(requestId);
    if (resolve) {
      pendingLogRequests.delete(requestId);
      resolve(lines);
    }
  },
);

// IPC: renderer asks to open a file path
ipcMain.on('open-file-path', (_event: IpcMainEvent, filePath: string) => {
  shell.openPath(filePath);
});

function requestLogBuffer(terminalId: string): Promise<string[]> {
  return new Promise((resolve) => {
    const requestId = ++logRequestCounter;
    pendingLogRequests.set(requestId, resolve);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('socket:log-request', { id: terminalId, requestId });
    }
    // Timeout after 5s
    setTimeout(() => {
      if (pendingLogRequests.has(requestId)) {
        pendingLogRequests.delete(requestId);
        resolve([]);
      }
    }, 5000);
  });
}

// Socket request handler
async function handleSocketRequest(msg: unknown): Promise<Record<string, unknown>> {
  const req = msg as SocketRequest;

  switch (req.type) {
    case 'start': {
      const session = createSession({
        command: req.command,
        name: req.name,
        cwd: req.cwd || projectCwd,
        parentId: req.parentId ?? null,
      });
      createPtyProcess(session.id, { command: req.command, cwd: req.cwd });

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('socket:terminal-created', {
          id: session.id,
          name: session.name,
          parentId: session.parentId,
          cwd: session.cwd,
        });
      }

      return { id: req.id, ok: true, sessionId: session.id, name: session.name };
    }

    case 'ps': {
      const sessions = getAllSessions();
      const list = sessions.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        parent: s.parentId ? getSession(s.parentId)?.name ?? '-' : '-',
        cwd: s.cwd,
        uptime: formatUptime(s.createdAt),
      }));
      return { id: req.id, ok: true, sessions: list };
    }

    case 'peek': {
      const sessions = getAllSessions();
      const result = resolveByName(sessions, req.name);
      if (!result.ok) return { id: req.id, error: 'not_found', message: result.error };

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('socket:peek', { id: result.session.id });
      }
      return { id: req.id, ok: true };
    }

    case 'kill': {
      const sessions = getAllSessions();
      const result = resolveByName(sessions, req.name);
      if (!result.ok) return { id: req.id, error: 'not_found', message: result.error };

      killPty(result.session.id);
      return { id: req.id, ok: true };
    }

    case 'close': {
      const sessions = getAllSessions();
      const result = resolveByName(sessions, req.name);
      if (!result.ok) return { id: req.id, error: 'not_found', message: result.error };

      killPty(result.session.id);
      removeSession(result.session.id);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('socket:terminal-close', { id: result.session.id });
      }
      return { id: req.id, ok: true };
    }

    case 'poke': {
      const sessions = getAllSessions();
      const result = resolveByName(sessions, req.name);
      if (!result.ok) return { id: req.id, error: 'not_found', message: result.error };

      const target = result.session;
      if (target.status !== 'running') {
        return { id: req.id, error: 'not_running', message: `${req.name} is not running` };
      }

      enqueue(target.id, req.message);
      return { id: req.id, ok: true };
    }

    case 'status': {
      const sessions = getAllSessions();
      const result = resolveByName(sessions, req.name);
      if (!result.ok) return { id: req.id, error: 'not_found', message: result.error };

      const target = result.session;
      return {
        id: req.id,
        ok: true,
        status: target.status,
        doneMessage: target.doneMessage ?? '',
      };
    }

    case 'done': {
      const session = getSession(req.sessionId);
      if (!session) {
        return { id: req.id, error: 'not_found', message: 'session not found' };
      }

      // Idempotent: second done call is a no-op
      if (session.status === 'done') {
        return { id: req.id, ok: true };
      }

      session.status = 'done';
      session.doneMessage = req.message;

      // Notify renderer of status change
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('socket:status-changed', {
          id: session.id,
          status: 'done',
        });
      }

      // Poke parent if exists
      if (session.parentId) {
        const parent = getSession(session.parentId);
        if (parent && parent.status === 'running') {
          enqueue(parent.id, req.message);
        }
      }

      return { id: req.id, ok: true };
    }

    case 'log': {
      const sessions = getAllSessions();
      const result = resolveByName(sessions, req.name);
      if (!result.ok) return { id: req.id, error: 'not_found', message: result.error };

      const lines = await requestLogBuffer(result.session.id);
      return { id: req.id, ok: true, lines };
    }

    default:
      return { id: (req as { id?: number }).id, error: 'unknown', message: 'unknown command' };
  }
}

function formatUptime(createdAt: number): string {
  const secs = Math.floor((Date.now() - createdAt) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

app.whenReady().then(async () => {
  // Start socket server BEFORE creating the window.
  // If another instance is running, quit immediately without creating
  // any windows — creating a window then quitting mid-init causes a
  // V8 HandleScope segfault on macOS (race between window close and V8 teardown).
  setWriter(writeToPty);

  try {
    await startSocketServer(handleSocketRequest, socketPath);
  } catch (err) {
    if ((err as Error).message.includes('Another instance')) {
      if (!process.env['NAP_TEST']) {
        dialog.showErrorBox('Nap', 'Another instance of Nap is already running.');
      }
      app.quit();
      return;
    }
    console.error('Failed to start socket server:', err);
  }

  buildMenu();
  createWindow();
});

// Signal handlers for socket cleanup
process.on('SIGTERM', () => {
  stopSocketServer();
  app.quit();
});

process.on('SIGINT', () => {
  stopSocketServer();
  app.quit();
});

process.on('beforeExit', () => {
  stopSocketServer();
});

app.on('will-quit', () => {
  stopSocketServer();
});

app.on('window-all-closed', () => {
  // Kill all ptys, then wait for their onExit callbacks to fire
  // before quitting. This ensures node-pty's ThreadSafeFunction
  // completes its work before V8 tears down.
  killAllPtys();
  if (pendingExits === 0) {
    app.quit();
  } else {
    quitAfterExits = true;
    // Safety timeout — don't hang forever if a pty refuses to die
    setTimeout(() => app.quit(), 2000);
  }
});
