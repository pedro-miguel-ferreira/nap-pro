# What Was Built in v1 (POC)

## Features Shipped

| Napkin | What | Status |
|--------|------|--------|
| 0100 | Electron + single terminal (xterm.js + WebGL + node-pty) | done |
| 0200 | Multi-terminal + sidebar (zustand store, DOM reparenting) | done |
| 0300 | Unix socket server + CLI (ndjson protocol, all commands) | done |
| 0400 | Poke, nap, done (agent-to-agent communication) | done |
| 0500 | Integration + stress tests (10 terminals, rapid switching) | done |
| 0600 | Polish (CLI help, per-project socket, file links, Cmd+K filter, nap open) | done |
| 0700 | Cmd+W to dismiss terminated cards | done |
| 0800 | Fix viewport scroll on resize | done |
| 0900 | nap open --name --command | done |
| 1000 | Scroll lock modes (follow + read) | partial — works but edge cases with ink |

## Key Architecture Decisions

- **Main process owns ptys, renderer owns xterm.** IPC bridge in preload. Context isolation enforced.
- **Zustand store holds metadata, terminal instances in a Map outside React.** React re-renders never touch xterm objects.
- **Terminal switching = DOM reparenting.** Detach xterm.element, reattach to container. WebGL survives.
- **Per-project socket at `.nap/sock`.** CLI walks up from cwd to find it, like git finds `.git/`.
- **ndjson protocol** over unix socket. Request-response with id matching.
- **electron-vite** for build with HMR in dev mode.
- **WebGL renderer** on all terminals. No transparency — WebGL can't do rgba backgrounds.
- **100k scrollback.** Enough for long architect sessions.

## CLI Commands

```
nap open [path] [--name] [--command]   Launch Nap.app
nap start <command> [--name] [--cwd]   Start agent session
nap ps [--json]                        List sessions (colored)
nap log <name>                         Dump scrollback to stdout
nap peek <name>                        Focus terminal in UI
nap poke <name> <message>              Send to agent's stdin
nap nap <name> [--timeout]             Wait for agent to finish
nap done [message]                     Signal completion
nap kill <name>                        Kill process, keep card
nap close <name>                       Kill + remove card
```

## Test Coverage

110+ tests across vitest (small) and playwright (medium/big). Covers: IPC bridge, pty lifecycle, terminal switching, socket protocol, CLI commands, poke delivery, done signaling, scroll lock, and more.
