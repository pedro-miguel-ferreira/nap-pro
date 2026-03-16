interface ElectronPtyAPI {
  create: (id: string, cwd?: string) => void;
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
