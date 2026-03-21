# 001-fs-eng — Cmd+W Close Terminal

## What was built

Cmd+W dismisses terminated terminal cards. The keystroke is ignored when the active terminal is still running or when it's the last card.

## Changes

### main.ts
- Added `Close Terminal` menu item with `CmdOrCtrl+W` accelerator in the Terminal submenu. Sends `terminal:close-active` IPC to renderer.
- Added `pty:close` IPC handler that combines `killPty` + `removeSession` — ensures the session is cleaned up from both the PTY map and the session store in one call.

### preload.ts
- Added `pty.close(id)` — sends `pty:close` IPC (kill + remove session).
- Added `onCloseActiveTerminal` — listens for `terminal:close-active` from menu.

### electron-api.d.ts
- Added `close` to `ElectronPtyAPI`.
- Added `onCloseActiveTerminal` to `ElectronAPI`.

### store.ts
- Added `closeActiveTerminal()` action. Guards:
  1. No active terminal → no-op
  2. Only one terminal left → no-op
  3. Active terminal status is `running` → no-op
  4. Otherwise: calls `pty.close` (main kills PTY + removes session), disposes xterm, removes from store, switches to first remaining terminal.

### index.tsx
- Wired `onCloseActiveTerminal` listener to call `closeActiveTerminal()`.
- Added cleanup in the effect teardown.

## Decisions

- **`pty:close` vs reusing `pty:kill`**: The existing `pty:kill` only kills the PTY process but leaves the session in the session store. Socket `close` already had the pattern of kill + removeSession. Added `pty:close` as a dedicated IPC channel so `nap ps` doesn't show ghost sessions after Cmd+W.
- **Guard order**: Check terminal count before status — avoids the edge case where the last terminal is exited but shouldn't be dismissable.
- **Active switch target**: Falls back to `remaining[0]` (first terminal in list). Matches existing behavior in `removeTerminal` and `disposeTerminalOnly`.

## Verification

- `tsc --noEmit` — zero errors
- `vitest run` — 53/53 tests pass
