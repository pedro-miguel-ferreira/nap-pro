# 0200-sqlite-setup — engineer response

## What was built

### New files
- **`src/main/database.ts`** — SQLite init, schema creation, singleton db instance. Schema includes all 4 tables (nepics, napkins, sessions, ui_state) plus `done_message TEXT` column on sessions (not in original schema — needed because the existing Session interface has `doneMessage` and the done handler persists it).
- **`src/main/inject-session-id.ts`** — Pure function `injectSessionId(command, uuid)`. Only injects for commands starting with `claude`. Inserts `--session-id <uuid>` after the first token.

### Modified files
- **`src/main/session-store.ts`** — Rewritten from Map-based to SQLite-backed. Same exports: `createSession`, `getSession`, `getAllSessions`, `setSessionStatus`, `removeSession`. Added: `initSessionStore(db)` for initialization, `setSessionDone(id, message)` for the done handler. Session interface extended with optional fields: `ccSessionUuid`, `role`, `nepicId`, `napkinSlug`, `exitedAt`. `createSession` now always generates a `ccSessionUuid` via `crypto.randomUUID()`.
- **`src/main/main.ts`** — Calls `initDatabase()` + `initSessionStore()` before socket server start. Start handler injects `--session-id` into pty command. Done handler uses `setSessionDone()` instead of direct object mutation. `closeDatabase()` on will-quit.
- **`package.json`** — Added `better-sqlite3` (dependency) and `@types/better-sqlite3` (devDependency). `electron-rebuild` ran successfully.

## Decisions

1. **Added `done_message` column to sessions table** — The original schema didn't include it, but the existing `Session.doneMessage` field and the done/status handlers require persisting the done message. Without it, T-0200-05 and T-0200-09 would fail.

2. **`setSessionDone(id, message)` — new export** — The old done handler mutated `session.status` and `session.doneMessage` directly on the Map object. That won't work with SQLite. Added this function rather than overloading `setSessionStatus` to keep the API clean. The main.ts done handler is the only caller.

3. **`agentCounter` resets on restart** — The auto-naming counter (`agent-1`, `agent-2`, ...) still starts at 0 each time. Not derived from DB. Could collide with old session names if sessions persist across restarts, but this matches current behavior and the spec doesn't require persistence of the counter.

4. **`ccSessionUuid` always generated** — Every `createSession` call generates a UUID, not just socket-initiated ones. It's cheap (one `randomUUID()` call) and means the field is always available. `--session-id` injection only happens for `claude` commands.

5. **WAL mode + foreign keys** — Database uses WAL journal mode for better concurrency and enables foreign key enforcement.

## For architect review

- The `done_message TEXT` column is an addition to the spec schema. Necessary for correctness, but the architect should confirm it belongs in the schema spec.
- The `agentCounter` reset behavior may need revisiting when session resume is implemented (future napkin).
- Pre-existing test failure: `scroll-lock.test.ts > onScroll without write updates lockedY` was failing before this change (71/72 pass, same before and after).
