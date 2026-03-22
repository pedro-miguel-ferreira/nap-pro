* live wiring — connect real data to React components

* replace mock data in napkin browser with real sources
  * filesystem service → artifact lists, agent dirs, napkin bullets
  * SQLite (via existing IPC) → napkin statuses, agent statuses
  * session-store → agent runtime state (running/done/exited)

* sidebar reads from zustand store
  * store fed by two streams:
    * filesystem service IPC → what exists on disk
    * session/status IPC → runtime state
  * merge in store: napkin has artifacts (from fs) + status (from SQLite) + agents (from both)

* kanban overlay (Cmd+`)
  * Quake console — slides down from top, full width
  * reads same store data as sidebar, different rendering
  * napkin cards show first-level `*` bullets from .nap.md
  * artifact badges: filled = exists, dimmed = not yet
  * agent dots per card
  * → navigation: click card → dismiss overlay, scroll sidebar, switch terminal

* breadcrumb navigation
  * terminal header: `S > napkin-name > agent-name`
  * derived from: active nepic + active terminal's napkin_slug + agent name
  * click segments to navigate

* what makes this work
  * fs.watch fires → filesystem service pushes update → store merges → React re-renders
  * nap done fires → session status IPC → store updates → dot changes color
  * both streams converge in the same store — components just read state
