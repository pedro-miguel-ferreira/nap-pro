# What Was Built (v1 POC)

The POC proved the concept: an Electron app that manages AI agent terminals, with agents communicating via poke/nap/done. We built it using its own workflow — napkins first, then agents unfold them — and halfway through, we started using NAP itself to build NAP.

## Features

| # | Feature | What it proved |
|---|---------|---------------|
| 0100 | Electron + single terminal | xterm.js + WebGL + node-pty work together, IPC bridge is solid |
| 0200 | Multi-terminal + sidebar | DOM reparenting for instant switching, zustand store, background pty output buffering |
| 0300 | Socket server + CLI | Unix socket with ndjson, all commands work, <50ms round-trip |
| 0400 | Poke, nap, done | Agent-to-agent communication, message queuing, status lifecycle |
| 0500 | Integration + stress | 10 terminals, rapid switching, no WebGL context loss, memory bounded |
| 0600 | Polish | CLI help, per-project socket, clickable file paths, Cmd+K filter, `nap open` |
| 0700 | Cmd+W close | Dismiss terminated sessions from sidebar |
| 0800 | Fit scroll fix | Viewport position preserved on resize |
| 0900 | nap open --name | First terminal gets a custom name |
| 1000 | Scroll lock | Follow + read lock modes (partial — edge cases with Claude Code's ink rendering) |

## Architecture

- **Electron** with context isolation. Main process owns ptys and socket server. Renderer owns xterm.js terminals and React UI.
- **IPC bridge** via preload script. Pty data flows: `pty.onData → IPC → xterm.write` (output) and `xterm.onData → IPC → pty.write` (input).
- **Zustand store** holds terminal metadata (id, name, status, parentId). Terminal instances (xterm.js) live in a Map outside React — React re-renders never touch them.
- **Terminal switching** = DOM reparenting. Detach xterm.element, reattach to container. WebGL addon survives. No re-rendering, no buffer replay.
- **Per-project socket** at `.nap/sock`. CLI walks up from cwd to find it, like git finds `.git/`.
- **ndjson protocol** over unix socket. Request-response with id matching.
- **100k line scrollback.** WebGL renderer for performance.
- **electron-vite** for build with HMR in dev.

## CLI

```
nap open [path] [--name] [--command]   Launch Nap.app
nap start <command> [--name] [--cwd]   Start agent session
nap ps [--json]                        List sessions (colored status dots)
nap log <name>                         Dump scrollback to stdout
nap peek <name>                        Focus terminal in UI
nap poke <name> <message>              Send to agent's stdin
nap nap <name> [--timeout]             Wait for completion
nap done [message]                     Signal done (from inside agent)
nap kill <name>                        Kill process, keep card
nap close <name>                       Kill + remove card
```

## Tests

110+ tests. Small tests (vitest) for pure logic. Medium tests (playwright + electron) for integration — real app driven via `page.evaluate()` and `app.evaluate()`, no UI automation. Tests found real bugs: pty shutdown race condition, socket cleanup deleting wrong instance's socket, status overwrite on pty exit, second-instance segfault.

## The Bootstrapping Moment

Halfway through the POC, we started using NAP to build NAP. The architect ran `nap start` to launch agents, `nap nap` to wait, read responses, committed. Feature 0700 (Cmd+W close) was the first feature built entirely from inside NAP — napkin, agent spawn, wait, review, test, commit. The tool built itself.
