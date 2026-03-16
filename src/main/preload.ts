import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  pty: {
    create: (id: string, cwd?: string) => ipcRenderer.send('pty:create', id, cwd),
    kill: (id: string) => ipcRenderer.send('pty:kill', id),
    ready: (id: string) => ipcRenderer.send('pty:ready', id),
    onData: (callback: (id: string, data: string) => void) => {
      const handler = (_event: IpcRendererEvent, id: string, data: string) => callback(id, data);
      ipcRenderer.on('pty:data', handler);
      return () => ipcRenderer.removeListener('pty:data', handler);
    },
    onExit: (callback: (id: string, exitCode: number) => void) => {
      const handler = (_event: IpcRendererEvent, id: string, exitCode: number) =>
        callback(id, exitCode);
      ipcRenderer.on('pty:exit', handler);
      return () => ipcRenderer.removeListener('pty:exit', handler);
    },
    write: (id: string, data: string) => ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', id, cols, rows),
  },
  onToggleSidebar: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('sidebar:toggle', handler);
    return () => ipcRenderer.removeListener('sidebar:toggle', handler);
  },
  onCreateTerminal: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('terminal:create', handler);
    return () => ipcRenderer.removeListener('terminal:create', handler);
  },
});
