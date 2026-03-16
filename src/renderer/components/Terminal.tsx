import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';

export function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = new XTerm({
      scrollback: 10000,
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current!);

    // WebGL renderer with canvas fallback
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
        try {
          term.loadAddon(new CanvasAddon());
        } catch (e) {
          console.warn('Canvas fallback failed after WebGL context loss:', e);
        }
      });
      term.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon failed, falling back to canvas:', e);
      try {
        term.loadAddon(new CanvasAddon());
      } catch (e2) {
        console.warn('Canvas addon also failed, using DOM renderer:', e2);
      }
    }

    fitAddon.fit();

    // IPC: pty output → xterm
    const removeDataListener = window.electronAPI.pty.onData((data: string) => {
      term.write(data);
    });

    // IPC: pty exit → show message, disable input
    const removeExitListener = window.electronAPI.pty.onExit((exitCode: number) => {
      term.write(`\r\n\r\n[process exited with code ${exitCode}]`);
      term.options.disableStdin = true;
    });

    // xterm input → pty
    const inputDisposable = term.onData((data: string) => {
      window.electronAPI.pty.write(data);
    });

    // Send initial size and signal ready
    window.electronAPI.pty.resize(term.cols, term.rows);
    window.electronAPI.pty.ready();

    // Resize with 100ms debounce
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        fitAddon.fit();
        window.electronAPI.pty.resize(term.cols, term.rows);
      }, 100);
    };
    window.addEventListener('resize', onResize);

    term.focus();

    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      removeDataListener();
      removeExitListener();
      inputDisposable.dispose();
      term.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
