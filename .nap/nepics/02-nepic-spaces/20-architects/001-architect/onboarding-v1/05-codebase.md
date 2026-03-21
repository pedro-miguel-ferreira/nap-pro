# Codebase Guide

## Stack

- Electron 33+ (macOS only for now)
- TypeScript (strict, `tsc --noEmit` must pass)
- React 18 + Zustand (renderer)
- xterm.js + WebGL addon + addon-fit + addon-search (terminal)
- node-pty (pty management, native module)
- electron-vite (build + HMR dev server)
- Vitest (small tests) + Playwright (medium/big tests)

## Source Layout

```
src/
  main/                    Electron main process
    main.ts                App lifecycle, window, pty management, IPC handlers, socket server, menus
    preload.ts             contextBridge — IPC bridge between main and renderer
    socket-server.ts       Unix socket server (net.createServer)
    session-store.ts       In-memory session registry (to be replaced with SQLite)
    name-resolver.ts       Name lookup with fuzzy matching
    message-queue.ts       Per-terminal poke message queue (500ms delay)

  renderer/                React app (renderer process)
    index.tsx              App root, IPC listeners, terminal creation
    store.ts               Zustand store — terminal metadata, sidebar state, scroll lock modes
    terminal-registry.ts   xterm.js Terminal instances in a Map (outside React)
    scroll-lock.ts         Follow/read lock modes via onWriteParsed/onScroll
    file-link-provider.ts  Clickable file paths in terminal output
    components/
      Terminal.tsx          Terminal container — DOM reparenting, resize observer, scroll lock border
      Sidebar.tsx           Agent cards, status dots, Cmd+K filter

  cli/
    nap.ts                 Standalone CLI — connects to socket, all commands

  shared/
    constants.ts           Socket path, discovery (walk-up), isSocketAlive
    ndjson.ts              Parser + serializer for newline-delimited JSON
    protocol.ts            TypeScript types for socket request/response protocol

  types/
    electron-api.d.ts      Window.electronAPI type declarations
```

## Build & Run

```bash
npm run dev              # electron-vite dev server, HMR
npm run build            # production build → out/
npm run build:cli        # CLI build → out/cli/
npm start                # build + launch electron
npm run typecheck        # tsc --noEmit
```

## Test

```bash
npm run test:small       # vitest
npm run test:medium      # build + playwright (headless)
npm run test:medium:headed  # playwright with visible windows
npm test                 # both
```

Test files in `tests/` organized by feature. Shared helpers in `tests/helpers.ts`.

## Stable App vs Dev

The user runs a stable build from `~/nap-app/` (cloned from this repo). They develop in this repo. Agents modify source here — the running app binary is untouched.

```bash
# Rebuild stable app after changes
cd ~/nap-app && git pull origin main && npm run build && npm run build:cli
```

## Key Files to Read First

1. `src/main/main.ts` — the hub, everything connects here
2. `src/renderer/store.ts` — the state model
3. `src/renderer/terminal-registry.ts` — how terminals are managed outside React
4. `src/cli/nap.ts` — the CLI, shows all socket commands
5. `src/shared/protocol.ts` — the socket protocol types
