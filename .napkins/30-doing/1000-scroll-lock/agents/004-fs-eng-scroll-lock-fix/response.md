# 004 — Scroll Lock Fix Response

## What was fixed

### Bug 1: Border not visible + wrong sides

**Root cause (visibility)**: The border was on the same div that xterm renders into. xterm's DOM (canvas, screen elements) sat on top of the border, leaving only a pixel visible at the corner.

**Fix**: Split into two divs in `Terminal.tsx` — outer div owns the border, inner div (with `flex: 1`) is the xterm container. xterm's DOM can't cover the outer div's border.

**Root cause (wrong sides)**: Read lock CSS was `'#8a6a2a transparent'` (top+bottom amber). Napkin spec says left+right.

**Fix**: Changed to `'transparent #8a6a2a'` (left+right amber).

### Bug 1b: First Cmd+G scrolls to bottom during double-press

**Root cause**: The toggle handler immediately called `setMode('follow')` on the first press, which calls `scrollToBottom()`. When double-pressing to reach read lock, the first press yanked the viewport to bottom, and the second press captured that bottom position instead of where the user was reading.

**Fix**: Rewrote the toggle handler in `index.tsx` with a pending timer approach:
- First press: saves `viewportY`, shows blue border (store update only), starts 500ms timer. The scroll-lock module stays in `'off'` mode — no scrolling happens.
- Second press within 500ms: cancels timer, enters read lock with the saved viewport position.
- Timer fires without second press: commits to follow lock (calls `setMode('follow')`, which scrolls to bottom).
- From follow or read: any press goes to off.

The `setMode` interface now accepts an optional `pinnedY` parameter so the toggle handler can pass the pre-toggle position to read lock.

### Bug 2: Read lock blocks mouse/trackpad scrolling

**Root cause**: The `onScroll` handler called `scrollToLine(pinnedLine)` on ALL scroll events — including user mouse/trackpad scrolls. Made it impossible to scroll while in read lock.

**Fix**: Implemented the `queueMicrotask` pattern from the research doc to distinguish write-triggered scrolls from user scrolls:

- **`onWriteParsed`** (read mode): Sets `writeJustParsed = true`, queues microtask to reset it, then restores `lockedY` via `scrollToLine`. This undoes write-triggered viewport movement.
- **`onScroll`** (read mode): Queues a microtask that checks `writeJustParsed`. If false (user scroll), updates `lockedY` to the current position — the user can scroll freely and the new position becomes the pinned position.

The seam: write scrolls always have `onWriteParsed` fire in the same macrotask (setting `writeJustParsed`). User scrolls don't. The microtask runs after the macrotask, so by then `writeJustParsed` is a reliable discriminator.

## Files changed

| File | What |
|------|------|
| `src/renderer/scroll-lock.ts` | queueMicrotask pattern, optional `pinnedY` param |
| `src/renderer/components/Terminal.tsx` | wrapper div for border, fix read lock border sides |
| `src/renderer/index.tsx` | pending timer for double-press, cleanup |
| `tests/scroll-lock/scroll-lock.test.ts` | T6 updated for new onScroll behavior |
| `tests/scroll-lock/scroll-lock.spec.ts` | T12 updated, `getScrollLockMode` reads from store |

## Test results

- `tsc --noEmit`: clean
- Unit tests (T1–T8): 9/9 passing
- T6 rewritten: verifies user scroll updates `lockedY` (not overridden)
- T12 rewritten: verifies non-write scroll is allowed and updates locked position

## Manual test instructions

### Border visibility
1. Open nap, press Cmd+G — blue 2px bottom border should appear on terminal
2. Press Cmd+G again quickly — amber 2px left+right borders should appear
3. Press Cmd+G — borders disappear with smooth transition
4. Verify no layout shift (terminal content doesn't jump)

### Double-press doesn't scroll
1. Write enough output to create scrollback: `seq 1 500`
2. Scroll up to some line in the middle
3. Note the line you're looking at
4. Double-press Cmd+G quickly
5. Viewport should NOT move — you should still see the same line
6. Border should go blue then amber (follow → read)
7. New output (e.g., another terminal writes) should not move viewport

### Single press follow lock (delayed)
1. Scroll up in terminal
2. Single press Cmd+G
3. Blue border appears but viewport stays put for ~500ms
4. After 500ms, viewport scrolls to bottom (follow committed)
5. New output keeps viewport at bottom

### Read lock allows mouse scroll
1. Enter read lock (double Cmd+G)
2. Use mouse wheel / trackpad to scroll up and down
3. Scrolling should work freely
4. New output should NOT move viewport — it stays where you scrolled to
5. Press Cmd+G to exit read lock
