# Test Architect — POC Response

## What I produced

Five `.test.md` files, 44 test cases total:

| File | Tests | Focus |
|---|---|---|
| 0100-electron-single-terminal.test.md | 8 | IPC bridge (both directions), resize propagation, pty lifecycle, high-throughput output, WebGL init, native module build |
| 0200-multi-terminal-sidebar.test.md | 8 | DOM reparent + scrollback preservation, WebGL detach/reattach survival, background buffering, rapid switch races, sidebar toggle resize |
| 0300-socket-cli.test.md | 9 | Round-trip latency, ndjson split/concat framing, stale socket detection, dual-instance guard, NAP_SESSION_ID chain, name resolution edge cases, cleanup on all signal types |
| 0400-poke-nap-done.test.md | 10 | Poke stdin delivery + newline, queue ordering with delay, dead-terminal guard, nap polling + unblock, already-done fast path, timeout without kill, done triple-effect (status + poke + store), idempotent done, full spawn-wait-receive loop |
| 0500-integration-stress.test.md | 9 | Full CLI sequence unattended, 3-level parent-child chain, 10 concurrent high-output terminals, rapid switch under load, WebGL context limits, memory bounds, multi-agent poke contention, test idempotency |

## Where the seams are

The three most dangerous seams in this POC:

1. **IPC bridge under load** (0100↔0200↔0500) — 10 ptys dumping data through Electron's IPC to 10 xterm instances. The main process is single-threaded. This is where the "doesn't melt" claim gets tested.

2. **WebGL + DOM reparenting** (0200↔0500) — detaching a canvas with a live WebGL context from the DOM and reattaching it is the kind of thing that "works in the demo, breaks in production." Context-lost events are the canary.

3. **The done→poke→nap polling chain** (0300↔0400) — three async systems (status write, poke delivery, CLI poll) must converge correctly. The timing between done signal and poll pickup is the most fragile handoff in the system.

## What I didn't test

Per the role's philosophy:
- No unit tests for obvious things (zustand store getters, JSON parsing)
- No happy-path-only tests (app launches and shows a terminal — if that doesn't work, nothing works)
- No implementation-detail tests that break on refactor (internal state shape, component props)
