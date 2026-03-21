# Test Engineer — 0100 Electron App + Single Terminal — Results

## Summary

7 of 8 test cases pass. 1 skipped (manual). Zero type errors.

```
  ✓  T-0100-01: pty data reaches xterm through IPC bridge (10ms)
  ✓  T-0100-02: xterm input reaches pty through IPC bridge (reverse path) (1.5s)
  ✓  T-0100-03: resize propagates from window to pty (375ms)
  ✓  T-0100-04: pty exits but window stays alive (520ms)
  ✓  T-0100-05: window close kills pty cleanly (1.5s)
  ✓  T-0100-06: high-throughput output does not choke IPC bridge (80ms)
  ✓  T-0100-07: WebGL addon initialization — happy path (2ms)
  -  T-0100-08: native module build — skipped (manual)
  7 passed, 1 skipped (12.9s total including 0200 tests)
```

## Test infrastructure

Tests use the consolidated project-wide setup:

- `tests/electron/terminal.spec.ts` — all 0100 medium tests (Playwright + Electron)
- `tests/helpers.ts` — shared helpers (`waitForShellReady`, `getActiveId`, `waitForText`, `ELECTRON_LAUNCH_ARGS`, etc.)
- `playwright.config.ts` — root Playwright config (testDir: `./tests`, serial, 60s timeout, 1 worker)
- `vitest.config.ts` — root Vitest config (for small tests, jsdom environment)
- `tests/tsconfig.json` — TypeScript config for test files (extends root, includes `src/types/**/*.d.ts`)

Run commands:
- `npm run test:medium` — builds app, runs all Playwright tests (headless via `NAP_TEST=1`)
- `npm run test:medium:headed` — same but shows windows (`HEADED=1`)
- `npm run test:small` — runs Vitest unit tests
- `npm test` — runs both small and medium

## Source modifications

### `src/renderer/index.tsx`
Two lines expose `getTerminal` and `useTerminalStore` on `window` for Playwright's `page.evaluate()` to access xterm buffer state and store.

### `src/main/main.ts` — pty lifecycle rewrite
Ptys are now `PtyEntry` objects with stored `IDisposable` for `onData`/`onExit`. The `window-all-closed` handler kills all ptys, disposes data listeners, and waits for all `onExit` callbacks to fire before quitting. This fixes a node-pty SIGABRT that occurred during V8 teardown when the Electron process exited before pty cleanup completed.

Key changes:
- `PtyEntry` interface: `{ process: IPty, dataDisposable: IDisposable, exitDisposable: IDisposable }`
- `pendingExits` counter tracks live ptys; `checkQuit()` calls `app.quit()` only when all exits complete
- `killAllPtys()` disposes data listeners before killing processes
- Safety timeout (2s) prevents hanging if a pty refuses to die
- `NAP_TEST` env var suppresses window show for headless testing

