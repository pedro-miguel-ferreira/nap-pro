* nepic switching — click gutter icon, swap context

* click nepic icon in gutter
  * SQLite: update is_active
  * sidebar swaps to that nepic's napkin browser
    * different napkins, different agents, different statuses
  * terminal swaps to that nepic's architect (or last viewed agent)
  * filesystem service switches watch to new nepic's `30-napkins/`

* all sessions from other nepics keep running
  * ptys don't care about UI focus
  * background agents continue working
  * switch back → everything as you left it

* previous nepics are browsable
  * visible in gutter
  * click to view their napkins, agents, terminal scrollback
  * read-only in spirit (you CAN launch agents, but the convention is: work happens in the active nepic)

* gutter state
  * active nepic: highlighted with white bar
  * other nepics: dimmed icons
  * (+): always at bottom of stack
