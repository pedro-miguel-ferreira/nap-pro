* journey 1 — multiple terminals
  * app launches with first terminal (shell)
  * developer creates a second terminal programmatically (or via a temp button for testing)
  * sidebar shows two cards
    * first terminal card at top
    * second terminal card below
    * both have green dots
  * click second card
    * terminal panel switches instantly
    * second terminal is interactive
  * click first card
    * switches back
    * scrollback from before the switch is preserved
    * any output that happened while hidden is visible

* journey 2 — background output
  * terminal A is active, running shell
  * terminal B is hidden, running `ping localhost`
  * switch to B
    * all ping output that accumulated while hidden is there
    * output continues streaming live
  * switch back to A
    * shell prompt is exactly where we left it

* journey 3 — sidebar collapse
  * user hits Cmd+B
    * sidebar disappears
    * terminal fills full width
    * terminal refits to new width (no clipping, no dead space)
  * user hits Cmd+B again
    * sidebar reappears
    * terminal refits to narrower width

* journey 4 — terminal exits
  * terminal B's process exits
    * status dot turns gray
    * card stays in sidebar
    * user can still click it
    * scrollback is still there
  * user can still use terminal A normally

* journey 5 — many terminals
  * create 5 terminals running various commands
  * switch between them rapidly (click click click)
    * each switch is instant
    * no flash, no blank frame, no stale content
  * sidebar scrolls if cards overflow
