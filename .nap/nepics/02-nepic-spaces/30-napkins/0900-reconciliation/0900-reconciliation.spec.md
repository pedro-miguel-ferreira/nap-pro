## Why

Filesystem and SQLite can diverge — branch switches, manual edits, git operations. Reconciliation makes the annotation model safe by re-deriving structure from filesystem on every launch.

## What

On startup, walk the filesystem, match against SQLite, create/hide entries as needed.

## Constraints

* Runs after database init, before UI renders
* Walk: `<nepicDir>/30-napkins/` → readdir for napkin slugs
* Walk: each `<napkinDir>/agents/` → readdir for agent dir names
* Match key: `napkin_slug + agent_dir_name`
* Three outcomes (all must work):
  * Match: keep existing row, render normally
  * New dir: INSERT with defaults (napkin: status=backlog, agent: status=new)
  * Orphan: UPDATE with `hidden=true` or equivalent — don't render, don't DELETE
* Must handle: `30-napkins/` doesn't exist (new nepic, no napkins yet)
* Must handle: agent dir has no prompt.md (created but not yet populated)
* Reconciliation is additive: never deletes rows, never deletes files
* Must not slow startup noticeably — target <100ms for 40 napkins

## What to read

* `src/main/session-store.ts` — existing SQLite queries
* `src/main/database.ts` — schema, tables
* `src/main/main.ts` — startup sequence (where to hook in)
* `41-persistence-model.nap.md` in architect scratch — full design rationale
