import { create } from 'zustand';
import { createTerminalInstance, disposeTerminal } from './terminal-registry';
import { createFileLinkProvider } from './file-link-provider';

export interface TerminalMeta {
  id: string;
  name: string;
  status: 'running' | 'exited' | 'done';
  parentId?: string;
  cwd?: string;
  createdAt: number;
}

interface TerminalStore {
  terminals: TerminalMeta[];
  activeTerminalId: string | null;
  sidebarVisible: boolean;

  createTerminal: (name: string, parentId?: string) => string;
  addSocketTerminal: (id: string, name: string, parentId?: string | null, cwd?: string) => void;
  removeTerminal: (id: string) => void;
  disposeTerminalOnly: (id: string) => void;
  closeActiveTerminal: () => void;
  setActive: (id: string) => void;
  setStatus: (id: string, status: TerminalMeta['status']) => void;
  toggleSidebar: () => void;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminals: [],
  activeTerminalId: null,
  sidebarVisible: true,

  createTerminal: (name: string, parentId?: string) => {
    const id = crypto.randomUUID();

    // Create xterm instance in registry (outside React)
    const entry = createTerminalInstance(id);

    // Wire xterm input → pty
    entry.terminal.onData((data: string) => {
      window.electronAPI.pty.write(id, data);
    });

    // Register file link provider
    entry.terminal.registerLinkProvider(
      createFileLinkProvider(
        entry.terminal,
        () => get().terminals.find((t) => t.id === id)?.cwd || '/',
        (filePath) => window.electronAPI.openFilePath(filePath),
      ),
    );

    // Request pty from main process
    window.electronAPI.pty.create(id, { name, parentId });
    window.electronAPI.pty.resize(id, entry.terminal.cols, entry.terminal.rows);
    window.electronAPI.pty.ready(id);

    // Update store
    const isFirst = get().terminals.length === 0;
    set((state) => ({
      terminals: [
        ...state.terminals,
        { id, name, status: 'running' as const, parentId, createdAt: Date.now() },
      ],
      activeTerminalId: isFirst ? id : state.activeTerminalId,
    }));

    return id;
  },

  addSocketTerminal: (id: string, name: string, parentId?: string | null, cwd?: string) => {
    // Create xterm instance in registry (outside React)
    const entry = createTerminalInstance(id);

    // Wire xterm input → pty
    entry.terminal.onData((data: string) => {
      window.electronAPI.pty.write(id, data);
    });

    // Register file link provider
    entry.terminal.registerLinkProvider(
      createFileLinkProvider(
        entry.terminal,
        () => get().terminals.find((t) => t.id === id)?.cwd || '/',
        (filePath) => window.electronAPI.openFilePath(filePath),
      ),
    );

    // PTY already exists in main — just signal ready
    window.electronAPI.pty.resize(id, entry.terminal.cols, entry.terminal.rows);
    window.electronAPI.pty.ready(id);

    set((state) => ({
      terminals: [
        ...state.terminals,
        {
          id,
          name,
          status: 'running' as const,
          parentId: parentId ?? undefined,
          cwd,
          createdAt: Date.now(),
        },
      ],
    }));
  },

  removeTerminal: (id: string) => {
    window.electronAPI.pty.kill(id);
    disposeTerminal(id);
    set((state) => {
      const terminals = state.terminals.filter((t) => t.id !== id);
      let activeTerminalId = state.activeTerminalId;
      if (activeTerminalId === id) {
        activeTerminalId = terminals.length > 0 ? terminals[0].id : null;
      }
      return { terminals, activeTerminalId };
    });
  },

  disposeTerminalOnly: (id: string) => {
    disposeTerminal(id);
    set((state) => {
      const terminals = state.terminals.filter((t) => t.id !== id);
      let activeTerminalId = state.activeTerminalId;
      if (activeTerminalId === id) {
        activeTerminalId = terminals.length > 0 ? terminals[0].id : null;
      }
      return { terminals, activeTerminalId };
    });
  },

  closeActiveTerminal: () => {
    const { activeTerminalId, terminals } = get();
    if (!activeTerminalId) return;
    if (terminals.length <= 1) return;
    const active = terminals.find((t) => t.id === activeTerminalId);
    if (!active) return;
    if (active.status === 'running') return;

    window.electronAPI.pty.close(activeTerminalId);
    disposeTerminal(activeTerminalId);
    set((state) => {
      const remaining = state.terminals.filter((t) => t.id !== activeTerminalId);
      return {
        terminals: remaining,
        activeTerminalId: remaining.length > 0 ? remaining[0].id : null,
      };
    });
  },

  setActive: (id: string) => {
    set({ activeTerminalId: id });
  },

  setStatus: (id: string, status: TerminalMeta['status']) => {
    set((state) => ({
      terminals: state.terminals.map((t) => (t.id === id ? { ...t, status } : t)),
    }));
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarVisible: !state.sidebarVisible }));
  },
}));
