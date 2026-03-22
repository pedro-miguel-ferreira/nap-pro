# 0200-sqlite-setup — test architecture

## The seam

Session-store is the single chokepoint. Every CLI command, every socket request, every pty lifecycle event flows through it. Today it's a Map. Tomorrow it's SQLite. The interface stays identical — callers must not know.

Two things can break:
1. The store itself — wrong shapes, lost data, bad lifecycle
2. The new behavior — UUID generation, `--session-id` injection into pty commands

---

## Small tests (vitest, no Electron)

### T-0200-01: SQLite store — interface parity

* **Flow:** create, get, getAll, updateStatus, delete — same operations, same return shapes as the Map-based store
* **Subsystems:** session-store (SQLite-backed)
* **Expected:** every method returns identical types. `createSession()` returns a Session. `getSession()` returns Session | undefined. `getAllSessions()` returns Session[]. `deleteSession()` + `getSession()` returns undefined.
* **Likely to break:** shape mismatch — SQLite returns integers where Map returned strings, or `null` where Map returned `undefined`. Column name mismatches between camelCase (TS) and snake_case (SQL).
* **Size:** small
* **Verification:** call each method on both implementations with identical inputs, deep-equal the outputs. Use `:memory:` SQLite for speed.

### T-0200-02: Schema init is idempotent

* **Flow:** open db → run init → run init again → verify tables exist and are unchanged
* **Subsystems:** database module (init script)
* **Expected:** double-init produces no errors. All four tables (nepics, napkins, sessions, ui_state) exist. Row counts unchanged.
* **Likely to break:** init script uses `CREATE TABLE` without `IF NOT EXISTS`, or has side effects on second run (duplicate inserts, constraint violations).
* **Size:** small
* **Verification:** `db.prepare("SELECT name FROM sqlite_master WHERE type='table'")` returns all 4 table names. Second init returns without throwing.

### T-0200-03: CC session UUID generation and storage

* **Flow:** `createSession()` with no explicit `cc_session_uuid` → store generates one → retrievable via `getSession()`
* **Subsystems:** session-store
* **Expected:** UUID is a valid v4 UUID (36 chars, correct format). Stored in `sessions.cc_session_uuid` column. Round-trips through get.
* **Likely to break:** UUID not generated (null in column), wrong column name, not returned in Session object.
* **Size:** small
* **Verification:** `expect(session.ccSessionUuid).toMatch(/^[0-9a-f]{8}-.../)`. Raw SQL `SELECT cc_session_uuid FROM sessions WHERE id = ?` matches.

### T-0200-04: --session-id injection into command string

* **Flow:** user command `claude --verbose "read prompt.md"` → injected command `claude --session-id <uuid> --verbose "read prompt.md"`
* **Subsystems:** command injection utility (pure function)
* **Expected:** `--session-id <uuid>` appears after the first token. Original args preserved. Edge cases: bare `claude`, `claude "prompt with spaces"`, non-claude commands (no injection).
* **Likely to break:** injection at wrong position (before command name, at end). Breaks quoted arguments. Injects into non-claude commands.
* **Size:** small
* **Verification:** string equality on transformed command. Table-driven: input → expected output for each edge case.

### T-0200-05: Session status transitions persist

* **Flow:** create session → update to done → read back. Create → update to exited → read back. Done → done again → no change.
* **Subsystems:** session-store (SQLite-backed)
* **Expected:** status persists across get calls. `exited_at` gets set on exit. Done is idempotent — second done doesn't overwrite `doneMessage`.
* **Likely to break:** status update doesn't persist (UPDATE WHERE without matching id). `exited_at` stays null. Idempotent done check missing.
* **Size:** small
* **Verification:** `getSession(id).status === 'done'` after update. `exited_at > 0` after exit. Second done: `doneMessage` unchanged.

### T-0200-06: Database file creation

