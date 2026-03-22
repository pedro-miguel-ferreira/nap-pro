## Why

0400 built the layout with mock data. 0500 built the filesystem service. This napkin wires real data into the React components and adds the kanban overlay.

## What

Replace hardcoded mock data with real filesystem + SQLite data. Add kanban overlay (Cmd+`). Add breadcrumb navigation.

## Constraints

* Zustand store extended with napkin browser state:
  * `napkins: NapkinData[]` — merged from filesystem service + SQLite
  * `expandedNapkins: Set<string>` — which cards are focused/extended
  * `kanbanVisible: boolean` — Cmd+` toggle
* NapkinBrowser component reads from store, not props
* Kanban overlay:
  * Full-width overlay, slides down from top
  * Columns: backlog, todo, doing, review, done
  * Cards show: name, agent dots, artifact badges, → arrow
  * Expanded cards show first-level `*` bullets from .nap.md
  * Click → dismiss, scroll sidebar, switch terminal
  * Cmd+` toggles (same pattern as Cmd+B for sidebar)
* Breadcrumb: `S > napkin-slug > agent-name` in terminal header
  * Click S → switch to architect terminal
  * Click napkin → focus card in sidebar
* Agent dots update in real-time when `socket:status-changed` fires
* Artifact list updates when filesystem service pushes `napkin:update`
* All existing terminal features still work

## What to read

* `src/renderer/store.ts` — extend with napkin data
* `src/renderer/components/NapkinBrowser.tsx` — from 0400
* `src/renderer/components/Terminal.tsx` — add breadcrumb
* `src/renderer/index.tsx` — kanban overlay, keyboard shortcut
* `src/main/preload.ts` — new IPC channels
