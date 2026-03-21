# Bugs

Things that are broken. Noticed while using, jotted down, moved on. Each one is a seed — might become a napkin, might get folded into something bigger, might just need a one-line fix.

* `nap poke` message doesn't submit as Enter in Claude Code
  * message appears in the terminal but isn't "sent" — Claude doesn't process it
  * tried `\n`, tried `\r` — neither triggers Claude Code's input handler
  * might be how Claude Code reads stdin vs how pty delivers keystrokes
  * needs investigation: what does Claude Code actually listen for?