* **Flow:** init with path `.nap/nap.db` → file appears on disk
* **Subsystems:** database module
* **Expected:** file created if missing. Directory created if `.nap/` doesn't exist. Existing db file opened without error.
* **Likely to break:** hardcoded path instead of using project root. Missing `mkdirSync` for `.nap/`. File permissions on fresh directory.
* **Size:** small (uses tmp dir, fast)
* **Verification:** `fs.existsSync(dbPath)` after init. Open same path again — no throw.

---

## Medium tests (Playwright + Electron)

### T-0200-07: nap start generates UUID and spawns pty with --session-id

* **Flow:** CLI → socket `start` request → main process creates session with UUID → spawns pty with `--session-id <uuid>` in command → UUID visible in pty env
* **Subsystems:** CLI, socket server, session-store, pty spawner
* **Expected:** response includes `ccSessionUuid`. Pty command string includes `--session-id`. The UUID in the pty command matches the one stored in the session.
* **Likely to break:** UUID generated but not passed to pty. `--session-id` injected at wrong position in command. UUID mismatch between stored and spawned.
* **Size:** medium
* **Verification:** start a session with command `echo SESSION_CHECK` via socket. Read the spawned command via `app.evaluate()` to inspect the pty args — or start with `echo $NAP_SESSION_ID` and verify the output includes the expected UUID. Cross-check against socket `status` response's UUID.

### T-0200-08: nap ps returns SQLite-backed sessions

* **Flow:** start two sessions via socket → ps → both appear with correct names, statuses, UUIDs
* **Subsystems:** socket server, session-store (read path)
* **Expected:** ps response lists both sessions. All fields populated. This is the read path through SQLite.
* **Likely to break:** getAllSessions() doesn't query SQLite (leftover Map reference). Fields missing from SELECT.
* **Size:** medium
* **Verification:** socket `ps` request. `expect(sessions.length).toBe(initialCount + 2)`. Each session has name, status, uptime.

### T-0200-09: nap done persists to SQLite

* **Flow:** start session → done via socket → status query returns done + message → kill pty → status still 'done' (not overwritten to 'exited')
* **Subsystems:** socket server, session-store (write path), pty exit handler
* **Expected:** done persists through pty exit. `doneMessage` stored. This is the critical interaction: pty `onExit` calls `setSessionStatus('exited')` but done check prevents overwrite.
* **Likely to break:** pty exit handler overwrites 'done' with 'exited' (race condition with the `if (session.status !== 'done')` guard). Message not persisted to SQLite.
* **Size:** medium
* **Verification:** socket `status` after done → `status: 'done'`, `doneMessage` present. Kill pty. Wait for exit. Socket `status` again → still 'done'.

### T-0200-10: Database location is .nap/nap.db next to .nap/sock

* **Flow:** launch Electron app with --cwd → verify `.nap/nap.db` exists in same directory as `.nap/sock`
* **Subsystems:** main process startup, database module
* **Expected:** both files in `<projectCwd>/.nap/`. Database initialized before socket server starts (or at least before handling requests).
* **Likely to break:** database path doesn't use same root as socket path. Database init happens after socket starts → first request fails.
* **Size:** medium
* **Verification:** `fs.existsSync(path.join(projectCwd, '.nap', 'nap.db'))` after app launch. Socket request succeeds (proves db initialized before requests).

---

## What NOT to test here

* **Renderer changes** — spec says "don't touch renderer code." No renderer tests.
* **Schema for nepics, napkins, ui_state** — tables exist (T-0200-02) but no data flows through them in 0200. They're scaffolding for later napkins.
* **CLI argument parsing** — already tested, unchanged.
* **Socket protocol changes** — protocol is unchanged per spec.
* **Happy-path CRUD** — if interface parity (T-0200-01) passes, happy paths are covered.

## Regression constraint

All existing tests must pass unchanged. The SQLite layer is invisible to everything above session-store. If any existing test breaks, the interface contract is violated — that's a bug in the implementation, not the tests.
