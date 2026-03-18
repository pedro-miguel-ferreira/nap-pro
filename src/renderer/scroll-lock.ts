import { Terminal } from '@xterm/xterm';

export type ScrollLockMode = 'off' | 'follow' | 'read';

export interface ScrollLockController {
  setMode(mode: ScrollLockMode): void;
  getMode(): ScrollLockMode;
  dispose(): void;
}

export function setupScrollLock(terminal: Terminal): ScrollLockController {
  let mode: ScrollLockMode = 'off';
  let pinnedLine = 0;
  let restoring = false;

  const d1 = terminal.onWriteParsed(() => {
    if (mode === 'follow') {
      terminal.scrollToBottom();
    } else if (mode === 'read' && !restoring) {
      restoring = true;
      terminal.scrollToLine(pinnedLine);
      restoring = false;
    }
  });

  const d2 = terminal.onScroll(() => {
    if (mode === 'follow') {
      terminal.scrollToBottom();
    } else if (mode === 'read' && !restoring) {
      restoring = true;
      terminal.scrollToLine(pinnedLine);
      restoring = false;
    }
  });

  return {
    setMode(newMode: ScrollLockMode) {
      mode = newMode;
      if (mode === 'follow') {
        terminal.options.scrollOnUserInput = false;
        terminal.scrollToBottom();
      } else if (mode === 'read') {
        terminal.options.scrollOnUserInput = false;
        pinnedLine = terminal.buffer.active.viewportY;
      } else {
        terminal.options.scrollOnUserInput = true;
      }
    },
    getMode() {
      return mode;
    },
    dispose() {
      d1.dispose();
      d2.dispose();
    },
  };
}
