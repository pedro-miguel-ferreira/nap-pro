# Test Architect v2 — Response

## What changed

Rewrote all five `.test.md` files. Every test case now has:
- **Test size** (small / medium / big)
- **Concrete verification method** — specific `page.evaluate()` calls, buffer reads, store assertions, timing measurements
- **Manual flag** where no programmatic path exists, with explanation of why

## Decisions made from reading the code

- **xterm buffer is the primary assertion target.** `getTerminal(id).terminal.buffer.active.getLine(N).translateToString()` is how we verify data flow end-to-end. This works even for hidden terminals (xterm buffers internally without DOM).
- **Store assertions via `page.evaluate()`.** `useTerminalStore.getState()` gives us terminal metadata (status, parentId, activeTerminalId) directly — no need for DOM inspection.
- **`app.evaluate()` for main process assertions.** Pty pid, ptys Map membership, socket state — all verifiable from the main process side.
- **ResizeObserver debounce is 50ms** (Terminal.tsx:44), not 100ms as the original spec said. Tests account for this.
- **terminal-registry.ts holds Terminal instances outside React** — this is testable as a small Vitest test (T-0200-07) with mocked electronAPI.

## Test size breakdown

| Feature | Small | Medium | Big | Manual |
|---------|-------|--------|-----|--------|
| 0100 electron-single-terminal | 0 | 7 | 0 | 1 (native build) |
| 0200 multi-terminal-sidebar | 2 | 6 | 0 | 0 |
| 0300 socket-cli | 3 | 6 | 0 | 0 |
| 0400 poke-nap-done | 1 | 7 | 2 | 0 |
| 0500 integration-stress | 0 | 2 | 6 | 1 (addon-search) |
| **Total** | **6** | **28** | **8** | **2** |

## Confidence model

- **Small tests (6):** Protocol parsing, store ordering, CLI edge cases. Cheap, fast, deterministic. Vitest + jsdom.
- **Medium tests (28):** The core. Playwright + Electron driving real xterm, real IPC, real pty. Covers every seam: data flow, buffer persistence, resize propagation, socket protocol, status lifecycle. This is where ~70% of confidence comes from.
- **Big tests (8):** Full end-to-end chains. The integration script (T-0500-01), three-level parent-child (T-0500-02), 10-terminal stress (T-0500-03/04), full spawn-wait-receive loop (T-0400-04/10). Expensive but necessary — these catch the integration failures that per-component tests miss.
- **Manual tests (2):** Native module build (developer environment, can't automate meaningfully) and addon-search (UI visual feature, low priority per spec).

Small + medium tests cover ~80% of the confidence surface. Big tests fill the remaining gaps. Manual tests cover what's inherently un-automatable.
