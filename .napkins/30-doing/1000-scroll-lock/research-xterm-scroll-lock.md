# Research: xterm.js Scroll Lock Modes

Goal: Build two scroll lock modes — **follow lock** (viewport pinned to bottom) and **read lock** (viewport pinned to a fixed line from top).

Source: cloned xtermjs/xterm.js to `/Users/dimaunk/dvl/aibanana/xterm.js/`

---

## xterm.js Scroll Architecture

### Buffer Properties

```
buffer.ybase  — how many lines have scrolled into scrollback
buffer.ydisp  — which line is at top of viewport (0 = top of scrollback)
buffer.y      — cursor row relative to ybase

Viewport at bottom: ydisp === ybase
User scrolled up:   ydisp < ybase
```

Public API:
- `terminal.buffer.active.viewportY` → ydisp
- `terminal.buffer.active.baseY` → ybase

### Write → Viewport Chain (traced through source)

```
terminal.write(data)                                         [browser/public/Terminal.ts:224]
  → CoreTerminal.write()                                     [common/CoreTerminal.ts:146]
    → WriteBuffer.write() → queues, then async:              [common/input/WriteBuffer.ts:135]
      → WriteBuffer._innerWrite()                            [common/input/WriteBuffer.ts:192]
        → InputHandler.parse(data)                           [common/InputHandler.ts]
          → on '\n' at scroll bottom:
            → BufferService.scroll()                         [common/services/BufferService.ts:67]
              → ybase++
              → if (!isUserScrolling) ydisp = ybase          [line 100-101, 120-121]
              → fires onScroll(ydisp)                        [line 124]
        → fires onWriteParsed                                [WriteBuffer.ts:277]
      → (next animation frame):
        → RenderService renders rows
        → Viewport._sync() called via onRender listener     [browser/Viewport.ts:112-117]
          → SmoothScrollableElement.setScrollDimensions()    [Viewport.ts:187-190]
          → setScrollPosition({ scrollTop: ydisp * cellH })  [Viewport.ts:196-198]
```

### `isUserScrolling` — The Only Built-in Scroll Lock

`BufferService.isUserScrolling: boolean` (line 23) — **internal, not in public API**.

Set in `BufferService.scrollLines()` (line 134-143):
```typescript
if (disp < 0) {
  this.isUserScrolling = true;        // scroll up = lock
} else if (disp + buffer.ydisp >= buffer.ybase) {
  this.isUserScrolling = false;       // scroll to bottom = unlock
}
```

Used in `BufferService.scroll()` (line 97-122):
```typescript
if (!willBufferBeTrimmed) {
  buffer.ybase++;
  if (!this.isUserScrolling) buffer.ydisp++;    // auto-follow
} else {
  if (this.isUserScrolling) buffer.ydisp = Math.max(buffer.ydisp - 1, 0);  // keep text stable
}
if (!this.isUserScrolling) buffer.ydisp = buffer.ybase;  // snap to bottom
```

### What Moves the Viewport?

Only two code paths change `ydisp`:

1. **`BufferService.scroll()`** — new line pushes into scrollback (line feed at bottom of scroll region when scrollTop === 0). Auto-scrolls to bottom unless `isUserScrolling`.

2. **`BufferService.scrollLines(disp)`** — explicit scroll from user scrollbar, API calls (`scrollToLine`, `scrollToBottom`), or keyboard.

**Cursor positioning escape sequences (CSI H, CSI A/B/C/D) do NOT change ydisp.** They only change `buffer.x` and `buffer.y`.

**CSI S (Scroll Up) and CSI T (Scroll Down)** — these directly splice `buffer.lines` within the scroll region (InputHandler.ts:1480-1504). They do NOT change `ydisp` or `ybase`. Content shifts in-place.

**Scroll regions (DECSTBM)** — when `scrollTop !== 0`, `BufferService.scroll()` does in-place line shifting (line 110-116), NOT ybase/ydisp changes.

### Viewport._sync() (browser/Viewport.ts:172-202)

```typescript
private _sync(ydisp = this._bufferService.buffer.ydisp): void {
  if (this._coreService.decPrivateModes.synchronizedOutput) {
    this._needsSyncOnRender = true;    // defer during DEC 2026 synchronized output
    return;
  }
  this._suppressOnScrollHandler = true;
  this._scrollableElement.setScrollDimensions({ ... });
  this._suppressOnScrollHandler = false;

  if (ydisp !== this._latestYDisp) {
    this._scrollableElement.setScrollPosition({
      scrollTop: ydisp * cellHeight
    });
  }
}
```

Key: `_sync` is called from `onScroll` listener (line 107) and from `onRender` after deferred sync (line 112-117).

### scrollToBottom() chain in browser (CoreBrowserTerminal.ts:717-723)

```typescript
public scrollToBottom(disableSmoothScroll?: boolean): void {
  if (disableSmoothScroll && this._viewport) {
    this._viewport.scrollToLine(this.buffer.ybase, true);  // bypasses smooth scroll
  } else {
    this.scrollLines(ybase - ydisp);  // goes through Viewport → SmoothScrollableElement
  }
}
```