### Test teardown
All test groups call `app.evaluate(({ app }) => app.quit())` before `app.close()` for clean macOS shutdown (ensures the Electron app's own quit path runs rather than force-killing).

## Test details

### T-0100-01: pty data → IPC → xterm ✓

- Writes `echo hello\n` to pty via `window.electronAPI.pty.write`
- Polls xterm buffer for "hello" — found
- Writes ANSI escape `printf "\033[31mred\033[0m"` to pty
- Polls xterm buffer for "red" (escape sequences stripped by xterm parser) — found
- **Proves**: IPC serialization preserves raw bytes including ANSI escapes

### T-0100-02: xterm input → IPC → pty (reverse path) ✓

- Calls `terminal.paste('echo roundtrip\n')` — goes through xterm.onData → IPC → pty → echo → IPC → xterm
- Polls buffer for "roundtrip" — found (proves full round-trip)
- Starts `sleep 999\n`, waits 1s, sends `\x03` (Ctrl+C), waits 500ms, then runs a marker echo
- Marker appears — shell is responsive after Ctrl+C
- **Proves**: renderer → IPC → pty input path works, Ctrl+C not intercepted by Electron menu accelerators

### T-0100-03: resize propagates window → xterm → pty ✓

- Reads initial cols (varies by window size)
- Resizes window to 1400×900 via `BrowserWindow.setSize`
- Waits 300ms (debounce 50ms + render)
- Reads new cols — greater than initial
- Runs `tput cols` in pty, polls with `waitForFunction` until digits-only line appears after marker
- tput output matches xterm cols exactly
- **Proves**: ResizeObserver → fitAddon.fit() → IPC pty:resize → pty.resize pipeline works end-to-end

### T-0100-04: pty exits, window stays alive ✓

- Writes `exit\n` to pty
- Polls store for `status === 'exited'` — found
- Checks `BrowserWindow.isDestroyed()` — false (window lives)
- Checks `buffer.active.length > 0` — scrollback preserved
- Pastes text after exit, checks buffer — text does NOT appear (`disableStdin = true` blocks it)
- **Proves**: pty exit → store update → window stays open, scrollback preserved, input blocked

### T-0100-05: window close kills pty cleanly ✓

- Gets shell PID via `echo $$` (expanded by shell, read from xterm buffer)
- Closes window via `BrowserWindow.close()` — triggers `window-all-closed` → `killAllPtys()` → wait for exits → `app.quit()`
- Waits for Electron process to exit (`app.close()`)
- Checks `process.kill(pid, 0)` — throws (process is gone)
- **Proves**: pty lifecycle cleanup works: dispose data listeners, kill processes, wait for onExit, no orphan shell processes, no SIGABRT

### T-0100-06: high-throughput output ✓

- Writes `seq 1 50000\n` to pty (50,000 lines of output)
- Polls buffer tail for "50000" — found
- Wall-clock time: 80ms (well under 10s threshold)
- Buffer length: ≤ 10,200 lines (scrollback 10,000 + viewport) — enforced
- Buffer length: > 1,000 lines — sanity check
- **Proves**: IPC bridge handles burst output without choking, scrollback limit enforced

### T-0100-07: WebGL addon (happy path only) ✓

- Checks `terminal.element` exists — rendering is active
- **Fallback path is manual**: forcing WebGL context creation failure requires GL driver-level mocking, not reliable in Playwright. Canvas fallback code exists in `terminal-registry.ts:48-66`. Could test in headless CI without GPU.

### T-0100-08: native module build — SKIPPED (manual)

- Per test architecture: depends on developer environment (macOS version, Xcode CLI tools, Python, system Node)
- Verification: fresh clone → `npm install` → `npm start` → terminal works
- Not automatable in a meaningful way outside CI

## Issues found and fixed during testing

1. **node-pty SIGABRT on shutdown**: the original `window-all-closed` handler called `pty.kill()` then immediately `app.quit()`. node-pty's `ThreadSafeFunction` was still executing the `onExit` callback when V8 tore down, causing a SIGABRT crash dialog on macOS. Fixed by tracking pending exits and deferring `app.quit()` until all `onExit` callbacks fire (with a 2s safety timeout).

2. **T-0100-03 timing**: initial implementation used a one-shot `page.evaluate` to read tput output immediately after the echo marker appeared. The tput output arrives after the marker (separate IPC message). Fixed by using `page.waitForFunction` to poll until the digits-only line appears after the marker.

3. **T-0100-02 Ctrl+C**: initial implementation sent `sleep 999` without a newline (command never started). Also no wait between Ctrl+C and the verification echo. Fixed by adding `\n` to submit the command, waiting 1s for it to start, sending Ctrl+C, waiting 500ms for signal processing, then verifying.

## Type checking

```
$ tsc --noEmit                        # source: 0 errors
$ tsc --noEmit -p tests/tsconfig.json # tests:  0 errors
```
