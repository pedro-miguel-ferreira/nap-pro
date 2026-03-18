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

    // Socket: new terminal created via CLI
    const removeSocketCreate = window.electronAPI.onSocketTerminalCreated((data) => {
      useTerminalStore.getState().addSocketTerminal(data.id, data.name, data.parentId);
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

    // Create first terminal
    useTerminalStore.getState().createTerminal('shell');

    return () => {
      removeDataListener();
      removeExitListener();
      removeSidebarListener();
      removeCreateListener();
      removeSocketCreate();
      removeSocketPeek();
      removeSocketClose();
      removeSocketStatus();
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
