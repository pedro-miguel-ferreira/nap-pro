* electron single terminal — test cases

* T-0100-01: pty data reaches xterm through IPC bridge
  * flow: pty.onData → main process → IPC → preload → renderer → xterm.write
  * subsystems: node-pty (main), IPC bridge, xterm.js (renderer)
  * setup: launch app, shell spawns
  * action: type `echo hello` in terminal
  * expected: "hello" appears in xterm output buffer
  * likely to break: IPC serialization — binary data or escape sequences get mangled crossing the process boundary
    * pty emits raw bytes, xterm expects them untouched
    * test with ANSI color codes: `printf "\033[31mred\033[0m"` — should render colored text, not escape garbage

* T-0100-02: xterm input reaches pty through IPC bridge (reverse path)
  * flow: xterm.onData → renderer → IPC → main → pty.write
  * subsystems: xterm.js (renderer), IPC bridge, node-pty (main)
  * action: type characters in terminal, including special keys (Ctrl+C, arrow keys, tab completion)
  * expected: pty receives exact byte sequences — Ctrl+C sends 0x03, arrow keys send escape sequences
  * likely to break: key events get intercepted by Electron before reaching xterm
    * Cmd+C vs Ctrl+C — Electron might eat Ctrl+C as a copy shortcut
    * tab character might trigger Electron focus navigation instead of shell completion

* T-0100-03: resize propagates from window to pty
  * flow: window resize → fitAddon.fit() → new cols/rows → IPC → pty.resize(cols, rows)
  * subsystems: addon-fit (renderer), IPC bridge, node-pty (main)
  * action: resize window from 800x600 to 1200x800
  * expected: terminal content reflows, shell prompt adjusts, `tput cols` returns new column count
  * likely to break: debounce timing — rapid resize fires multiple fit() calls, pty gets intermediate sizes
    * the 100ms debounce means pty.resize is called once, not 50 times during drag
    * if debounce is missing: pty gets slammed with resize signals, shell goes haywire
  * also test: resize during active output (run `top`, resize) — should not crash or corrupt display

* T-0100-04: pty exits but window stays alive
  * flow: user types `exit` → shell exits → pty emits 'exit' event → main process updates state → renderer shows exit state
  * subsystems: node-pty lifecycle, main process state, renderer display
  * action: type `exit` in shell
  * expected: window stays open, scrollback preserved, user can scroll up through history
  * likely to break: the natural instinct is to close the window when the process exits
    * if someone wires pty.onExit → window.close(), the user loses scrollback
    * also: what does xterm show after pty dies? needs an explicit "[process exited]" or cursor stops blinking
  * also test: try typing after pty exits — should do nothing, not throw

* T-0100-05: window close kills pty cleanly
  * flow: user closes window (Cmd+W) → app.on('window-all-closed') → kill pty → app.quit()
  * subsystems: Electron window lifecycle, node-pty, process cleanup
  * action: close window while shell is running
  * expected: pty process killed (SIGHUP), no orphan shell process left behind
  * likely to break: pty.kill() not called before window destroys — orphan shell process survives app quit
    * verify with `ps aux | grep $SHELL` before and after — no new orphan
    * especially bad if pty spawned child processes (e.g., running `node server.js` in shell)

* T-0100-06: high-throughput output doesn't choke the IPC bridge
  * flow: pty produces massive output → IPC bridge → xterm.write() in tight loop
  * subsystems: node-pty, IPC serialization, xterm.js write buffer
  * action: run `seq 1 50000` — 50k lines of output
  * expected: all lines arrive, scrollback contains them, terminal stays responsive during and after
  * likely to break: IPC backs up — renderer can't process writes fast enough
    * xterm.write() is synchronous, large writes block the renderer
    * may need write batching or flow control at the IPC layer
    * symptom: UI freezes during heavy output, then catches up
  * also test: can user scroll up to line 1 after output finishes? (scrollback = 10k lines, so earliest lines are gone, but line 40001+ should be there)

* T-0100-07: WebGL addon initialization and fallback
  * flow: terminal creates → WebGL addon loads → attaches to canvas
  * subsystems: xterm.js, addon-webgl, GPU context
  * action: app launches normally
  * expected: WebGL addon active (smooth rendering, GPU-accelerated)
  * likely to break: WebGL context creation fails on certain hardware/CI
    * spec says fall back to canvas renderer + log warning
    * test: force WebGL failure (mock context creation) → verify canvas fallback works
    * verify: no crash, just degraded rendering

* T-0100-08: native module build (node-pty + electron-rebuild)
  * flow: npm install → electron-rebuild → node-pty compiles against Electron's Node headers
  * subsystems: node-pty native addon, electron-rebuild toolchain
  * action: fresh clone, `npm install`, `npm start`
  * expected: node-pty loads without "module version mismatch" error, shell spawns
  * likely to break: this is the #1 risk per the napkin
    * node-pty compiled against system Node, not Electron's Node → crash at require()
    * missing xcode CLI tools on fresh macOS → compile fails silently
    * test: `npm start` after clean install produces a working terminal, not a white screen with console errors
