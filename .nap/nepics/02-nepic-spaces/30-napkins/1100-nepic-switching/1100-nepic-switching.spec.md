## Why

Multiple nepics run simultaneously — agents from different eras work in parallel. Switching between them should be instant, like switching Slack workspaces.

## What

Click a nepic icon in the gutter to swap the sidebar and terminal context.

## Constraints

* Gutter click: update SQLite is_active, notify renderer
* Sidebar: re-render napkin browser for new nepic
  * Read napkins from SQLite where nepic_id matches
  * Filesystem service switches to new nepic's `30-napkins/`
* Terminal: switch to new nepic's architect terminal
  * If architect terminal exists → DOM reparent
  * If not (nepic has no live architect) → show empty terminal state
* Previous nepic's terminals stay alive — just not displayed
* Store: `activeNepicId` changes, triggers re-render cascade
* Must feel instant — no loading state, no flicker
* Gutter highlight updates: white bar moves to clicked icon

## What to read

* `src/renderer/components/Gutter.tsx` — click handler
* `src/renderer/store.ts` — activeNepicId, terminal switching
* `src/main/main.ts` — IPC for nepic switch
* `src/main/session-store.ts` — query sessions by nepic
* 0500-filesystem-service — watcher needs to switch directories