`scrollLines` in browser (CoreBrowserTerminal.ts:699-707):
```typescript
public scrollLines(disp: number, suppressScrollEvent?: boolean): void {
  if (this._viewport) {
    this._viewport.scrollLines(disp);  // sets scroll position on SmoothScrollableElement
    // → triggers _handleScroll → onRequestScrollLines → BufferService.scrollLines
  } else {
    super.scrollLines(disp, suppressScrollEvent);
  }
  this.refresh(0, this.rows - 1);
}
```

With default `smoothScrollDuration: 0`, the entire chain is **synchronous**:
scrollToBottom → Viewport.scrollLines → setScrollPosition → _handleScroll → onRequestScrollLines → BufferService.scrollLines → isUserScrolling = false, ydisp = ybase

---

## Public API Available

### Events

| Event | Data | When | Source |
|-------|------|------|--------|
| `onScroll` | `number` (ydisp) | ydisp changes | BufferService.scroll/scrollLines |
| `onWriteParsed` | `void` | after write chunk parsed | WriteBuffer._innerWrite end |
| `onRender` | `{start, end}` | rows rendered to screen | RenderService (next anim frame) |

**`onWriteParsed` timing**: fires at end of `_innerWrite`, which runs synchronously within a macrotask. Fires once per time-slice (every ~12ms during large writes). Fires BEFORE rendering (rendering is next animation frame).

### Methods

```typescript
scrollToLine(line: number): void   // sets ydisp = line via scrollLines(line - ydisp)
scrollToBottom(): void             // scrollLines(ybase - ydisp)
scrollToTop(): void                // scrollLines(-ydisp)
scrollLines(amount: number): void  // relative scroll, goes through Viewport in browser
```

### Options

| Option | Default | Notes |
|--------|---------|-------|
| `scrollOnUserInput` | `true` | scroll to bottom on keypress |
| `scrollback` | 1000 | we use 100000 |
| `smoothScrollDuration` | 0 | 0 = instant (synchronous chain) |

**No `scrollOnWrite` option.** Proposed in #1824, never shipped.

---

## What Does NOT Exist

- No `scrollLock` or `freezeViewport` API
- No `scrollOnWrite` option
- No way to set `isUserScrolling` from public API
- No way to intercept viewport position changes before they happen

---

## Relevant GitHub Issues

- **#216 / PR #336** (v2.1): Output no longer auto-scrolls when user has scrolled up. Only keypress does.
- **#1824 / PR #4289** (v5.1): Added `scrollOnUserInput`. No `scrollOnWrite`.
- **#3201 / #3864** (v5.0): `onScroll` unified for both buffer and viewport scrolling.
- **PR #5453** (v6.0): Synchronized output (DEC 2026) — defers viewport sync during BSU/ESU.
- **PR #5390** (v6.0): Fix scrollbar teleport after exiting alt buffer — added `syncScrollPosition()`.

---

## Follow Lock Implementation

### Why it works without flicker

1. `onWriteParsed` fires after `InputHandler.parse()` completes but BEFORE rendering
2. Rendering happens on next animation frame via `RenderService`
3. `scrollToBottom()` is synchronous (smoothScrollDuration = 0)
4. It calls `BufferService.scrollLines()` which sets `isUserScrolling = false` and `ydisp = ybase`
5. When rendering finally happens, `Viewport._sync()` picks up the corrected `ydisp`
6. The viewport never visually appears at the wrong position

### When `scrollToBottom()` is a no-op

If already at bottom: `scrollLines(ybase - ydisp)` = `scrollLines(0)`. In `BufferService.scrollLines`: neither branch enters (0 is not < 0, 0 + ydisp may or may not >= ybase). Then `oldYdisp === buffer.ydisp` → returns early. Zero overhead.

### Code

```typescript
const disposable = terminal.onWriteParsed(() => {
  if (followLockEnabled) {
    terminal.scrollToBottom();
  }
});
```

That's it. No `onScroll` listener needed — `onWriteParsed` covers all write-triggered viewport changes. `scrollToBottom()` resets `isUserScrolling = false`, so subsequent writes auto-scroll via `BufferService.scroll()` naturally.

### Edge case: user mouse-wheel scrolls during follow lock

User scrolls up → `BufferService.scrollLines(-N)` → `isUserScrolling = true` → viewport moves up. Next write → `BufferService.scroll()` → `isUserScrolling` is true → doesn't auto-scroll. But then `onWriteParsed` fires → `scrollToBottom()` → scrolls back to bottom, `isUserScrolling = false`.

Net effect: viewport briefly shows the user's scroll position, then snaps back to bottom on next write parse (~12ms or less). This might cause a single-frame flash if the render happens to fire between the scroll event and the write parse.

