## Why

Everything in v1 is in-memory. Close the app, lose all state. SQLite is the foundation — every v2 feature (napkin browser, session resume, nepic spaces) depends on persistent state.

## What

Replace the in-memory session-store with SQLite-backed storage. Add better-sqlite3 as a dependency. Create the database schema. Update nap start to generate and store CC session UUIDs.

## Constraints

* Database at `.nap/nap.db` — same directory as the socket
* `CREATE TABLE IF NOT EXISTS` — idempotent init, no migration framework
* Session-store interface stays the same — callers don't know it's SQLite now
  * `createSession()`, `getSession()`, `updateStatus()`, `getAllSessions()`, `deleteSession()`
  * Return types unchanged
* `nap start` generates a UUID via `crypto.randomUUID()` and stores it as `cc_session_uuid`
  * The pty command gets `--session-id <uuid>` injected before the user's command
  * Example: user passes `claude --verbose "read prompt.md"`, NAP spawns `claude --session-id <uuid> --verbose "read prompt.md"`
* Socket protocol requests/responses unchanged — no breaking changes to CLI
* better-sqlite3 is a native module — needs `electron-rebuild` in the build process, same as node-pty
* All existing tests must pass — the SQLite layer is invisible to everything above session-store
* Don't touch renderer code — this is a main process change only

## Schema

```sql
CREATE TABLE IF NOT EXISTS nepics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS napkins (
  id TEXT PRIMARY KEY,
  nepic_id TEXT NOT NULL REFERENCES nepics(id),
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'backlog',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  nepic_id TEXT REFERENCES nepics(id),
  napkin_slug TEXT,
  name TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  cc_session_uuid TEXT,
  parent_id TEXT REFERENCES sessions(id),
  command TEXT,
  cwd TEXT,
  created_at INTEGER NOT NULL,
  exited_at INTEGER
);

CREATE TABLE IF NOT EXISTS ui_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_nepic_id TEXT,
  active_terminal_id TEXT,
  sidebar_visible INTEGER NOT NULL DEFAULT 1
);
```

## What to read

* `src/main/session-store.ts` — the thing you're replacing
* `src/main/main.ts` — where session-store is used (pty creation, socket handlers)
* `src/main/socket-server.ts` — socket setup, handler registration
* `src/shared/protocol.ts` — request/response types (don't change these)
* `src/shared/constants.ts` — socket path discovery (nap.db should use same pattern)
