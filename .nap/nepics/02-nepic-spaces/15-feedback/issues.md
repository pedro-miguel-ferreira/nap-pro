# Bugs

Things that are broken. Noticed while using, jotted down, moved on. Each one is a seed — might become a napkin, might get folded into something bigger, might just need a one-line fix.

* `nap poke` message doesn't submit as Enter in Claude Code
  * message appears in the terminal but isn't "sent" — Claude doesn't process it
  * tried `\n`, tried `\r` — neither triggers Claude Code's input handler
  * might be how Claude Code reads stdin vs how pty delivers keystrokes
  * needs investigation: what does Claude Code actually listen for?

* clickable file paths break on wrapped lines
  * file path that wraps onto multiple lines due to terminal width — can't click it
  * the link provider seems to parse it (visual feedback) but click doesn't resolve
  * workaround: widen the terminal until the path fits on one line, then it clicks fine
  * likely: registerLinkProvider's regex matches within a single buffer row, but wrapped lines split the path across rows
  * xterm's buffer rows vs viewport rows distinction — wrapped line is one buffer row but multiple viewport rows, or vice versa?

* WebGL addon loads silently but doesn't render — Canvas takes over
  * code tries WebGL first, no error thrown, but `getContext('webgl2')` and `getContext('webgl')` both return null
  * `onContextLoss` fires silently, disposes WebGL, loads Canvas addon as fallback
  * result: two canvases in DOM (dead WebGL one + active Canvas one)
  * performance seems fine on Canvas — monitor, and if ok, drop WebGL and load Canvas directly
  * would simplify terminal-registry.ts and remove a dead code path
