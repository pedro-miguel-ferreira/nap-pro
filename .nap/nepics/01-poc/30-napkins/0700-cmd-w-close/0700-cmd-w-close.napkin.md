* Cmd+W to dismiss terminated session cards

* the problem
  * agent finishes or crashes → card stays (gray/blue dot)
  * useful for scrollback inspection
  * but once you're done looking, no way to dismiss without CLI
  * `nap close <name>` works but you're already looking at the card

* Cmd+W on active terminal
  * only works if status is exited or done
  * running sessions → ignore Cmd+W (no accidental kills)
  * removes card from sidebar
  * disposes xterm terminal instance
  * switches to next card (or previous, or first)

* edge case: last card
  * Cmd+W on the only remaining card → do nothing
  * always need at least one terminal
