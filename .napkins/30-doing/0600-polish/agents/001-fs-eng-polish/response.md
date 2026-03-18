# 0600 Polish — Response

## What was built

All six features from the spec, touching CLI, socket server, main process, renderer, and sidebar.

### 1. Per-project socket

- **`src/shared/constants.ts`** — Added `getServerSocketPath(cwd?)`, `findSocketPath(startDir)`, and `isSocketAlive(socketPath)`. The server-side function computes `.nap/sock` relative to the project cwd. The CLI walk-up function starts at cwd and checks each parent until filesystem root.
- **`src/main/socket-server.ts`** — `startSocketServer()` now takes a `socketPath` parameter instead of using the hardcoded global. Removed local `isSocketAlive` (moved to shared for CLI reuse).
- **`src/main/main.ts`** — Parses `--cwd` from `process.argv` (set by `nap open`). Uses `getServerSocketPath(projectCwd)` to place socket at `<project>/.nap/sock`. All cwd defaults changed from `process.cwd()` to `projectCwd`.
- **`src/cli/nap.ts`** — `resolveSocketOrDie()` calls `findSocketPath(process.cwd())` to walk up and find the nearest `.nap/sock`. Falls back to `NAP_SOCKET` env var for testing compatibility. Error message: `"no nap project found (run 'nap open' in a project directory)"`.
- Legacy `SOCKET_PATH` constant preserved for existing tests that set `NAP_SOCKET` env var.

### 2. CLI help

- `nap` with no args → shows help, exit 0.
- `nap --help` → same output.
- `nap <command> --help` → per-command usage (all 10 commands have help text).
- All commands listed: open, start, ps, log, peek, kill, close, poke, nap, done.
- Unknown command prints error + full help.

### 3. `nap open`

- `nap open [path]` — resolves path to absolute, checks if `.nap/sock` already live, spawns `electron <main.js> --cwd <resolved>` detached with `child.unref()`.
- Uses `NAP_APP_PATH` env var or defaults to `~/nap-app`.
- Checks `isSocketAlive()` before spawning — exits with "nap is already running in this project" if live.

### 4. `nap log`

- **Protocol**: Added `LogRequest` type (`{ type: "log", name }`).
- **Main process**: Async IPC round-trip to renderer — sends `socket:log-request`, renderer reads xterm buffer line-by-line, sends back via `socket:log-response`. 5s timeout safety.
- **Renderer** (`index.tsx`): Handles `onLogRequest` — iterates `buffer.active`, calls `getLine(i).translateToString(true)`, trims trailing empty lines.
- **Preload/types**: Added `onLogRequest`, `sendLogResponse` to the bridge.
- **CLI**: `nap log <name>` prints lines to stdout, one per line (pipe-friendly).

### 5. Colored `nap ps`

- Status column now shows `● running` (green), `● exited` (gray), `● done` (blue) using ANSI escape sequences.
- `printTable()` updated to accept separate display rows (for width calculation without ANSI) and colored rows (for output).
- `nap ps --json` unchanged — raw JSON, no ANSI codes, no table formatting.
- Column alignment preserved via measuring plain-text widths.

### 6. Clickable file paths

- **`src/renderer/file-link-provider.ts`** — New module. `FILE_PATH_REGEX` matches relative (`src/foo.ts`, `./bar.ts`), absolute (`/Users/.../file.ts`), and line:col patterns (`file.ts:42:17`). URL-prefix check prevents matching `https://...` paths.
- `createFileLinkProvider()` returns an `ILinkProvider` for xterm's `registerLinkProvider`. Activation callback resolves relative paths against terminal's cwd, calls `openFilePath`.
- **Preload/main**: `openFilePath` IPC channel → `shell.openPath()` in main process.
- **Store**: `createTerminal` and `addSocketTerminal` both register the link provider. `TerminalMeta.cwd` field added to track per-terminal working directory.

### 7. Cmd+K sidebar filter

- **`src/renderer/components/Sidebar.tsx`** — `useState` for `filterText` and `filterVisible`. `useEffect` listens for `Cmd+K` (opens filter input) and `Escape` (clears and hides). Case-insensitive substring match via `name.toLowerCase().includes(filterText.toLowerCase())`.
- Filter input has `data-testid="sidebar-filter"` for e2e testing.
- Agent cards have `data-testid="agent-card"` for e2e testing.
- Filtered cards remain fully clickable (same `onClick` handler).

## Decisions

1. **`isSocketAlive` in shared** — Both CLI and socket-server need it. Moved to `shared/constants.ts` to avoid CLI depending on Electron main process code (different tsconfig include scope).

2. **Log buffer via IPC round-trip** — xterm instances live in the renderer, so log reads go main→renderer→main. Added request ID counter and 5s timeout to prevent hung requests.

3. **File link regex** — Kept simple: looks for path-like strings with a file extension. URL exclusion checks for `http://`/`https://` prefix. No filesystem stat — spec says "no stat, no fs check".

4. **Path resolution in renderer** — Can't use Node `path.join` in renderer (contextIsolation). Used simple string concatenation for relative→absolute path resolution.

5. **`--cwd` argv parsing** — Rather than using a full arg parser in the Electron main process, we do a simple linear scan of `process.argv` for `--cwd`. Keeps it dependency-light.

## Test compatibility

- All 24 existing tests pass (`npm run test:small`).
- `tsc --noEmit` clean.
- CLI builds successfully (`npm run build:cli`).
- `NAP_SOCKET` env var override still works for tests that set it directly.
- Test setup.ts updated with new mock electronAPI methods (`onLogRequest`, `sendLogResponse`, `openFilePath`, `onSocketStatusChanged`).

## Files changed

| File | Change |
|------|--------|
| `src/shared/constants.ts` | Added `getServerSocketPath`, `findSocketPath`, `isSocketAlive` |
| `src/shared/protocol.ts` | Added `LogRequest` type |
| `src/cli/nap.ts` | Rewritten: help text, open, log, colored ps, socket discovery |
| `src/main/socket-server.ts` | `startSocketServer` takes `socketPath` param, imports shared `isSocketAlive` |
| `src/main/main.ts` | `--cwd` parsing, per-project socket, log handler, `shell.openPath` IPC, cwd propagation |
| `src/main/preload.ts` | Added `onLogRequest`, `sendLogResponse`, `openFilePath` |
| `src/types/electron-api.d.ts` | Added new API types, cwd in terminal-created |
| `src/renderer/index.tsx` | Log request handler, cwd passthrough |
| `src/renderer/store.ts` | `TerminalMeta.cwd`, link provider registration, `addSocketTerminal` cwd param |
| `src/renderer/components/Sidebar.tsx` | Cmd+K filter, data-testid attributes |
| `src/renderer/file-link-provider.ts` | **New** — file path regex + xterm link provider |
| `tests/setup.ts` | Updated mock electronAPI |
