# 1000 Scroll Lock — Test Cases

## Subsystems involved

- `src/renderer/scroll-lock.ts` — state machine, xterm listeners, viewport control
- `src/renderer/terminal-registry.ts` — scroll lock lifecycle (create/dispose)
- `src/renderer/store.ts` — `scrollLockModes` state mirror for UI
- `src/renderer/index.tsx` — Cmd+G handler, double-press detection
- `src/renderer/components/Terminal.tsx` — border rendering from store state

---

## Small tests (Vitest)

### T1: State machine — mode transitions

**Flow**: Call `setMode()` in sequence: off → follow → read → off. Assert `getMode()` returns the correct value at each step.

**Why it breaks**: If `setMode` has side effects that clobber the mode variable (e.g., a listener callback resetting state), this catches it.

**Verification**: Create a mock Terminal (stub `scrollToBottom`, `scrollToLine`, `buffer.active.viewportY`, `onWriteParsed`, `onScroll`, `options`). Call `setMode('follow')`, assert `getMode() === 'follow'`. Repeat for `'read'` and `'off'`.

### T2: Follow lock — sets scrollOnUserInput to false

**Flow**: `setMode('follow')` → assert `terminal.options.scrollOnUserInput === false`.

**Why it breaks**: If `scrollOnUserInput` isn't toggled, keypresses will yank the viewport to bottom through xterm's built-in path, which conflicts with lock logic.

**Verification**: Mock terminal, call `setMode('follow')`, read `terminal.options.scrollOnUserInput`.

### T3: Read lock — captures viewportY on entry

**Flow**: Set `buffer.active.viewportY` to 42 on the mock, call `setMode('read')`, then fire the `onWriteParsed` callback. Assert `scrollToLine` was called with 42.

**Why it breaks**: If `pinnedLine` is captured at the wrong time (e.g., after the first write instead of at `setMode`), read lock pins to the wrong position.

**Verification**: Mock terminal with `viewportY = 42`. `setMode('read')`. Fire `onWriteParsed`. Assert `scrollToLine(42)`.

### T4: Off mode — restores scrollOnUserInput to true

**Flow**: `setMode('follow')` → `setMode('off')` → assert `scrollOnUserInput === true`.

**Verification**: Mock terminal, transition through modes, read option.

### T5: Follow lock — onWriteParsed calls scrollToBottom

**Flow**: `setMode('follow')`, fire the `onWriteParsed` callback. Assert `scrollToBottom()` was called.

**Why it breaks**: Listener condition check wrong (e.g., checking `mode !== 'off'` instead of `mode === 'follow'`).

**Verification**: Mock terminal, spy on `scrollToBottom`. Fire `onWriteParsed`. Assert call count.

### T6: Read lock — onScroll restores pinnedLine

**Flow**: Set `viewportY = 100`, `setMode('read')`, fire `onScroll`. Assert `scrollToLine(100)` called.

**Why it breaks**: `onScroll` listener might not have the `restoring` guard right, or might call `scrollToBottom` instead.

**Verification**: Mock terminal, spy on `scrollToLine`. Fire `onScroll`. Assert `scrollToLine(100)`.

### T7: Off mode — listeners are no-ops

**Flow**: `setMode('off')`, fire `onWriteParsed` and `onScroll`. Assert neither `scrollToBottom` nor `scrollToLine` was called.

**Verification**: Mock terminal, spy on both methods. Fire both events. Assert zero calls.

### T8: Dispose — cleans up listeners

**Flow**: Call `dispose()`, then fire `onWriteParsed` and `onScroll`. Assert no calls to scroll methods.

**Why it breaks**: If `dispose()` doesn't call `d1.dispose()` and `d2.dispose()`, listeners leak and fire on a potentially disposed terminal.

**Verification**: Mock terminal with disposable event stubs. Call `dispose()`. Verify the disposable's `dispose()` was called.

---

## Medium tests (Playwright + Electron)

These run in the real Electron app with real xterm.js. Use `page.evaluate()` to access `window.getTerminal(id)` and `window.useTerminalStore`.

