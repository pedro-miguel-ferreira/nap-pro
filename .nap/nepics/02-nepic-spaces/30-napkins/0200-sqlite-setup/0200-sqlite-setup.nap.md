* SQLite setup — foundation for persistence

* better-sqlite3 in main process
  * native module — electron-rebuild, same as node-pty
  * synchronous API — no async complexity
  * single writer (main process is single-threaded)

* database at `.nap/nap.db`
  * created on first launch if missing
  * init script: CREATE TABLE IF NOT EXISTS — idempotent
  * no migration framework — wipe and re-init during development

* schema
  * nepics: id, name, slug, created_at, is_active
  * napkins: id, nepic_id, slug, status, created_at
  * sessions: id, nepic_id, napkin_slug, name, role, status,
    cc_session_uuid, parent_id, command, cwd, created_at, exited_at
  * ui_state: active_nepic_id, active_terminal_id, sidebar_visible

* session creation updated
  * nap start → main process generates CC session UUID
  * stores UUID in sessions.cc_session_uuid
  * passes to claude via `--session-id <uuid>`
  * existing session-store.ts becomes SQLite-backed
    * same interface, Map replaced with DB queries

* what changes in nap start flow
  * before: session-store creates in-memory entry
  * after: session-store writes to SQLite, generates UUID, passes --session-id
  * socket protocol unchanged — same request/response shape

* what changes in nap done flow
  * before: session-store updates in-memory status
  * after: session-store updates SQLite row

* must not break
  * all existing CLI commands (ps, peek, kill, close, poke, nap, done, log)
  * terminal creation from renderer (pty:create IPC)
  * output buffering (pty:ready flow)
  * all existing tests
