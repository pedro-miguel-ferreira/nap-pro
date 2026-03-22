## Why

Napkin status lives in SQLite and board symlinks. Without a single API, they drift. Every caller (CLI, app, architect) needs one function that keeps both in sync.

## What

A `changeNapkinStatus(slug, newStatus)` function in main process, exposed via socket protocol as a new `status` command.

## Constraints

* Statuses: backlog, todo, doing, review, done
* Function updates SQLite napkins.status AND moves symlink in 40-board/
* Atomic: if SQLite update succeeds but symlink fails, log warning but don't rollback (SQLite is authoritative)
* New socket request type: `{ type: 'status', napkinSlug: string, status: string }`
* New CLI command: `nap status <napkin-slug> <status>`
* IPC notification to renderer after status change so sidebar/kanban update
* Must create napkin row in SQLite if it doesn't exist yet (first status set from CLI)
* Board dirs (10-draft through 60-done) must exist — create if missing

## What to read

* `src/main/session-store.ts` — pattern for SQLite operations
* `src/main/main.ts` — socket request handlers
* `src/shared/protocol.ts` — request/response types
* `src/cli/nap.ts` — CLI command structure
