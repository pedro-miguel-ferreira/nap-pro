# 001-fs-eng-fit-scroll — response

## What was done

Fixed `src/renderer/components/Terminal.tsx` — the ResizeObserver callback now preserves viewport scroll position across `fitAddon.fit()` calls.

Two lines added inside the debounced resize handler:
1. Save `entry.terminal.buffer.active.viewportY` before `fit()`
2. Restore with `entry.terminal.scrollToLine(scrollY)` after `fit()`

Terminal switch and first open paths left unchanged — jumping to bottom is correct behavior there.

## Verification

- `tsc --noEmit` — zero errors
- `vitest run` — all 63 tests pass (9 test files)

## Manual test instructions

1. Open a session and generate enough output to have scrollback (e.g. `seq 1 500`)
2. Scroll up to somewhere in the middle (e.g. around line 200)
3. Resize the window by dragging an edge — viewport should stay at the same scroll position
4. Toggle the sidebar — viewport should stay at the same scroll position
5. Verify that switching terminals still scrolls to bottom (unchanged behavior)
