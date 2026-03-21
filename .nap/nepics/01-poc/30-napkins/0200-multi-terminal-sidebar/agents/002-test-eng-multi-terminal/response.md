# Test Engineer Response — 0200 Multi-Terminal + Sidebar

## Summary

All 8 test cases from `.test.md` implemented. All passing. Zero type errors.

- **Small tests (Vitest + jsdom):** 8/8 pass (T-0200-07, T-0200-08)
- **Medium tests (Playwright + Electron):** 6/6 pass (T-0200-01 through T-0200-06)
- **`tsc --noEmit`:** clean

## Test files

| File | Tests | Runner |
|------|-------|--------|
| `tests/multi-terminal/store-registry.test.ts` | T-0200-07 (4 cases), T-0200-08 (4 cases) | Vitest |
| `tests/multi-terminal/multi-terminal.spec.ts` | T-0200-01 through T-0200-06 | Playwright |

Shared infrastructure (consolidated with 0100):
- `vitest.config.ts` — single root config, discovers all `tests/**/*.test.ts`
- `playwright.config.ts` — single root config, discovers all `tests/**/*.spec.ts`
- `tests/setup.ts` — vitest mocks for `window.electronAPI`, `@xterm/addon-webgl`, `@xterm/addon-canvas`
- `tests/helpers.ts` — shared Playwright helpers (`waitForShellReady`, `getActiveId`, `waitForText`, `createTerminal`, `ptyWrite`, `bufferLength`, `bufferLine`, `getTerminalMeta`)
- `tests/tsconfig.json` — extends root, covers all test files

## Run commands

```bash
npm run test:small     # vitest: all unit tests
npm run test:medium    # build + playwright: all e2e tests (headless by default)
npm run test:medium:headed  # same but with visible Electron windows
npm test               # both
```

## Source modifications

### `src/renderer/index.tsx`
Exposed `getTerminal` and `useTerminalStore` on `window` for Playwright `page.evaluate()` access.

### `src/main/main.ts` — pty lifecycle fix
The original code had a shutdown race condition: `pty.kill()` sends SIGHUP but doesn't wait for the child to die. During V8 teardown, node-pty's C++ ThreadSafeFunction would fire into a half-destroyed environment → SIGABRT.

Fix:
- Store `IDisposable` from `pty.onData()`/`pty.onExit()` to properly dispose listeners
- Track `pendingExits` count (incremented on create, decremented in onExit callback)
- On quit: kill all ptys, dispose data listeners, wait for all onExit callbacks to complete, then call `app.quit()`
- Safety timeout (2s) prevents hanging if a pty refuses to die
- Test teardowns call `app.evaluate(({ app }) => app.quit())` before `app.close()` so macOS sees a proper `[NSApplication terminate:]` quit

## Per-test results

### T-0200-01: terminal switching preserves scrollback and buffer state
**PASS.** Writes `seq 1 5000` to terminal A, waits for completion, records buffer length and line 50 content. Creates terminal B, switches A→B→A. Buffer length and line content match before/after.

### T-0200-02: WebGL survives DOM detach/reattach cycle
**PASS.** On this machine, WebGL canvas is not present (headless-like rendering). Test falls through to the alternative path: verifies terminal still renders after reparent by writing text and confirming it appears in the buffer. If WebGL were available, the test monitors `webglcontextlost` and verifies context survival or fallback to CanvasAddon.

### T-0200-03: background terminal receives output while hidden
**PASS.** Terminal B is created, A is made active (B hidden). `seq 1 100` is written to B's pty. Buffer is read from B without switching to it — line containing "100" and "50" both found. Confirms xterm.write() buffers internally without DOM.

### T-0200-04: rapid switching doesn't corrupt state or leak
**PASS.** Three terminals with unique markers (`MARKER_A/B/C`). Rapid-fire `setActive` calls: B→C→A→B→C. After settling, activeTerminalId is termC and its buffer contains `MARKER_C`. No error-level console messages.

### T-0200-05: sidebar Cmd+B toggle resizes terminal correctly
**PASS.** Reads initial cols with sidebar visible. Toggles sidebar off via `toggleSidebar()`, waits for ResizeObserver debounce (300ms). Cols increase (sidebar freed ~250px). Toggle back, cols restored to original value.

### T-0200-06: terminal exit updates sidebar card but doesn't remove it
**PASS.** Creates terminal B, writes `exit\n`. Polls store until status changes to `'exited'`. Terminal count unchanged (card not removed). Buffer still readable (`length > 0`). Confirms `setStatus` is called, not `removeTerminal`.

### T-0200-07: terminal objects live outside React render cycle
**PASS (4 sub-tests).**
1. `createTerminal` puts a TerminalEntry in the registry with a real xterm Terminal + buffer.
2. `setStatus` mutates store state but registry entry is referentially identical (`toBe`).
3. Terminal buffer length unchanged after store mutation.
4. Multiple store mutations (setStatus, toggleSidebar×2) don't affect registry identity.

### T-0200-08: sidebar card ordering matches creation order
**PASS (4 sub-tests).**
1. Three terminals created → names array is `['first', 'second', 'third']`.
2. Remove middle → remaining is `['first', 'third']`.
3. First created terminal auto-set as active.
4. Removing active terminal falls back to first remaining.

## Notes

- **T-0200-02 WebGL path**: The full WebGL context-loss path was not exercised because this Electron build renders without GPU-accelerated WebGL canvas. The test handles this gracefully and verifies the alternative: terminal renders correctly after DOM reparent regardless of renderer backend. To exercise the WebGL path, run on a machine with GPU support.
- **`nextId` counter**: The module-level `nextId` in `store.ts` does not reset between vitest test blocks. Tests use returned IDs rather than hardcoded `'term-1'` etc. to stay isolated.
- **Vitest mocks**: `@xterm/addon-webgl` and `@xterm/addon-canvas` are mocked because they require browser WebGL/Canvas2D APIs. Real `@xterm/xterm` and `@xterm/addon-fit` are used — xterm buffers work in jsdom without `terminal.open()`.
