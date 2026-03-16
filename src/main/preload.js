const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  pty: {
    ready: () => ipcRenderer.send('pty:ready'),
    onData: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on('pty:data', handler);
      return () => ipcRenderer.removeListener('pty:data', handler);
    },
    onExit: (callback) => {
      const handler = (_, exitCode) => callback(exitCode);
      ipcRenderer.on('pty:exit', handler);
      return () => ipcRenderer.removeListener('pty:exit', handler);
    },
    write: (data) => ipcRenderer.send('pty:write', data),
    resize: (cols, rows) => ipcRenderer.send('pty:resize', cols, rows),
  },
});
