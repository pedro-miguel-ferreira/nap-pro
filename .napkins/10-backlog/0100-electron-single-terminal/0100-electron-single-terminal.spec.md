* electron app + single terminal — min spec

* electron 33+ (latest stable)
  * must use context isolation and preload script
  * main process owns the pty
  * renderer process owns xterm.js
  * IPC bridge between them for pty data

* node-pty
  * spawn $SHELL with login flag
  * pass cwd from app launch args or process.cwd()
  * set TERM=xterm-256color
  * handle resize: when xterm fits, pty.resize(cols, rows)

* xterm.js
  * WebGL addon — attach on terminal creation
    * if WebGL fails (headless CI, old GPU): fall back to canvas, log warning
  * addon-fit — call fitAddon.fit() on window resize
    * debounce resize events (100ms)
  * scrollback: 10,000 lines (hardcoded for POC)

* window
  * dark background (#1e1e1e or similar)
  * minimum size: 600x400
  * remember size on quit — not required for POC, but don't prevent it

* process lifecycle
  * window close → kill pty → app quits
  * pty exits (user types `exit`) → keep window open, show "[process exited]" or similar
    * don't auto-close — user might want to scroll back
