interface ElectronPtyAPI {
  create: (id: string, opts?: { name?: string; parentId?: string; cwd?: string }) => void;
  kill: (id: string) => void;
  ready: (id: string) => void;
  onData: (callback: (id: string, data: string) => void) => () => void;
  onExit: (callback: (id: string, exitCode: number) => void) => () => void;
  write: (id: string, data: string) => void;
  resize: (id: string, cols: number, rows: number) => void;
}

interface ElectronAPI {
  pty: ElectronPtyAPI;
  onToggleSidebar: (callback: () => void) => () => void;
  onCreateTerminal: (callback: () => void) => () => void;
  onSocketTerminalCreated: (
    callback: (data: { id: string; name: string; parentId?: string | null }) => void,
  ) => () => void;
  onSocketPeek: (callback: (data: { id: string }) => void) => () => void;
  onSocketTerminalClose: (callback: (data: { id: string }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
