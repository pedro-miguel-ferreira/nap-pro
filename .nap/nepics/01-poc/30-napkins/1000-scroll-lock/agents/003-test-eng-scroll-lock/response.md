# 003 Test Engineer — Scroll Lock — Response

## Results

**All 21 tests pass (9 small + 12 medium). Zero failures.**

### Small tests (Vitest) — `tests/scroll-lock/scroll-lock.test.ts`

| Test | Status |
|------|--------|
| T1: State machine — off → follow → read → off | PASS |
| T2: Follow lock — sets scrollOnUserInput to false | PASS |
| T3: Read lock — captures viewportY on entry | PASS |
| T4: Off mode — restores scrollOnUserInput to true | PASS |
| T5: Follow lock — onWriteParsed calls scrollToBottom | PASS |
| T6: Read lock — onScroll restores pinnedLine | PASS |
| T7: Off mode — listeners are no-ops | PASS |
| T8: Dispose — cleans up listeners (2 sub-tests) | PASS |

Small tests run against a mock Terminal (stubs for `scrollToBottom`, `scrollToLine`, `onWriteParsed`, `onScroll`, `buffer.active.viewportY`, `options`). No jsdom or real xterm needed.

### Medium tests (Playwright + Electron) — `tests/scroll-lock/scroll-lock.spec.ts`

| Test | Status |
|------|--------|
| T9: Follow lock — viewport stays at bottom during output | PASS |
| T10: Follow lock — scroll up overridden by next write | PASS |
| T11: Read lock — viewport pinned during output | PASS |
| T12: Read lock — programmatic scroll overridden | PASS |
| T13: Cmd+G cycle — off → follow → off (single press) | PASS |
| T14: Cmd+G double-press — off → follow → read | PASS |
| T15: Store mirrors scroll lock mode | PASS |
| T16: Per-terminal isolation | PASS |
| T17: Follow lock survives resize | PASS |
| T18: Read lock survives resize | PASS |
| T19: scrollOnUserInput restored on mode off | PASS |
| T20: Follow lock — no flicker on burst writes | PASS |

Medium tests launch real Electron app, use `page.evaluate()` to drive behavior through store actions and scroll lock API directly. IPC toggle tests (T13/T14) use `webContents.send('scroll-lock:toggle')` to simulate Cmd+G.

### Manual tests (skipped per role)

- M1: Visual border — follow lock blue bottom border
- M2: Visual border — read lock amber side borders
- M3: Visual border — off mode no border
- M4: No layout shift on border toggle

## Notes

- `npm run build` required before medium tests — Playwright runs against `out/`, not source. First run failed because the built app didn't include scroll lock changes.
- T20 (burst writes) uses `seq 1 1000` through the real pty. Viewport stays pinned at bottom throughout — no flicker detected in the final assertion.
- T18 (resize during read lock) exercises the interaction between the ResizeObserver's saved/restored viewportY and the read lock's pinnedLine. The read lock's `onWriteParsed` fires after the resize observer's `scrollToLine(savedScrollY)`, which means the pinned position wins. No conflict observed.

## Type check

`tsc --noEmit -p tests/tsconfig.json` — zero errors in the new test files (pre-existing errors in `tests/electron/terminal.spec.ts` related to nullable `getActiveId` return type are unrelated).
