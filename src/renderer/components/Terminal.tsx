import { useEffect, useRef } from 'react';
import { useTerminalStore } from '../store';
import { getTerminal, openTerminal } from '../terminal-registry';
import type { ScrollLockMode } from '../scroll-lock';

export function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const scrollLockMode = useTerminalStore((s) =>
    s.activeTerminalId ? s.scrollLockModes[s.activeTerminalId] ?? 'off' : 'off',
  ) as ScrollLockMode;

  // Reparent terminal DOM element when active terminal changes
  useEffect(() => {
    if (!activeTerminalId || !containerRef.current) return;
    const entry = getTerminal(activeTerminalId);
    if (!entry) return;

    const container = containerRef.current;

    // Clear container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    if (!entry.opened) {
      // First display: open terminal into this container (initializes DOM + WebGL)
      openTerminal(activeTerminalId, container);
    } else {
      // Already opened: reparent existing DOM element
      if (entry.terminal.element) {
        container.appendChild(entry.terminal.element);
      }
    }

    entry.fitAddon.fit();
    window.electronAPI.pty.resize(activeTerminalId, entry.terminal.cols, entry.terminal.rows);
    entry.terminal.focus();
  }, [activeTerminalId]);

  // ResizeObserver handles both window resize and sidebar toggle
  useEffect(() => {
    if (!containerRef.current) return;

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let savedScrollY: number | null = null;
    const observer = new ResizeObserver(() => {
      // Capture scroll position immediately — CSS reflow may reset it before the debounce fires
      if (savedScrollY === null) {
        const id = useTerminalStore.getState().activeTerminalId;
        if (id) {
          const entry = getTerminal(id);
          if (entry?.opened) {
            savedScrollY = entry.terminal.buffer.active.viewportY;
          }
        }
      }
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const id = useTerminalStore.getState().activeTerminalId;
        if (!id) return;
        const entry = getTerminal(id);
        if (!entry || !entry.opened) return;
        entry.fitAddon.fit();
        if (savedScrollY !== null) {
          entry.terminal.scrollToLine(savedScrollY);
        }
        savedScrollY = null;
        window.electronAPI.pty.resize(id, entry.terminal.cols, entry.terminal.rows);
      }, 50);
    });

    observer.observe(containerRef.current);
    return () => {
      clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, []);

  const borderStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box' as const,
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor:
      scrollLockMode === 'follow'
        ? 'transparent transparent #2a5a9a transparent'
        : scrollLockMode === 'read'
          ? 'transparent #8a6a2a'
          : 'transparent',
    transition: 'border-color 0.15s ease',
    display: 'flex',
  };

  return (
    <div style={borderStyle}>
      <div ref={containerRef} style={{ flex: 1, minWidth: 0, minHeight: 0 }} />
    </div>
  );
}
