# 0700 Cmd+W Close — Test Cases

## T-0700-01: guard — running terminal ignores Cmd+W

- **Flow**: active terminal has status `running` → closeActiveTerminal() → no-op
- **Subsystems**: store
- **Expected**: terminal list unchanged, activeTerminalId unchanged, no IPC sent to main
- **Likely to break**: if guard order changes or status check is removed
- **Size**: small
- **Verification**: call `closeActiveTerminal()` on a running terminal, assert `terminals.length` and `activeTerminalId` are identical before and after

## T-0700-02: guard — last remaining terminal ignores Cmd+W (even if exited)

- **Flow**: single terminal with status `exited` → closeActiveTerminal() → no-op
- **Subsystems**: store
- **Expected**: terminal stays in list, active stays set
- **Likely to break**: if guard order flips (status checked before count) — the exited check would pass, then the terminal gets removed leaving zero terminals. Guard order is load-bearing.
- **Size**: small
- **Verification**: create one terminal, set status to `exited`, call `closeActiveTerminal()`, assert `terminals.length === 1`

## T-0700-03: close exited terminal — store state

- **Flow**: two terminals, active is `exited` → closeActiveTerminal() → terminal removed, active switches
- **Subsystems**: store, terminal-registry
- **Expected**: closed terminal gone from `terminals[]`, activeTerminalId set to remaining[0], registry entry disposed
- **Likely to break**: activeTerminalId pointing to stale id, registry leak (entry not deleted)
- **Size**: small
- **Verification**: create two terminals, set active to exited, call `closeActiveTerminal()`, assert `terminals.length === 1`, assert `activeTerminalId === remaining terminal id`, assert `getTerminal(closedId) === undefined`

## T-0700-04: close done terminal — same behavior as exited

- **Flow**: active terminal has status `done` → closeActiveTerminal() → terminal removed
- **Subsystems**: store
- **Expected**: `done` is treated identically to `exited` — the guard only blocks `running`
- **Likely to break**: if guard changes to whitelist instead of blacklist (e.g., `if (status !== 'exited')`)
- **Size**: small
- **Verification**: create two terminals, set active to `done`, call `closeActiveTerminal()`, assert terminal removed

## T-0700-05: active switches to first remaining terminal

- **Flow**: three terminals [A, B, C], B is active and exited → close B → active becomes A (first in list)
- **Subsystems**: store
- **Expected**: activeTerminalId === A.id (remaining[0]), not C
- **Likely to break**: if switch logic uses index-based neighbor instead of remaining[0]
- **Size**: small
- **Verification**: create three terminals, setActive to middle, set it exited, close, assert active is first terminal

## T-0700-06: closing non-active terminal position — close always targets active

- **Flow**: two terminals, first is exited but second is active (running) → closeActiveTerminal() → no-op (active is running)
- **Subsystems**: store
- **Expected**: closeActiveTerminal only looks at the active terminal, not any exited terminal in the list
- **Likely to break**: if implementation iterates looking for any closeable terminal instead of checking active
- **Size**: small
- **Verification**: create two terminals, set first to exited, keep second active and running, call `closeActiveTerminal()`, assert both terminals still present

## T-0700-07: xterm disposal on close — registry cleanup

- **Flow**: close an exited terminal → disposeTerminal called → registry entry removed
- **Subsystems**: store, terminal-registry
- **Expected**: `getTerminal(closedId)` returns undefined after close. The xterm instance's `dispose()` was called (buffer inaccessible).
- **Likely to break**: if `disposeTerminal` call is removed or reordered after state update (race with React re-render trying to access disposed terminal)
- **Size**: small
- **Verification**: create two terminals, close one, assert `getTerminal(closedId)` is undefined

## T-0700-08: pty:close IPC sends kill + removeSession

- **Flow**: renderer sends `pty:close` IPC → main calls killPty() + removeSession()
- **Subsystems**: main process (pty map, session-store), preload (IPC bridge)
- **Expected**: PTY process killed, session removed from session-store (no ghost in `nap ps`)
- **Likely to break**: if pty:close handler only kills but doesn't remove session (the exact bug that motivated pty:close vs pty:kill)
- **Size**: medium
- **Verification**: launch app, create second terminal via `createTerminal`, wait for shell ready, exit the shell (`exit\n`), wait for status `exited`, call `closeActiveTerminal()` via `page.evaluate`, then verify via `app.evaluate` that the session is gone from session-store and the pty is gone from the ptys map

## T-0700-09: menu accelerator Cmd+W triggers closeActiveTerminal

- **Flow**: user presses Cmd+W → Electron menu sends `terminal:close-active` IPC → renderer calls `closeActiveTerminal()`
- **Subsystems**: main (menu), preload (IPC listener), renderer (store)
- **Expected**: the full chain from keyboard shortcut to store action works end-to-end
- **Likely to break**: IPC channel name mismatch between main and preload, listener not wired in index.tsx
- **Size**: medium
- **Verification**: launch app, create second terminal, exit it, simulate menu click via `app.evaluate` (trigger the Close Terminal menu item), assert terminal count decreased. Note: Playwright can trigger menu items via `Menu.getApplicationMenu()` in app.evaluate.

## T-0700-10: rapid Cmd+W — close multiple exited terminals in sequence

- **Flow**: four terminals [A, B, C, D], B/C/D exited, D active → Cmd+W → Cmd+W → Cmd+W → only A remains
- **Subsystems**: store, terminal-registry
- **Expected**: each close removes the current active, switches to remaining[0], next close operates on new active. Stops when only one terminal left.
- **Likely to break**: race condition if close doesn't synchronously update active before next close fires, or if remaining[0] logic picks a just-disposed terminal
- **Size**: small
- **Verification**: create four terminals, set B/C/D to exited, make D active, call `closeActiveTerminal()` three times in sequence, assert only A remains, assert A is active

## T-0700-11: close after socket-created terminal

- **Flow**: terminal created via `addSocketTerminal` → exits → closeActiveTerminal()
- **Subsystems**: store, preload (pty.close IPC)
- **Expected**: socket-created terminals are closeable by Cmd+W — same guards apply, same disposal
- **Likely to break**: if `closeActiveTerminal` assumes terminals were created via `createTerminal` and misses socket-created ones
- **Size**: small
- **Verification**: call `addSocketTerminal()`, set status to exited, verify closeActiveTerminal removes it

## T-0700-12: listener cleanup on unmount

- **Flow**: renderer registers `onCloseActiveTerminal` listener → app teardown → listener removed
- **Subsystems**: renderer (index.tsx), preload
- **Expected**: the cleanup function returned by `onCloseActiveTerminal` is called during effect teardown, preventing double-fire on HMR or re-mount
- **Likely to break**: if cleanup isn't wired in the useEffect return
- **Size**: medium — manual inspection
- **Verification**: manual — verify the effect teardown calls `removeCloseListener()`. Programmatic verification would require triggering HMR in test, which is fragile. Mark as code-review checkpoint.
