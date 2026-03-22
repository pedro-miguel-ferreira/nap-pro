## Why

Close the app, reopen, pick up where you left off. Without this, every restart loses UI context — which terminal was focused, which nepic was active.

## What

Save UI state to SQLite on quit. Restore on launch.

## Constraints

* Save on `before-quit` event (before ptys are killed)
* ui_state table: single row, upsert pattern
* Restore on startup: read ui_state, apply to store before first render
* If active_terminal_id references a session that no longer exists, fall back to architect
* Must not block pty shutdown — save is synchronous (better-sqlite3), fast
* closeSessionStore() before closeDatabase() — avoid shutdown race (already fixed in 0200)

## What to read

* `src/main/main.ts` — quit handlers, startup sequence
* `src/main/session-store.ts` — add saveUiState / loadUiState
* `src/main/database.ts` — ui_state table already exists from 0200
* `src/renderer/store.ts` — state to save/restore
