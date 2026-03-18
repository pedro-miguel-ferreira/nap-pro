* fitAddon.fit() resets viewport scroll position to line 0

* the bug
  * user scrolls back in terminal to read earlier output
  * window resize or sidebar toggle fires ResizeObserver
  * ResizeObserver calls fitAddon.fit()
  * viewport jumps to the very beginning of scrollback (line 0)
  * user loses their place
  * iTerm doesn't do this — resize preserves scroll position

* the fix
  * save viewport scroll position before fit()
  * call fit()
  * restore viewport scroll position after fit()
  * xterm.js API: buffer.active.viewportY gives current scroll offset
  * terminal.scrollToLine(y) restores it

* where fit() is called
  * ResizeObserver in Terminal.tsx (debounced 50ms)
  * terminal switch (reparent DOM, then fit)
  * on terminal first open

* which calls need the fix
  * ResizeObserver — yes, always preserve scroll
  * terminal switch — maybe not, jumping to bottom on switch might be expected
  * first open — no, there's nothing to preserve
