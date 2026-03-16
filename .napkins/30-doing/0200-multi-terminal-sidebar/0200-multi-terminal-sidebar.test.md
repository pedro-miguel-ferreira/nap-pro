* multi-terminal + sidebar — test cases (v2)

* T-0200-01: terminal switching preserves scrollback and buffer state
  * size: medium (Playwright + Electron)
  * flow: create terminals A and B → A has 5000 lines → switch A→B→A → A's buffer intact
  * subsystems: xterm.js DOM reparenting (Terminal.tsx:18-30), terminal buffer, addon-fit
  * verification: automatable
    * create terminal A, write `seq 1 5000\n` to its pty, wait for output to settle
    * read A's buffer length: `page.evaluate(() => getTerminal('term-1').terminal.buffer.active.length)`
    * record a specific line: `getTerminal('term-1').terminal.buffer.active.getLine(50).translateToString()`
    * create terminal B (becomes active)
    * switch back to A: `page.evaluate(() => useTerminalStore.getState().setActive('term-1'))`
    * read A's buffer length again — assert same as before
    * read same line — assert content matches
    * note: scroll position (viewport offset) may reset to bottom on reparent — this is a known xterm.js behavior, not a bug unless spec requires preservation
  * likely to break: DOM reparenting triggers xterm re-render from bottom, losing viewport position

* T-0200-02: WebGL survives DOM detach/reattach cycle
  * size: medium (Playwright + Electron)
  * flow: terminal A active → switch to B → A detached from DOM → switch back to A → A reattached
  * subsystems: addon-webgl, WebGL canvas context, DOM lifecycle
  * verification: automatable
    * set up webglcontextlost listener before switch:
      * `page.evaluate(() => { window._contextLost = false; getTerminal('term-1').terminal.element?.querySelector('canvas')?.addEventListener('webglcontextlost', () => { window._contextLost = true; }); })`
    * switch to B, then back to A
    * assert: `page.evaluate(() => window._contextLost) === false`
    * also: write text to A's pty after reattach, verify it appears in buffer (rendering works)
    * if context IS lost: terminal-registry.ts:50-53 handles fallback to CanvasAddon — verify fallback fires
  * likely to break: removing canvas from DOM triggers webglcontextlost — need dispose/re-init strategy

* T-0200-03: background terminal receives output while hidden
  * size: medium (Playwright + Electron)
  * flow: terminal B hidden → B's pty produces output → xterm.write() fills buffer → switch to B → output is there
  * subsystems: node-pty, xterm.js internal buffer, IPC bridge
  * verification: automatable
    * create terminal A (active) and terminal B
    * write `seq 1 100\n` to B's pty while A is active
    * wait 2s for output to flow
    * read B's buffer WITHOUT switching to it:
      * `page.evaluate(() => getTerminal('term-2').terminal.buffer.active.getLine(N).translateToString())`
    * assert line contains expected number
    * this works because xterm.write() buffers internally without DOM — terminal-registry.ts:33 note confirms this
  * likely to break: xterm.write() drops data when terminal's DOM element is detached — spec says it buffers internally, but edge cases exist with WebGL renderer

* T-0200-04: rapid switching doesn't corrupt state or leak
  * size: medium (Playwright + Electron)
  * flow: switch A→B→C→A→B→C→A rapidly, each time checking active terminal shows correct content
  * subsystems: zustand store, DOM reparenting (Terminal.tsx), fitAddon
  * verification: automatable
    * create 3 terminals, write unique marker to each pty: `echo MARKER_A`, `echo MARKER_B`, `echo MARKER_C`
    * rapid fire setActive calls:
      * `page.evaluate(() => { const s = useTerminalStore.getState(); s.setActive('term-2'); s.setActive('term-3'); s.setActive('term-1'); s.setActive('term-2'); s.setActive('term-3'); })`
    * after settling, assert activeTerminalId matches last set
    * read active terminal's buffer — assert it contains the correct marker (MARKER_C, not MARKER_A)
    * check no errors in console: `page.on('console', ...)` for error-level messages
  * likely to break: DOM manipulation from switch N overlaps with switch N+1 — Terminal.tsx useEffect fires for each activeTerminalId change, React batches may race

