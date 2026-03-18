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
  let isRestoring = false;
  let writeJustParsed = false;

  // In xterm v5, terminal.onScroll does NOT fire for user viewport scrolling
  // (suppressScrollEvent: true in Viewport._handleScroll). So we listen to
  // the DOM scroll event on the viewport element directly to detect user scrolls.
  let viewportEl: HTMLElement | null = null;

  function onViewportScroll(): void {
    if (mode !== 'read' || isRestoring) return;
    // Read viewportY after the DOM scroll has been processed by xterm
    queueMicrotask(() => {
      if (!writeJustParsed) {
        lockedY = terminal.buffer.active.viewportY;
      }
    });
  }

  const d1 = terminal.onWriteParsed(() => {
    if (mode === 'follow') {
      terminal.scrollToBottom();
    } else if (mode === 'read') {
      writeJustParsed = true;
      queueMicrotask(() => { writeJustParsed = false; });
      isRestoring = true;
      terminal.scrollToLine(lockedY);
      isRestoring = false;
    }
  });

  // Still keep onScroll for follow mode (works for write-triggered scrolls)
  const d2 = terminal.onScroll(() => {
    if (mode === 'follow') {
      terminal.scrollToBottom();
    }
  });

  function attachViewportListener(): void {
    detachViewportListener();
    // xterm's viewport element is .xterm-viewport, first child of terminal.element
    viewportEl = terminal.element?.querySelector('.xterm-viewport') as HTMLElement | null;
    viewportEl?.addEventListener('scroll', onViewportScroll, { passive: true });
  }

  function detachViewportListener(): void {
    viewportEl?.removeEventListener('scroll', onViewportScroll);
    viewportEl = null;
  }

  return {
    setMode(newMode: ScrollLockMode, pinnedY?: number) {
      mode = newMode;
      if (mode === 'follow') {
        terminal.options.scrollOnUserInput = false;
        terminal.scrollToBottom();
        detachViewportListener();
      } else if (mode === 'read') {
        terminal.options.scrollOnUserInput = false;
        lockedY = pinnedY ?? terminal.buffer.active.viewportY;
        attachViewportListener();
      } else {
        terminal.options.scrollOnUserInput = true;
        detachViewportListener();
      }
    },
    getMode() {
      return mode;
    },
    dispose() {
      d1.dispose();
      d2.dispose();
      detachViewportListener();
    },
  };
}
