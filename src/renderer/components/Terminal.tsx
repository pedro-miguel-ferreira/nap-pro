import { useEffect, useRef } from 'react';
import { useTerminalStore } from '../store';
import { getTerminal, openTerminal } from '../terminal-registry';

export function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);

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
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const id = useTerminalStore.getState().activeTerminalId;
        if (!id) return;
        const entry = getTerminal(id);
        if (!entry || !entry.opened) return;
        entry.fitAddon.fit();
        window.electronAPI.pty.resize(id, entry.terminal.cols, entry.terminal.rows);
      }, 50);
    });

    observer.observe(containerRef.current);
    return () => {
      clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
