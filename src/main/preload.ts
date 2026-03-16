import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  pty: {
    ready: () => ipcRenderer.send('pty:ready'),
    onData: (callback: (data: string) => void) => {
      const handler = (_event: IpcRendererEvent, data: string) => callback(data);
      ipcRenderer.on('pty:data', handler);
      return () => ipcRenderer.removeListener('pty:data', handler);
    },
    onExit: (callback: (exitCode: number) => void) => {
      const handler = (_event: IpcRendererEvent, exitCode: number) => callback(exitCode);
      ipcRenderer.on('pty:exit', handler);
      return () => ipcRenderer.removeListener('pty:exit', handler);
    },
    write: (data: string) => ipcRenderer.send('pty:write', data),
    resize: (cols: number, rows: number) => ipcRenderer.send('pty:resize', cols, rows),
  },
});
