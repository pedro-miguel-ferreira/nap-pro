* electron single terminal — test cases (v2)

* T-0100-01: pty data reaches xterm through IPC bridge
  * size: medium (Playwright + Electron)
  * flow: pty.onData → main process → IPC `pty:data` → preload → renderer → xterm.write
  * subsystems: node-pty (main), IPC bridge, xterm.js (renderer)
  * verification: automatable
    * `app.evaluate()` — write `echo hello\n` to pty via `ptys.get(id).write('echo hello\n')`
    * `page.evaluate()` — read xterm buffer:
      * `getTerminal(id).terminal.buffer.active.getLine(N).translateToString()`
      * assert line contains "hello"
    * also: ANSI color test — write `printf "\033[31mred\033[0m"` to pty
      * read buffer line, verify text content is "red" (xterm parses escape sequences)
      * verifies IPC doesn't mangle escape bytes
  * likely to break: IPC serialization strips or re-encodes raw bytes crossing the process boundary

* T-0100-02: xterm input reaches pty through IPC bridge (reverse path)
  * size: medium (Playwright + Electron)
  * flow: xterm.onData → renderer → IPC `pty:write` → main → pty.write
  * subsystems: xterm.js (renderer), IPC bridge, node-pty (main)
  * verification: automatable
    * `page.evaluate()` — call `getTerminal(id).terminal.paste('echo roundtrip\n')` to inject input
    * `page.evaluate()` — poll xterm buffer for "roundtrip" appearing in output (shell echoes it)
      * `getTerminal(id).terminal.buffer.active.getLine(N).translateToString().includes('roundtrip')`
    * this proves: renderer → IPC → pty → pty output → IPC → xterm (full round-trip)
    * also test: Ctrl+C (0x03) — send via `terminal.paste('\x03')`, verify shell returns to prompt
  * likely to break: Electron menu accelerators intercept Ctrl+C before it reaches xterm

* T-0100-03: resize propagates from window to pty
  * size: medium (Playwright + Electron)
  * flow: window resize → ResizeObserver → fitAddon.fit() → IPC `pty:resize` → pty.resize(cols, rows)
  * subsystems: addon-fit (renderer), IPC bridge, node-pty (main)
  * verification: automatable
    * read initial cols: `page.evaluate(() => getTerminal(id).terminal.cols)`
    * resize window: `electronApp.browserWindow.setSize(1400, 900)`
    * wait 150ms (50ms debounce + render)
    * read new cols: `page.evaluate(() => getTerminal(id).terminal.cols)`
    * assert new cols > old cols
    * verify pty agrees: `page.evaluate(() => { terminal.paste('tput cols\n'); })` then read buffer for the number
    * assert tput output matches xterm cols
  * likely to break: ResizeObserver debounce (50ms in Terminal.tsx:44) — too short causes multiple resize IPC calls, too long causes stale pty dimensions

* T-0100-04: pty exits but window stays alive
  * size: medium (Playwright + Electron)
  * flow: user types `exit` → shell exits → pty `exit` event → IPC `pty:exit` → store.setStatus → renderer stays
  * subsystems: node-pty lifecycle, main process state, renderer
  * verification: automatable
    * write `exit\n` to pty
    * wait for IPC `pty:exit` event — `page.evaluate()` to listen for store status change:
      * `useTerminalStore.getState().terminals[0].status === 'exited'`
    * assert window still exists: `electronApp.browserWindow.isDestroyed() === false`
    * read xterm buffer — scrollback preserved:
      * `getTerminal(id).terminal.buffer.active.length > 0`
    * also: verify typing after exit does nothing — paste text, confirm buffer doesn't change
  * likely to break: someone wires pty.onExit → window.close(), losing scrollback

* T-0100-05: window close kills pty cleanly
  * size: medium (Playwright + Electron)
  * flow: close window → `mainWindow.on('close')` iterates ptys.values(), calls pty.kill() → app.quit()
  * subsystems: Electron window lifecycle, node-pty, process cleanup
  * verification: automatable
    * `app.evaluate()` — read pty process pid: `ptys.get(id).pid`
    * close window: `electronApp.browserWindow.close()`
    * check process is gone: `app.evaluate(() => { try { process.kill(pid, 0); return true; } catch { return false; } })` should return false
    * verifies main.ts:41-44 cleanup loop works
  * likely to break: pty.kill() not called before window destroys — orphan shell process

* T-0100-06: high-throughput output doesn't choke the IPC bridge
  * size: medium (Playwright + Electron)
  * flow: pty produces massive output → IPC bridge → xterm.write() in rapid succession
  * subsystems: node-pty, IPC serialization, xterm.js write buffer
  * verification: automatable
    * write `seq 1 50000\n` to pty
    * wait for output to settle (poll buffer length until stable for 500ms)
    * read xterm buffer — scrollback is 10,000 lines (terminal-registry.ts:15)
    * verify last lines present: `getTerminal(id).terminal.buffer.active.getLine(buffer.active.length - 2).translateToString()` contains "50000"
    * verify earliest lines are evicted (scrollback limit enforced)
    * measure: `page.evaluate(() => performance.now())` before and after — output should complete in < 10s
  * likely to break: IPC backs up — renderer can't process writes fast enough, UI freezes during burst

* T-0100-07: WebGL addon initialization and canvas fallback
  * size: medium (Playwright + Electron)
  * verification: partially automatable
    * happy path: automatable
      * `page.evaluate(() => { const t = getTerminal(id).terminal; return t._addonManager?._addons })` — check WebGL addon is loaded
      * or: check no console warnings about WebGL failure
    * fallback path: manual
      * reason: forcing WebGL context creation failure in a real Electron GPU process requires mocking at the GL driver level — not reliable in Playwright
      * the canvas fallback code exists in terminal-registry.ts:48-66 — verify by code review
      * could test in headless CI where WebGL is unavailable — mark as "CI-only medium test" if CI has no GPU
  * likely to break: WebGL context creation fails silently — no fallback triggered, terminal renders nothing

* T-0100-08: native module build (node-pty + electron-rebuild)
  * size: big
  * verification: manual
    * reason: this is a developer environment journey — depends on macOS version, Xcode CLI tools, Python, system Node version
    * verification: fresh clone → `npm install` → `npm start` → terminal works (not a white screen with console errors)
    * can partially automate in CI: `npm install && npm start` exits 0, pty.spawn doesn't throw
    * but the real value is catching it on a new developer's machine
