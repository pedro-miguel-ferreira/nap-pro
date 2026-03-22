* clean quit — save UI state, restore on launch

* on before-quit
  * save to SQLite ui_state table:
    * active_nepic_id
    * active_terminal_id
    * sidebar_visible
  * session statuses already accurate (updated on nap done / pty exit)
  * kill ptys, wait for exit callbacks (2s timeout — same as v1)
  * close session store, close database

* on launch
  * read ui_state from SQLite
  * restore: which nepic, which terminal, sidebar state
  * architect terminal: default if active_terminal_id no longer valid

* crash handling (P2/P3)
  * no special handling
  * on next launch: reconciliation (0900) handles stale state
  * "running" sessions with dead ptys → mark exited
