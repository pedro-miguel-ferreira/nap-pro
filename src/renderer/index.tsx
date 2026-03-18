import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Terminal } from './components/Terminal';
import { Sidebar } from './components/Sidebar';
import { useTerminalStore } from './store';
import { getTerminal } from './terminal-registry';
import '@xterm/xterm/css/xterm.css';

function App() {
  const sidebarVisible = useTerminalStore((s) => s.sidebarVisible);

  useEffect(() => {
    // Route pty data to the correct xterm instance
    const removeDataListener = window.electronAPI.pty.onData((id, data) => {
      const entry = getTerminal(id);
      if (entry) entry.terminal.write(data);
    });

    // Handle pty exit
    const removeExitListener = window.electronAPI.pty.onExit((id, exitCode) => {
      const entry = getTerminal(id);
      if (entry) {
        entry.terminal.write(`\r\n\r\n[process exited with code ${exitCode}]`);
        entry.terminal.options.disableStdin = true;
      }
      const current = useTerminalStore.getState().terminals.find((t) => t.id === id);
      if (current?.status !== 'done') {
        useTerminalStore.getState().setStatus(id, 'exited');
      }
    });

    // Menu: toggle sidebar (Cmd+B)
    const removeSidebarListener = window.electronAPI.onToggleSidebar(() => {
      useTerminalStore.getState().toggleSidebar();
    });

    // Menu: new terminal (Cmd+T)
    const removeCreateListener = window.electronAPI.onCreateTerminal(() => {
      const id = useTerminalStore.getState().createTerminal('shell');
      useTerminalStore.getState().setActive(id);
    });

    // Menu: close active terminal (Cmd+W)
    const removeCloseListener = window.electronAPI.onCloseActiveTerminal(() => {
      useTerminalStore.getState().closeActiveTerminal();
    });

    // Menu: toggle scroll lock (Cmd+G) with double-press detection
    let lastToggleTime = 0;
    const removeScrollLockListener = window.electronAPI.onToggleScrollLock(() => {
      const store = useTerminalStore.getState();
      const id = store.activeTerminalId;
      if (!id) return;
      const entry = getTerminal(id);
      if (!entry) return;

      const now = Date.now();
      const currentMode = entry.scrollLock.getMode();

      let nextMode: 'off' | 'follow' | 'read';
      if (currentMode === 'off') {
        nextMode = 'follow';
      } else if (currentMode === 'follow' && now - lastToggleTime < 500) {
        nextMode = 'read';
      } else {
        nextMode = 'off';
      }

      lastToggleTime = now;
      entry.scrollLock.setMode(nextMode);
      store.setScrollLockMode(id, nextMode);
    });

    // Socket: new terminal created via CLI
    const removeSocketCreate = window.electronAPI.onSocketTerminalCreated((data) => {
      useTerminalStore.getState().addSocketTerminal(data.id, data.name, data.parentId, data.cwd);
    });

    // Socket: peek at terminal via CLI
    const removeSocketPeek = window.electronAPI.onSocketPeek((data) => {
      useTerminalStore.getState().setActive(data.id);
      if (!useTerminalStore.getState().sidebarVisible) {
        useTerminalStore.getState().toggleSidebar();
      }
    });

    // Socket: close terminal via CLI
    const removeSocketClose = window.electronAPI.onSocketTerminalClose((data) => {
      useTerminalStore.getState().disposeTerminalOnly(data.id);
    });

    // Socket: status changed (e.g. done)
    const removeSocketStatus = window.electronAPI.onSocketStatusChanged((data) => {
      useTerminalStore.getState().setStatus(data.id, data.status as 'done');
    });

    // Socket: log buffer request
    const removeLogRequest = window.electronAPI.onLogRequest((data) => {
      const entry = getTerminal(data.id);
      if (!entry) {
        window.electronAPI.sendLogResponse(data.requestId, []);
        return;
      }
      const buffer = entry.terminal.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) lines.push(line.translateToString(true));
      }
      // Trim trailing empty lines
      while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      window.electronAPI.sendLogResponse(data.requestId, lines);
    });

    // Create first terminal with options from --name/--command flags
    window.electronAPI.getInitialTerminalOpts().then((opts) => {
      useTerminalStore.getState().createTerminal(opts.name, undefined, opts.command);
    });

    return () => {
      removeDataListener();
      removeExitListener();
      removeSidebarListener();
      removeCreateListener();
      removeCloseListener();
      removeScrollLockListener();
      removeSocketCreate();
      removeSocketPeek();
      removeSocketClose();
      removeSocketStatus();
      removeLogRequest();
    };
  }, []);

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {sidebarVisible && <Sidebar />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Terminal />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

// Expose for e2e testing (Playwright needs access to store + registry)
(window as any).getTerminal = getTerminal;
(window as any).useTerminalStore = useTerminalStore;
