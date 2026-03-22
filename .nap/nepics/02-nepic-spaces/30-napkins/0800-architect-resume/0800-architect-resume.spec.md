## Why

The architect is the control plane. If it loses context on restart, the human has to re-explain everything. CC session persistence + our stored UUID = seamless resume.

## What

Auto-resume architect on app launch. Show orphaned state for agents that were running.

## Constraints

* On startup, after 0700 restores UI state:
  * Query sessions: find architect for active nepic (role='architect', status='running' or 'done')
  * If cc_session_uuid exists: spawn `claude --resume <uuid>` in architect terminal
  * If no UUID (legacy session): spawn fresh `claude` session
* Orphaned agents:
  * Sessions with status='running' in SQLite but no live pty
  * Render with orphaned dot style in sidebar
  * On click: offer to resume (`claude --resume <uuid>`)
* Don't auto-resume non-architect agents — manual for v2
* Must handle: UUID exists but CC session was deleted/expired → falls back to fresh session
* Must handle: multiple architect sessions (001-architect retired, 002-architect active) → resume the active one

## What to read

* `src/main/main.ts` — startup sequence, pty spawning
* `src/main/session-store.ts` — query by role, nepic
* `src/renderer/store.ts` — terminal creation on startup
* `src/renderer/components/NapkinBrowser.tsx` — orphaned dot rendering
