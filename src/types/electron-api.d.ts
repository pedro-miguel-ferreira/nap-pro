interface ElectronPtyAPI {
  ready: () => void;
  onData: (callback: (data: string) => void) => () => void;
  onExit: (callback: (exitCode: number) => void) => () => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
}

interface ElectronAPI {
  pty: ElectronPtyAPI;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
