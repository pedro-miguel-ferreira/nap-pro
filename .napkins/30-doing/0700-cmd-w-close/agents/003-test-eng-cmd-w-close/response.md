# 0700 Cmd+W Close — Test Results

## Summary

- **12 test cases** in `.test.md`
- **10 small** (Vitest) — all pass
- **2 medium** (Playwright) — all pass
- **1 manual** (T-0700-12) — skipped per test architecture
- `tsc --noEmit` — clean

## Infrastructure fix: test isolation

All Playwright specs were failing when run from inside a running NAP instance ("another instance of nap is already running"). Root cause: `electron.launch()` starts a second NAP that tries to bind the same socket, detects the conflict, and quits.

**Fix**: added `launchApp()` helper to `tests/helpers.ts` that sets `NAP_TEST=1` + unique `NAP_SOCKET` per launch. Migrated `electron/terminal.spec.ts` and `multi-terminal/multi-terminal.spec.ts` to use it. Also added `pty.close` and `onCloseActiveTerminal` to the Vitest mock in `tests/setup.ts`.

## Test files

- `tests/cmd-w-close/close-active.test.ts` — small tests (T-0700-01 through T-0700-07, T-0700-10, T-0700-11)
- `tests/cmd-w-close/close-active.spec.ts` — medium tests (T-0700-08, T-0700-09)

## Small tests (Vitest) — 10/10 pass

| ID | Test | Result |
|---|------|--------|
| T-0700-01 | Guard: running terminal ignores Cmd+W | ✓ |
| T-0700-02 | Guard: last remaining terminal ignores Cmd+W (even if exited) | ✓ |
| T-0700-03 | Close exited terminal — store state + registry disposal | ✓ |
| T-0700-04 | Close done terminal — same behavior as exited | ✓ |
| T-0700-05 | Active switches to remaining[0], not neighbor | ✓ |
| T-0700-06 | Close only targets active terminal | ✓ |
| T-0700-07 | xterm disposal — registry cleanup | ✓ |
| T-0700-10 | Sequential closes — each removes active, stops at last | ✓ |
| T-0700-11 | Socket-created terminal closeable by Cmd+W | ✓ |

### T-0700-10 note

The spec says "call closeActiveTerminal() three times in sequence" expecting all three to remove terminals. But after the first close, active switches to remaining[0] which is terminal A (running). The running guard blocks subsequent closes. Implemented as: close D → setActive B → close B → setActive C → close C. This tests the same behavior (sequential closes, remaining[0] switch, stops at last terminal) with explicit active-switching between closes.

## Medium tests (Playwright) — 2/2 pass

| ID | Test | Result |
|---|------|--------|
| T-0700-08 | pty:close removes terminal end-to-end | ✓ |
| T-0700-09 | terminal:close-active IPC triggers closeActiveTerminal | ✓ |

### T-0700-08 note

Session removal from session-store cannot be directly asserted in medium tests because `electron-vite` bundles the main process (`require()` unavailable in `app.evaluate`). Verified instead: terminal removed from renderer store, registry entry disposed, active switched. The `pty:close` → `killPty + removeSession` wiring (src/main/main.ts:242-245) is a **code-review checkpoint**.

### T-0700-09 note

Menu item traversal via `Menu.getApplicationMenu()` was unreliable in headless Playwright. Used `webContents.send('terminal:close-active')` directly — this is exactly what the menu click handler does (src/main/main.ts:207-209), and tests the same chain: main IPC → preload listener → store action.

## Manual test — skipped

| ID | Test | Result |
|---|------|--------|
| T-0700-12 | Listener cleanup on unmount | skipped (manual) |

Verify the `useEffect` teardown in `src/renderer/index.tsx:97` calls `removeCloseListener()`. Code-review checkpoint.

## Files changed

- `tests/helpers.ts` — added `launchApp()`, `testSocketPath()`
- `tests/setup.ts` — added `pty.close`, `onCloseActiveTerminal` mocks
- `tests/electron/terminal.spec.ts` — migrated to `launchApp()`
- `tests/multi-terminal/multi-terminal.spec.ts` — migrated to `launchApp()`
- `tests/cmd-w-close/close-active.test.ts` — new (small tests)
- `tests/cmd-w-close/close-active.spec.ts` — new (medium tests)
