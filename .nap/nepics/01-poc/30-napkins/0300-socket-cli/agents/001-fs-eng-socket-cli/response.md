# 0300 Socket + CLI — Response

## What was built

Unix socket server in the Electron main process and a standalone `nap` CLI that communicates with it. External shells can now create terminals, list sessions, switch focus, and kill processes through `~/.nap/sock`.

## Files created

| File | Purpose |
|---|---|
| `src/shared/ndjson.ts` | NDJSON parser (handles split/concatenated TCP chunks) and serializer. Shared between server and CLI. |
| `src/shared/protocol.ts` | TypeScript types for the socket request protocol (start, ps, peek, kill, close). |
| `src/shared/constants.ts` | Socket path constant (`~/.nap/sock`), overridable via `NAP_SOCKET` env var for testing. |
| `src/main/session-store.ts` | Main-process session registry. Tracks all terminals (renderer- and socket-initiated) with UUID, name, status, cwd, parentId, createdAt. Auto-names socket-initiated terminals as `agent-1`, `agent-2`, etc. |
| `src/main/name-resolver.ts` | Name resolution: exact match, ambiguous error, "did you mean?" fuzzy matching via Levenshtein distance. |
| `src/main/socket-server.ts` | `net.createServer` on unix socket. Stale socket detection (try connect → ECONNREFUSED → unlink → proceed). Another-instance detection (try connect → success → throw). |
| `src/cli/nap.ts` | Standalone Node CLI. Connects to socket, sends one ndjson request, prints response, disconnects. Commands: `start`, `ps`, `peek`, `kill`, `close`. |
| `tsconfig.cli.json` | Separate TypeScript config for CLI build (CommonJS output to `out/cli/`). |

## Files modified

| File | Changes |
|---|---|
| `src/main/main.ts` | Extracted `createPtyProcess()` and `killPty()` functions from IPC handlers. Added socket server lifecycle (start on app ready, cleanup on quit/SIGTERM/SIGINT/beforeExit/will-quit). Added `handleSocketRequest()` dispatcher for all socket commands. Modified `pty:create` IPC to accept opts object with name/parentId/cwd. All PTYs now get `NAP_SESSION_ID=<uuid>` in their environment. Session store tracks every terminal. |
| `src/main/preload.ts` | Modified `pty.create` signature to accept opts object. Added three new IPC bridge channels: `onSocketTerminalCreated`, `onSocketPeek`, `onSocketTerminalClose`. |
| `src/types/electron-api.d.ts` | Updated `ElectronPtyAPI.create` signature. Added types for the three new socket IPC channels. |
| `src/renderer/store.ts` | Changed terminal ID generation from `term-N` to `crypto.randomUUID()`. Added `addSocketTerminal()` for socket-initiated terminals (skips `pty:create` since PTY already exists). Added `disposeTerminalOnly()` for socket close (removes xterm without re-killing PTY). |
| `src/renderer/index.tsx` | Added listeners for the three socket IPC channels. Socket terminal creation → `addSocketTerminal()`. Socket peek → `setActive()` + open sidebar. Socket close → `disposeTerminalOnly()`. |
| `tests/setup.ts` | Added mocks for the three new IPC channels. |
| `package.json` | Added `bin.nap` pointing to `out/cli/cli/nap.js`. Added `build:cli` script. |

## Key decisions

**UUIDs everywhere.** Terminal IDs changed from `term-N` to `crypto.randomUUID()`. This gives each terminal a globally unique NAP_SESSION_ID without maintaining a separate mapping. The renderer, main process, and CLI all use the same UUID. Existing tests pass because IDs are treated as opaque strings.

**Session store in main process.** A lightweight in-memory registry tracks all sessions (both renderer-initiated and socket-initiated). The renderer store tracks UI state (xterm instances, active terminal). They stay in sync because both react to the same PTY exit events. `nap ps` queries only the main-process session store — no IPC round-trip to the renderer.

**Synchronous socket handler.** All socket commands are handled synchronously. `start` creates the PTY and responds immediately — the renderer sets up the xterm asynchronously after receiving the IPC notification. This keeps round-trip latency minimal (T-0300-01 target: p95 < 50ms).

**Socket-initiated terminals skip `pty:create` IPC.** For socket `start`, the main process creates the PTY directly and tells the renderer to create the xterm instance via `socket:terminal-created`. The renderer's `addSocketTerminal()` wires up the xterm and sends `pty:ready` to flush buffered output.

**CLI uses process.stderr for errors.** All error messages go to stderr. Only success output goes to stdout. This makes the CLI composable in pipelines.

**NAP_SOCKET env var.** Both the server and CLI read `process.env.NAP_SOCKET` to override the socket path. This is essential for T-0300-08 (testing CLI without a running app) and parallel test isolation.

## Test seams

All seams from `.test.md` are in place:

- **T-0300-02**: `NdjsonParser` is a standalone class in `src/shared/ndjson.ts`. Can be imported and tested directly in Vitest.
- **T-0300-07**: `resolveByName()` is exported from `src/main/name-resolver.ts`. Takes a session array and name string, returns result or error. Pure function, no dependencies.
- **T-0300-08**: CLI exits cleanly with "nap is not running" and exit code 1 when socket doesn't exist. Verified manually: `NAP_SOCKET=/tmp/nonexistent.sock node out/cli/cli/nap.js ps` → "nap is not running", exit 1.
- **T-0300-03/04**: Socket server does stale detection (try connect before unlink) and another-instance detection (successful connect → error + quit).
- **T-0300-05**: `NAP_SESSION_ID` is set in every PTY's environment via `createPtyProcess()`.
- **T-0300-09**: Socket cleanup via `stopSocketServer()` in `will-quit`, `SIGTERM`, `SIGINT`, and `beforeExit` handlers. `stopSocketServer()` is idempotent.

## Build & run

```bash
# Build everything
npm run build && npm run build:cli

# Link CLI globally for development
npm link

# Use from any terminal
nap ps
nap start "echo hello" --name test-1
nap peek test-1
nap kill test-1
nap close test-1
```

## Verification

- `tsc --noEmit` — zero errors
- `npm run test:small` — 8/8 unit tests pass
- `npm run test:medium` — 13/13 e2e tests pass (1 skipped, same as before)
- `npm run build` — electron-vite builds successfully (6 main modules, 1 preload, renderer bundle)
- `npm run build:cli` — CLI compiles to CommonJS in `out/cli/`
- CLI error path verified: "nap is not running" + exit 1

## For architect review

1. **Race on boot.** Socket server starts after `createWindow()` but the renderer's React `useEffect` might not have registered IPC listeners yet. If a CLI command arrives in the first ~100ms of app launch, the renderer might miss the `socket:terminal-created` IPC. Acceptable for POC; could add a renderer-ready handshake later.

2. **Double-kill on close.** Socket `close` kills the PTY in main, then tells the renderer to `disposeTerminalOnly`. But if the renderer's `removeTerminal` is called through another path, it sends `pty:kill` IPC again. This is safe (the IPC handler is idempotent — checks if entry exists) but architecturally noisy.

3. **Session store is ephemeral.** All session data lives in memory. If the app crashes, session history is lost. Fine for POC, but if we need persistence (e.g., reconnect after restart), the session store would need file-backed storage.