### T9: Follow lock — viewport stays at bottom during continuous output

**Flow**:
1. Get active terminal id from store
2. Write 200 lines of output via pty (enough to overflow viewport)
3. `setMode('follow')` via `entry.scrollLock.setMode('follow')`
4. Write 100 more lines
5. Assert `viewportY === baseY`

**Why it breaks**: If `onWriteParsed` doesn't fire or `scrollToBottom()` has a race with rendering, `viewportY` drifts from `baseY`.

**Verification**:
```js
const atBottom = await page.evaluate(() => {
  const entry = window.getTerminal(window.useTerminalStore.getState().activeTerminalId);
  const buf = entry.terminal.buffer.active;
  return buf.viewportY === buf.baseY;
});
assert(atBottom);
```

### T10: Follow lock — scroll up is overridden by next write

**Flow**:
1. Activate follow lock
2. Write output to generate scrollback
3. Programmatically scroll up: `terminal.scrollLines(-10)`
4. Write one more line
5. Assert `viewportY === baseY`

**Why it breaks**: If `onScroll` or `onWriteParsed` doesn't fire after the programmatic scroll, viewport stays scrolled up.

**Verification**: `page.evaluate()` — scroll up, write, read `viewportY === baseY`.

### T11: Read lock — viewport pinned during output

**Flow**:
1. Write 200 lines to generate scrollback
2. Scroll up to line 50: `terminal.scrollToLine(50)`
3. `setMode('read')` — should capture `pinnedLine = 50`
4. Write 100 more lines
5. Assert `viewportY === 50`

**Why it breaks**: If `pinnedLine` drifts or `scrollToLine` doesn't counteract the write-triggered scroll.

**Verification**:
```js
const viewportY = await page.evaluate(() => {
  const entry = window.getTerminal(window.useTerminalStore.getState().activeTerminalId);
  return entry.terminal.buffer.active.viewportY;
});
assert(viewportY === 50);
```

### T12: Read lock — programmatic scroll is overridden

**Flow**:
1. Enter read lock at line 50
2. `terminal.scrollLines(20)` — attempt to scroll down
3. Assert `viewportY === 50` (restored by `onScroll` listener)

**Why it breaks**: If the `restoring` flag prevents the correction (e.g., flag not reset synchronously).

**Verification**: `page.evaluate()` — scroll, read `viewportY`.

### T13: Mode cycle via Cmd+G — off → follow → off

**Flow**:
1. Assert initial mode is `'off'`
2. Send `scroll-lock:toggle` IPC (simulates Cmd+G)
3. Assert mode is `'follow'`
4. Wait 600ms (past the 500ms double-press window)
5. Send `scroll-lock:toggle` again
6. Assert mode is `'off'`

**Why it breaks**: Double-press timing logic in index.tsx. If the 500ms check is inverted, single press goes to read instead of follow.

**Verification**: `page.evaluate()` to read `entry.scrollLock.getMode()` after each toggle.

### T14: Double-press Cmd+G — off → follow → read

**Flow**:
1. Send `scroll-lock:toggle` IPC
2. Immediately send `scroll-lock:toggle` again (within 500ms)
3. Assert mode is `'read'`

**Why it breaks**: If `lastToggleTime` isn't updated on the first press, or if the time comparison uses `>=` instead of `<`.

**Verification**: `page.evaluate()` to read mode.

### T15: Store mirrors scroll-lock module state

**Flow**:
1. Toggle scroll lock to follow
2. Assert `useTerminalStore.getState().scrollLockModes[id] === 'follow'`
3. Toggle to off
4. Assert store value is `'off'`

**Why it breaks**: If `store.setScrollLockMode()` is called with the wrong mode or not called at all, the UI border won't match the actual lock state.

**Verification**: `page.evaluate()` to read store state.

### T16: Per-terminal isolation

