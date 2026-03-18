# Response: `--name` and `--command` flags for `nap open` + flaky test fix

## What was built

`nap open . --name architect --command "claude code"` now launches Nap with the first terminal card named "architect" running the specified command, instead of the default "shell" login shell.

### Changes (6 files)

1. **`src/cli/nap.ts`** — `open` command parses `--name` and `--command` flags, passes them as argv to the Electron spawn.

2. **`src/main/main.ts`** — Replaced single-purpose `parseCwdFromArgv()` with generic `parseArgvFlag(flag)`. Reads `--name` (default "shell") and `--command` (default undefined = login shell). Added `ipcMain.handle('get-initial-terminal-opts')` so the renderer can query both values. Extended `pty:create` handler to accept and forward an optional `command`.

3. **`src/main/preload.ts`** — Exposed `getInitialTerminalOpts()` via `ipcRenderer.invoke`. Updated `pty.create` opts type to include optional `command`.

4. **`src/renderer/index.tsx`** — First terminal creation is now async: calls `getInitialTerminalOpts()` then `createTerminal(name, undefined, command)`. The test fixture already waits for `terminals.length > 0` so no timing issues.

5. **`src/renderer/store.ts`** — `createTerminal` accepts optional third `command` param, forwards it to `pty.create` IPC.

6. **`src/types/electron-api.d.ts`** — Updated `ElectronPtyAPI.create` opts and added `getInitialTerminalOpts`.

### Flaky test fix (T-0200-03)

**`tests/multi-terminal/multi-terminal.spec.ts`** — Fixed T-0200-03 which failed ~25% of runs.

**Root cause**: The wait condition `line.includes('100')` matched the shell echo of the command `seq 1 100`, not the actual output line `100`. So the wait would return before `seq` had produced any output, and the subsequent check for `50` would fail because the output hadn't arrived yet.

**Fix**: Changed both checks from substring matching (`includes`) to exact line matching (`===`) so they only match actual `seq` output lines, not the command echo.

Verified stable with 30 consecutive passing runs.

### Design decisions

- **IPC invoke** over env var: the renderer runs with `contextIsolation: true`, so it can't read `process.env`. A single `ipcMain.handle` / `ipcRenderer.invoke` round-trip is clean and type-safe.
- **Single `get-initial-terminal-opts` channel** rather than one per flag — fewer IPC channels, trivially extensible.
- **`--command` runs through the same shell `-c` path** that `nap start` uses — no new pty logic needed.

### Verification

- `tsc --noEmit` — zero errors
- `npm run test:small` — 63/63 pass
- `npm run test:medium` — 59/59 pass, 1 skipped
- T-0200-03 — 30/30 pass (was ~75% before fix)
