# The Codebase

## Stack

- **Electron 33+** — macOS only for now
- **TypeScript** — strict mode, `tsc --noEmit` must pass
- **React 18 + Zustand** — renderer UI and state
- **xterm.js + Canvas addon** — terminal rendering (WebGL attempted but falls back to Canvas)
- **node-pty** — pty management (native module, needs electron-rebuild)
- **electron-vite** — build toolchain with HMR dev server
- **Vitest** — small tests (pure logic)
- **Playwright** — medium/big tests (real Electron app)

## Source Layout

```
src/
  main/                    Electron main process
    main.ts                Everything connects here: window, ptys, IPC, socket, menus
    preload.ts             IPC bridge (contextBridge)
    socket-server.ts       Unix socket server
    session-store.ts       In-memory session registry
    name-resolver.ts       Name lookup with fuzzy matching
    message-queue.ts       Per-terminal poke delivery (500ms delay)

  renderer/                React app
    index.tsx              App root, IPC listeners, terminal creation
    store.ts               Zustand — terminal metadata, sidebar state
    terminal-registry.ts   xterm.js instances in a Map (outside React)
    scroll-lock.ts         Follow/read lock via onWriteParsed/onScroll
    file-link-provider.ts  Clickable file paths
    components/
      Terminal.tsx          Container, DOM reparenting, resize, scroll lock border
      Sidebar.tsx           Agent cards, status dots, Cmd+K filter

  cli/
    nap.ts                 Standalone CLI (no electron deps)

  shared/
    constants.ts           Socket path, walk-up discovery
    ndjson.ts              Parser + serializer
    protocol.ts            Socket request/response types

  types/
    electron-api.d.ts      window.electronAPI declarations
```

## Build & Run

```bash
npm run dev              # electron-vite dev server, HMR for renderer
npm run build            # production build → out/
npm run build:cli        # CLI → out/cli/
npm start                # build + launch
npm run typecheck        # tsc --noEmit
```

## Test

```bash
npm run test:small       # vitest — pure logic
npm run test:medium      # playwright — real Electron (headless)
npm run test:medium:headed  # same but visible windows
npm test                 # both
```

Tests in `tests/` organized by feature. Shared helpers in `tests/helpers.ts`.

## Stable App vs Development

The human runs a stable build from `~/nap-app/` (a clone of this repo). Development happens in the working repo. Agents modify source here — the running app is untouched.

To update the stable app after changes:
```bash
cd ~/nap-app && git pull origin main && npm run build && npm run build:cli
```

## Where to Start Reading

1. `src/main/main.ts` — the hub, all connections visible
2. `src/renderer/store.ts` — the data model
3. `src/renderer/terminal-registry.ts` — how terminals live outside React
4. `src/cli/nap.ts` — the full CLI, shows all socket commands
5. `src/shared/protocol.ts` — the protocol types
