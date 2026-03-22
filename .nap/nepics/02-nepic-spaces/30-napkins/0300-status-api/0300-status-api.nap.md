* status change API — single source of truth for napkin status transitions

* the problem
  * napkin status lives in two places: SQLite + board symlinks
  * without a single API, callers update one and forget the other
  * CLI, app UI, and architect all need to change status

* one function: changeNapkinStatus(slug, newStatus)
  * updates SQLite napkins table
  * moves symlink in 40-board/ (rm old, ln -s new)
  * IPC: notify renderer to re-render sidebar + kanban
  * used by:
    * nap CLI (new command or extend existing)
    * app UI (future: click/drag in kanban)
    * architect agent (via nap CLI from terminal)

* new CLI command: `nap status <napkin> <status>`
  * `nap status 0200-sqlite-setup doing`
  * sends request through socket → main process → changeNapkinStatus
  * returns confirmation

* board symlink management
  * symlinks: `40-board/40-doing/0200 → ../../30-napkins/0200`
  * on status change: rm old symlink, create new one
  * handle edge cases:
    * symlink doesn't exist in old dir (first status set)
    * target dir doesn't exist (create it)
    * napkin slug not found in SQLite