**Flow**:
1. Create terminal A, activate follow lock
2. Create terminal B (new Cmd+T), leave at off
3. Assert A's mode is `'follow'`, B's mode is `'off'`
4. Switch back to A — assert still `'follow'`

**Why it breaks**: If scroll lock state is global instead of per-terminal. The `setupScrollLock` closure captures per-instance state, but the store's `scrollLockModes` record could have key collisions.

**Verification**: `page.evaluate()` — read mode from both terminal entries.

### T17: Resize during follow lock — lock survives

**Flow**:
1. Activate follow lock
2. Write output to generate scrollback
3. Trigger resize (e.g., toggle sidebar via `toggleSidebar()`)
4. Write more output
5. Assert `viewportY === baseY`

**Why it breaks**: ResizeObserver in Terminal.tsx calls `fitAddon.fit()` and `scrollToLine(savedScrollY)`. If this interferes with follow lock (e.g., scrolls to a saved position instead of bottom), follow lock is broken after resize.

**Verification**: `page.evaluate()` — toggle sidebar, write, assert at bottom.

### T18: Resize during read lock — pinned position preserved

**Flow**:
1. Scroll to line 50, activate read lock
2. Toggle sidebar (triggers resize)
3. Write output
4. Assert `viewportY === 50`

**Why it breaks**: The ResizeObserver saves/restores `viewportY` which could interfere with `pinnedLine`. The read lock's `onWriteParsed` fires after fit, but if the saved position in ResizeObserver is different from `pinnedLine`, they fight.

**Verification**: `page.evaluate()` — toggle sidebar, write, check `viewportY`.

### T19: Follow lock — scrollOnUserInput restored on mode off

**Flow**:
1. `setMode('follow')` — `scrollOnUserInput` becomes false
2. `setMode('off')` — should restore to true
3. Type a character into the terminal
4. Assert viewport scrolls to bottom (default xterm behavior with `scrollOnUserInput = true`)

**Why it breaks**: If `scrollOnUserInput` isn't restored, user input no longer auto-scrolls to bottom in normal mode.

**Verification**: `page.evaluate()` — check `terminal.options.scrollOnUserInput === true` after mode off.

### T20: Follow lock — no flicker on rapid writes

**Flow**:
1. Activate follow lock
2. Burst-write 1000 lines in a tight loop (simulating heavy agent output)
3. After all writes complete, assert `viewportY === baseY`
4. At no intermediate point should `viewportY < baseY` (check by sampling during writes)

**Why it breaks**: If `onWriteParsed` batching causes a gap where the viewport isn't at bottom between write chunks.

**Verification**: `page.evaluate()` with a write loop and periodic `viewportY` sampling. All samples should equal `baseY`.

---

## Manual / UI tests (not automatable)

### M1: Visual border — follow lock shows blue bottom border

Toggle to follow lock. Verify a dim blue (#2a5a9a) 2px bottom border appears on the terminal container. Verify smooth transition (0.15s ease).

### M2: Visual border — read lock shows amber side borders

Double-press to read lock. Verify dim amber (#8a6a2a) 2px left+right borders appear. Bottom and top should be transparent.

### M3: Visual border — off mode has no visible border

Toggle back to off. Verify border disappears with smooth transition.

### M4: No layout shift on border toggle

Verify terminal content doesn't jump or reflow when toggling borders. The 2px border is always present (transparent when off) with `box-sizing: border-box`, so no size change should occur.

---

## Edge cases to be aware of (not full test cases)

- **Buffer trimming**: With 100k scrollback, if >100k lines are written during read lock, `pinnedLine` may point to recycled content. Unlikely in practice. Not worth testing now — document as known limitation.
- **Alt buffer**: Programs like vim switch to the alternate buffer. Scroll lock listeners fire on the active buffer. If the user enters read lock, launches vim (alt buffer), then exits vim (back to normal buffer), `pinnedLine` refers to the normal buffer's position, which should still be valid. Low risk.
- **Rapid mode cycling**: Pressing Cmd+G many times quickly. The state machine is synchronous, so each press processes completely before the next. No race condition possible.
