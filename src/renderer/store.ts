import { create } from 'zustand';
import { createTerminalInstance, disposeTerminal } from './terminal-registry';

export interface TerminalMeta {
  id: string;
  name: string;
  status: 'running' | 'exited' | 'done';
  parentId?: string;
  createdAt: number;
}

interface TerminalStore {
  terminals: TerminalMeta[];
  activeTerminalId: string | null;
  sidebarVisible: boolean;

  createTerminal: (name: string, parentId?: string) => string;
  addSocketTerminal: (id: string, name: string, parentId?: string | null) => void;
  removeTerminal: (id: string) => void;
  disposeTerminalOnly: (id: string) => void;
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

  addSocketTerminal: (id: string, name: string, parentId?: string | null) => {
    // Create xterm instance in registry (outside React)
    const entry = createTerminalInstance(id);

    // Wire xterm input → pty
    entry.terminal.onData((data: string) => {
      window.electronAPI.pty.write(id, data);
    });

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