* T-0200-05: sidebar Cmd+B toggle resizes terminal correctly
  * size: medium (Playwright + Electron)
  * flow: Cmd+B → sidebar hides → flex layout changes → ResizeObserver fires → fitAddon.fit() → pty.resize()
  * subsystems: sidebar visibility, CSS flex, ResizeObserver (Terminal.tsx:42-52), addon-fit, node-pty
  * verification: automatable
    * read initial cols: `page.evaluate(() => getTerminal(id).terminal.cols)` — with 250px sidebar at 800px window
    * toggle sidebar: `page.evaluate(() => useTerminalStore.getState().toggleSidebar())`
    * wait 150ms (ResizeObserver + 50ms debounce)
    * read new cols: `page.evaluate(() => getTerminal(id).terminal.cols)`
    * assert new cols > old cols (sidebar freed ~250px worth of columns)
    * toggle back, assert cols return to original
  * likely to break: ResizeObserver (Terminal.tsx:42) doesn't fire on flex layout change — the container width changes via CSS but ResizeObserver might not detect it if the container itself isn't the flex child

* T-0200-06: terminal exit updates sidebar card but doesn't remove it
  * size: medium (Playwright + Electron)
  * flow: terminal B's process exits → IPC `pty:exit` → store.setStatus(id, 'exited') → sidebar re-renders with gray dot
  * subsystems: pty lifecycle, zustand store, Sidebar component
  * verification: automatable
    * create terminal B, run a command that exits: write `exit\n` to B's pty
    * wait for status change: poll `page.evaluate(() => useTerminalStore.getState().terminals.find(t => t.id === 'term-2')?.status)`
    * assert status === 'exited'
    * assert terminal still in store: `terminals.length` unchanged
    * assert B's buffer still readable: `getTerminal('term-2').terminal.buffer.active.length > 0`
    * assert card still in DOM: `page.evaluate(() => document.querySelectorAll('[style*="borderRadius"]').length)` — count status dots (fragile, but works)
  * likely to break: removeTerminal called instead of setStatus — store.ts:60-70 removes terminal and disposes xterm

* T-0200-07: terminal objects live outside React render cycle
  * size: small (Vitest)
  * flow: zustand store updates → React re-renders → Terminal instances in registry are untouched
  * subsystems: zustand store (store.ts), terminal-registry.ts Map
  * verification: automatable
    * this tests the architecture decision: store holds metadata, registry holds Terminal instances
    * import `useTerminalStore` and `getTerminal` in Vitest (with mocked electronAPI)
    * call `createTerminal('test')` — verify `getTerminal('term-1')` returns a Terminal instance
    * call `setStatus('term-1', 'done')` — store state changes
    * verify `getTerminal('term-1')` still returns the SAME Terminal instance (referential equality)
    * verify `getTerminal('term-1').terminal.buffer` is not reset
    * note: requires mocking `window.electronAPI` in Vitest — the store calls `electronAPI.pty.create` in createTerminal (store.ts:43-45)
  * likely to break: if someone moves Terminal instances into zustand state, store updates clone/recreate them

* T-0200-08: sidebar card ordering matches creation order
  * size: small (Vitest)
  * flow: create terminals in sequence → store.terminals array preserves insertion order
  * subsystems: zustand store (store.ts:49-54)
  * verification: automatable
    * mock `window.electronAPI` and `createTerminalInstance`
    * call `createTerminal('first')`, `createTerminal('second')`, `createTerminal('third')`
    * read `useTerminalStore.getState().terminals.map(t => t.name)`
    * assert: `['first', 'second', 'third']` — insertion order preserved
    * delete middle terminal, assert remaining order is `['first', 'third']`
  * likely to break: sorting by name or id instead of array insertion order
