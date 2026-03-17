import { vi } from 'vitest';

// Mock browser addons that require WebGL/Canvas — these fail in jsdom
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class MockWebglAddon {
    activate() {}
    dispose() {}
    onContextLoss() {}
  },
}));

vi.mock('@xterm/addon-canvas', () => ({
  CanvasAddon: class MockCanvasAddon {
    activate() {}
    dispose() {}
  },
}));

// Mock window.electronAPI — store.ts calls these on createTerminal
const mockElectronAPI = {
  pty: {
    create: vi.fn(),
    kill: vi.fn(),
    ready: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    onData: vi.fn(() => vi.fn()),
    onExit: vi.fn(() => vi.fn()),
  },
  onToggleSidebar: vi.fn(() => vi.fn()),
  onCreateTerminal: vi.fn(() => vi.fn()),
  onSocketTerminalCreated: vi.fn(() => vi.fn()),
  onSocketPeek: vi.fn(() => vi.fn()),
  onSocketTerminalClose: vi.fn(() => vi.fn()),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
  configurable: true,
});
