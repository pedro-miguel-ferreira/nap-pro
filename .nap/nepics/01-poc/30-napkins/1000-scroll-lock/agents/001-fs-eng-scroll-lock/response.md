# Response: Scroll Lock Implementation

## What was built

Three scroll lock modes for the terminal viewport, toggled via Cmd+G, with visual frame borders.

### New file

**`src/renderer/scroll-lock.ts`** — Core module. Exports `ScrollLockMode` type (`'off' | 'follow' | 'read'`), `ScrollLockController` interface, and `setupScrollLock(terminal)` factory.

- **Follow lock**: `onWriteParsed` and `onScroll` both call `scrollToBottom()`. Sets `scrollOnUserInput = false` so keypresses don't yank the viewport. `scrollToBottom()` is synchronous (smoothScrollDuration=0) and fires before rendering — no flicker. The `onScroll` → `scrollToBottom()` chain terminates safely due to xterm's built-in re-entry guards (`_isHandlingScroll`, `_isSyncing`).

- **Read lock**: Captures `viewportY` on entry. `onWriteParsed` and `onScroll` both restore to `pinnedLine` with a `restoring` flag to prevent re-entry. Also sets `scrollOnUserInput = false`.

- **Off**: Restores `scrollOnUserInput = true`, listeners become no-ops.

### Modified files

**`src/renderer/terminal-registry.ts`**
- `TerminalEntry` now includes `scrollLock: ScrollLockController`
- `createTerminalInstance` calls `setupScrollLock(terminal)` at creation time
- `disposeTerminal` disposes scroll lock before terminal

**`src/renderer/store.ts`**
- Added `scrollLockModes: Record<string, ScrollLockMode>` to store state
- Added `setScrollLockMode(id, mode)` action — drives UI reactivity for border display

**`src/main/main.ts`**
- Added `CmdOrCtrl+G` menu item under Terminal submenu → sends `scroll-lock:toggle` to renderer

**`src/main/preload.ts`**
- Added `onToggleScrollLock(callback)` bridging `scroll-lock:toggle` IPC channel

**`src/types/electron-api.d.ts`**
- Added `onToggleScrollLock` to `ElectronAPI` interface

**`src/renderer/index.tsx`**
- Handles `onToggleScrollLock` with double-press detection:
  - off → follow (single press)
  - follow → read (second press within 500ms)
  - follow (after 500ms) or read → off
- Calls both `entry.scrollLock.setMode()` (xterm behavior) and `store.setScrollLockMode()` (UI)

**`src/renderer/components/Terminal.tsx`**
- Subscribes to `scrollLockModes[activeTerminalId]` from store
- Applies 2px border with `transition: border-color 0.15s ease`:
  - follow → dim blue bottom border (`#2a5a9a`)
  - read → dim amber left+right borders (`#8a6a2a`)
  - off → transparent

## Decisions made

1. **Listeners registered at terminal creation, not at open time.** xterm buffers writes before `open()` is called, and `onWriteParsed`/`onScroll` fire regardless. Registering early means scroll lock works even on buffered output.

2. **Both `onWriteParsed` and `onScroll` listeners.** `onWriteParsed` alone covers write-triggered scrolling, but a user mouse-wheel scroll during follow lock could cause a single-frame flash before the next write fires. The `onScroll` listener eliminates that gap. The chain is safe — xterm has re-entry guards that terminate the `scrollToBottom() → onScroll → scrollToBottom()` loop.

3. **Store tracks mode separately from scroll-lock module.** The scroll-lock module owns xterm behavior (listeners, option mutation). The Zustand store mirrors the mode for React UI rendering. This avoids coupling xterm internals into React state.

4. **`boxSizing: border-box` on terminal container.** The 2px border is always present (transparent when off), so toggling lock modes doesn't cause a resize/reflow — only `border-color` transitions.

5. **Double-press logic lives in the renderer toggle handler, not the scroll-lock module.** The module is a pure state machine (`setMode`/`getMode`). The gesture detection (timing, state transitions) is in the event handler where it belongs.

## Verification

- `tsc --noEmit` — zero errors
- `npx vitest run` — all 63 tests pass

## Manual test instructions

1. `npm run dev` to start the app
2. In a terminal, run something that produces continuous output: `while true; do date; sleep 0.1; done`
3. Scroll up to read old output — notice viewport gets pushed around as new lines arrive

**Follow lock:**
4. Press `Cmd+G` — dim blue bottom border appears, viewport snaps to bottom
5. Output keeps streaming — viewport stays pinned to bottom, no jumping
6. Try scrolling with mouse wheel — viewport immediately snaps back to bottom
7. Press `Cmd+G` again (after 500ms) — border disappears, back to normal scroll behavior

**Read lock:**
8. Scroll up a few screens
9. Press `Cmd+G` then immediately `Cmd+G` again (within 500ms) — amber left+right borders appear
10. Output continues streaming — viewport stays pinned to your scroll position
11. Try mouse wheel scrolling — viewport snaps back to pinned position
12. Press `Cmd+G` — borders disappear, normal scrolling restored

**Per-terminal state:**
13. Open a second terminal with `Cmd+T`
14. Set follow lock on terminal 1, leave terminal 2 normal
15. Switch between them — each terminal remembers its own lock mode and shows the correct border

**Edge cases:**
16. Toggle scroll lock on an idle terminal (no output) — should work, border appears/disappears
17. Toggle sidebar with `Cmd+B` while lock is active — terminal resizes, lock state preserved