**To prevent even that one frame**: also listen to `onScroll`:
```typescript
terminal.onScroll(() => {
  if (followLockEnabled) {
    terminal.scrollToBottom();
  }
});
```

But this creates an interesting loop: `scrollToBottom()` fires `onScroll`, which calls `scrollToBottom()` again. However, the second call is a no-op (already at bottom, `scrollLines(0)` returns early). So no infinite loop.

Actually, tracing more carefully: `scrollToBottom()` → `CoreBrowserTerminal.scrollLines(disp)` → `Viewport.scrollLines(disp)` → `SmoothScrollableElement.setScrollPosition()` → `Viewport._handleScroll()` → `_onRequestScrollLines.fire(diff)` → `BufferService.scrollLines(diff)` → fires `_onScroll` → `Viewport._sync()` → `setScrollPosition()` → `_handleScroll()`. But `_handleScroll` checks `this._isHandlingScroll` (line 208) to prevent re-entry. And `_sync` checks `this._isSyncing` (line 173). So the chain terminates. Safe.

---

## Read Lock Implementation

### Code

```typescript
let pinnedLine = terminal.buffer.active.viewportY;
let restoring = false;

const d1 = terminal.onWriteParsed(() => {
  if (!readLockEnabled || restoring) return;
  restoring = true;
  terminal.scrollToLine(pinnedLine);
  restoring = false;
});

const d2 = terminal.onScroll(() => {
  if (!readLockEnabled || restoring) return;
  restoring = true;
  terminal.scrollToLine(pinnedLine);
  restoring = false;
});
```

### Buffer trimming with 100k scrollback

When circular buffer is full, old lines are recycled. `ydisp` is absolute within the buffer. If pinned line gets recycled, the content at `pinnedLine` changes (now shows different content). With 100k scrollback this is unlikely to matter in practice — user would need 100k lines of new output before the pinned position is affected.

If needed, detect trimming: buffer trimming occurs when `willBufferBeTrimmed` in `BufferService.scroll()`. When trimmed and `isUserScrolling`, `ydisp` is decremented by 1 (line 107). We could track this in `onScroll` by comparing `viewportY` before/after — if it decreased without user action, trimming happened. Adjust `pinnedLine` accordingly.

---

## Current Nap Code Touchpoints

### terminal-registry.ts
- Creates terminals with `scrollback: 100000`
- FitAddon loaded, WebGL with canvas fallback
- No scroll event listeners

### Terminal.tsx — ResizeObserver
Already saves/restores `viewportY` across resize (same pattern as read lock):
```typescript
savedScrollY = entry.terminal.buffer.active.viewportY;
// ... after fit() ...
entry.terminal.scrollToLine(savedScrollY);
```

### index.tsx — PTY data routing
```typescript
window.electronAPI.pty.onData((id, data) => {
  entry.terminal.write(data);
});
```

### store.ts — Terminal state
Zustand store with `terminals[]` and `activeTerminalId`. Input wired via `terminal.onData()`.

---

## Recommended Implementation

### Where to add

New module `src/renderer/scroll-lock.ts`. Register listeners in `terminal-registry.ts` at terminal creation time. Store mode per terminal.

### API

```typescript
type ScrollLockMode = 'off' | 'follow' | 'read';

function setupScrollLock(terminal: Terminal): {
  setMode(mode: ScrollLockMode): void;
  getMode(): ScrollLockMode;
  dispose(): void;
};
```

### Skeleton

```typescript
import { Terminal } from '@xterm/xterm';

export type ScrollLockMode = 'off' | 'follow' | 'read';

export function setupScrollLock(terminal: Terminal) {
  let mode: ScrollLockMode = 'off';
  let pinnedLine = 0;
  let restoring = false;

  const d1 = terminal.onWriteParsed(() => {
    if (mode === 'follow') {
      terminal.scrollToBottom();
    } else if (mode === 'read' && !restoring) {
      restoring = true;
      terminal.scrollToLine(pinnedLine);
      restoring = false;
    }
  });

  const d2 = terminal.onScroll(() => {
    if (mode === 'follow') {
      terminal.scrollToBottom();
    } else if (mode === 'read' && !restoring) {
      restoring = true;
      terminal.scrollToLine(pinnedLine);
      restoring = false;
    }
  });

  return {
    setMode(newMode: ScrollLockMode) {
      mode = newMode;
      if (mode === 'follow') {
        terminal.scrollToBottom();
      } else if (mode === 'read') {
        pinnedLine = terminal.buffer.active.viewportY;
      }
    },
    getMode() { return mode; },
    dispose() { d1.dispose(); d2.dispose(); },
  };
}
```

### Open questions

1. Should follow lock suppress user scroll entirely (snap back immediately), or allow brief scroll then snap back on next write?
2. Should read lock allow user to scroll (breaking lock) or force-pin?
3. UI: keybinding? Status indicator? Which keys?
4. Do we need `scrollOnUserInput: false` when either lock is active to prevent keypress-triggered scroll-to-bottom?
