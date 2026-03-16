* multi-terminal + sidebar — test cases

* T-0200-01: terminal switching preserves scrollback and buffer state
  * flow: user on terminal A → click card B → detach A's DOM → attach B's DOM → fitAddon.fit()
  * subsystems: xterm.js DOM reparenting, terminal buffer, addon-fit
  * setup: terminal A has 5000 lines of output, terminal B has a running shell
  * action: switch A→B→A
  * expected: A's scrollback is exactly where it was — same scroll position, same content, same cursor
  * likely to break: DOM reparenting resets scroll position to bottom
    * xterm.js Terminal holds the buffer, but viewport scroll offset lives in the DOM
    * on reattach, xterm might re-render from the bottom
    * user was reading line 2000, now they're at line 5000 — disorienting

* T-0200-02: WebGL survives DOM detach/reattach cycle
  * flow: terminal A active (WebGL rendering) → switch to B → A's element detached from DOM → switch back to A → A reattached
  * subsystems: addon-webgl, WebGL canvas context, DOM lifecycle
  * action: switch away from terminal, switch back
  * expected: WebGL renders immediately — no black flash, no "context lost", no re-initialization
  * likely to break: WebGL context is tied to the canvas being in the DOM
    * removing canvas from DOM may trigger webglcontextlost event
    * if so: need dispose/re-init strategy on each switch (the backup plan from spec)
    * measure: if re-init is needed, how long does it take? >16ms = visible flash

* T-0200-03: background terminal receives output while hidden
  * flow: terminal B is hidden, B's pty produces output → pty.onData → xterm.write() → buffer fills
  * subsystems: node-pty, xterm.js internal buffer (no DOM needed)
  * setup: terminal B runs `ping localhost` (continuous output)
  * action: stay on terminal A for 10 seconds, then switch to B
  * expected: all 10 seconds of ping output is there, no gaps, timestamps are continuous
  * likely to break: xterm.write() might silently drop data when terminal is not in DOM
    * xterm.js docs say it buffers internally — but does it really when there's no renderer?
    * also: if someone adds a "pause writes to hidden terminals" optimization, this breaks

* T-0200-04: rapid switching doesn't corrupt state or leak memory
  * flow: click card A → B → C → A → B → C → A (rapid fire, <100ms between clicks)
  * subsystems: zustand store, DOM manipulation, fitAddon.fit()
  * setup: 5 terminals with active output
  * action: click through all cards rapidly for 10 seconds
  * expected: each switch shows the correct terminal, no terminal shows another's content, no crash
  * likely to break: race condition in setActive() — DOM manipulation from switch N overlaps with switch N+1
    * detach old, attach new, fit — if a second switch fires during fit(), you're fitting the wrong terminal
    * zustand store update is sync, but DOM operations and fit() may not be
    * also: fit() triggers resize IPC to pty — rapid switches could spam pty with resize signals

* T-0200-05: sidebar Cmd+B toggle resizes terminal correctly
  * flow: Cmd+B → sidebar hides → terminal panel width changes → fitAddon.fit() → pty.resize()
  * subsystems: sidebar visibility, CSS flex layout, addon-fit, node-pty
  * action: toggle sidebar collapse/expand
  * expected: terminal refits to new width immediately, no clipping, no dead space on right
  * likely to break: fit() not called after sidebar toggle
    * sidebar hides via CSS, terminal panel width changes via flex-grow
    * but fitAddon.fit() isn't triggered by CSS changes — needs an explicit call
    * if missing: terminal stays at old column count, text clips or has empty space

* T-0200-06: terminal exit updates sidebar card but doesn't remove it
  * flow: terminal B's process exits → pty 'exit' event → setStatus(id, 'exited') → zustand → sidebar re-renders
  * subsystems: pty lifecycle, zustand store, sidebar React component
  * action: process in terminal B exits (type `exit` or process finishes)
  * expected: card stays in sidebar, dot turns gray, card is still clickable, scrollback preserved
  * likely to break: someone removes the card on exit (natural cleanup instinct)
    * or: React component unmounts the terminal when status=exited, disposing the Terminal instance
    * the zustand store must keep the terminal record, not prune it

* T-0200-07: terminal objects live outside React render cycle
  * flow: zustand store updates → React re-renders sidebar → Terminal/pty objects are NOT in React state
  * subsystems: zustand store, Terminal registry (Map), React components
  * setup: 3 terminals with active output
  * action: trigger a sidebar re-render (e.g., status change on one terminal)
  * expected: Terminal instances are not recreated, buffers not lost, pty connections intact
  * likely to break: if Terminal objects live inside React state or zustand
    * zustand state changes → new object reference → something re-initializes Terminal
    * spec says: Terminal/pty objects in a separate registry (Map), store holds metadata only
    * violation: putting xterm Terminal in zustand store → every state update clones/touches it

* T-0200-08: first terminal stays at top of sidebar regardless of creation order
  * flow: app launches → first terminal (shell) created → more terminals added below
  * subsystems: sidebar card ordering, zustand store
  * setup: create 5 terminals
  * action: check sidebar order
  * expected: first terminal (shell) always at position 0, others below in creation order
  * likely to break: sorting by ID or name alphabetically instead of creation order
    * or: inserting new terminals at the top instead of bottom
