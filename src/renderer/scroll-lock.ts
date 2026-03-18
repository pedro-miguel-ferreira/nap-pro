import { Terminal } from '@xterm/xterm';

export type ScrollLockMode = 'off' | 'follow' | 'read';

export interface ScrollLockController {
  setMode(mode: ScrollLockMode, pinnedY?: number): void;
  getMode(): ScrollLockMode;
  dispose(): void;
}

export function setupScrollLock(terminal: Terminal): ScrollLockController {
  let mode: ScrollLockMode = 'off';
  let lockedY = 0;
  let writeJustParsed = false;
  let isRestoring = false;

  const d1 = terminal.onWriteParsed(() => {
    if (mode === 'follow') {
      terminal.scrollToBottom();
    } else if (mode === 'read') {
      writeJustParsed = true;
      queueMicrotask(() => {
        writeJustParsed = false;
      });
      isRestoring = true;
      terminal.scrollToLine(lockedY);
      isRestoring = false;
    }
  });

  const d2 = terminal.onScroll(() => {
    if (mode === 'follow') {
      terminal.scrollToBottom();
    } else if (mode === 'read' && !isRestoring) {
      const pos = terminal.buffer.active.viewportY;
      queueMicrotask(() => {
        if (!writeJustParsed) lockedY = pos;
      });
    }
  });

  return {
    setMode(newMode: ScrollLockMode, pinnedY?: number) {
      mode = newMode;
      if (mode === 'follow') {
        terminal.options.scrollOnUserInput = false;
        terminal.scrollToBottom();
      } else if (mode === 'read') {
        terminal.options.scrollOnUserInput = false;
        lockedY = pinnedY ?? terminal.buffer.active.viewportY;
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
