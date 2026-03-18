* scroll lock modes for terminal viewport

* the problem
  * Claude Code uses ink to redraw its TUI
  * ink emits cursor positioning sequences on every tool call
  * xterm.js viewport gets yanked around during redraws
  * can't read scrollback while agent is working
  * can't reliably watch live output without being bumped

* three states
  * normal (default)
    * xterm.js default behavior
    * scroll follows cursor on input
    * no lock, no frame
  * follow lock
    * viewport pinned to bottom
    * ink redraws, cursor jumps — doesn't matter, stays at bottom
    * for watching live output
  * read lock
    * viewport pinned to current line from top
    * nothing moves you — writes, redraws, cursor positioning all ignored
    * for reading scrollback while agent works

* controls: Cmd+G
  * first press → follow lock (snaps to bottom, stays)
  * double-press (Cmd+G Cmd+G within 500ms) → read lock at current position
  * press again (from either lock) → back to normal

* visual indicator: colored frame border on terminal viewport
  * follow lock → dim blue bottom border (#2a5a9a)
  * read lock → dim amber side borders left+right (#8a6a2a)
  * normal → no border (transparent)
  * 2px border, subtle, doesn't compete with content
  * transition on border-color for smooth toggle

* implementation (from xterm.js research in .napkins/30-doing/1000-scroll-lock/research-xterm-scroll-lock.md)
  * new module `src/renderer/scroll-lock.ts`
  * follow lock
    * `terminal.onWriteParsed(() => terminal.scrollToBottom())`
    * `terminal.onScroll(() => terminal.scrollToBottom())`
    * both are safe — xterm has re-entry guards, no infinite loops
    * scrollToBottom() is synchronous with smoothScrollDuration=0
    * onWriteParsed fires before rendering → no flicker
  * read lock
    * save `viewportY` when entering read lock
    * `terminal.onWriteParsed(() => terminal.scrollToLine(pinnedLine))`
    * `terminal.onScroll(() => terminal.scrollToLine(pinnedLine))`
    * `restoring` flag prevents re-entry
  * set `scrollOnUserInput = false` when either lock is active
    * prevents keypress from yanking viewport to bottom
    * restore to true when lock is off
  * per-terminal state — each terminal has its own lock mode
  * register listeners at terminal creation in terminal-registry.ts
