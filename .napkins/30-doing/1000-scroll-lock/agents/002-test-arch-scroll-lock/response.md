# Response: Scroll Lock Test Architecture

## Summary

Wrote 20 programmatic test cases + 4 manual UI tests to `1000-scroll-lock.test.md`.

## Test breakdown

- **8 small tests** (Vitest + mock Terminal) — state machine transitions, `scrollOnUserInput` toggling, listener behavior per mode, dispose cleanup. Pure logic, no Electron.
- **12 medium tests** (Playwright + Electron, `page.evaluate()`) — the real value. Exercises real xterm.js buffers: follow lock stays at bottom during writes, read lock pins `viewportY`, mode cycling via IPC (single-press and double-press), store ↔ module sync, per-terminal isolation, resize interactions, `scrollOnUserInput` restoration, and rapid-write burst stability.
- **4 manual tests** — border colors, transitions, no layout shift. CSS-only, not worth automating.

## Key seams tested

1. **scroll-lock module ↔ xterm.js** — Do `onWriteParsed`/`onScroll` listeners actually keep `viewportY` correct? (T9–T12, T20)
2. **Double-press timing** — Does the 500ms window in index.tsx correctly distinguish single vs double Cmd+G? (T13–T14)
3. **Store ↔ module** — Does the Zustand mirror stay in sync with the scroll-lock module? (T15)
4. **Per-terminal isolation** — Does each terminal maintain independent lock state? (T16)
5. **Resize ↔ lock** — Does the ResizeObserver's save/restore fight with scroll lock? (T17–T18)

## What I didn't test (and why)

- **Buffer trimming at 100k lines** — Would need writing 100k+ lines in a test, slow and the scenario is rare. Documented as known limitation.
- **Alt buffer interaction** — Low risk, `pinnedLine` refers to normal buffer which remains valid after alt buffer exit.
- **WebGL context loss during lock** — Orthogonal to scroll lock; renderer fallback is tested elsewhere.
