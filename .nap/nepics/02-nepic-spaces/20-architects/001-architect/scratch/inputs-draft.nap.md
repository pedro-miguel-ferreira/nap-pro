* nap v2 — nepic spaces

* what it proves
  * three-column layout works for managing multi-agent workflows
  * napkin browser replaces flat sidebar — features, not terminals
  * SQLite persistence — agents survive app restart
  * nepic spaces — fresh architect, fresh napkins, same codebase
  * kanban board view — glance at project status

* three-column layout
  * left gutter (~60px)
    * nepic switcher — vertical stack of nepic icons/initials
    * like Slack workspace switcher
    * click to switch active nepic
    * plus button at bottom — create new nepic
    * active nepic highlighted
  * middle column (~300px)
    * napkin browser — the project navigation
    * two view modes (toggle at top)
      * tree view — napkins grouped by feature, expandable
      * board view — napkins grouped by status (kanban)
    * tree view contents
      * architect section at top
        * click → show architect terminal on right
        * shows architect status (running/not running)
      * napkin list below
        * collapsed: feature name + status badge + progress indicator
        * expanded: artifacts (nap.md, spec.md, journeys.md, test.md) + agents
          * artifacts are clickable — open in default editor
          * agents show status (running/done/exited/napping)
          * click agent → show its terminal on right
    * board view contents
      * horizontal rows: draft → backlog → todo → doing → review → done
      * napkin cards in each row
      * compact — names and status dots, not full detail
      * click card → expand in tree view
    * Cmd+K filter works in both views
  * right panel (fills remaining)
    * terminal — same as current
    * default: architect terminal
    * click agent in middle column → switch to that agent's terminal
    * click architect → back to architect terminal
    * all current terminal features preserved (WebGL, scrollback, fit, scroll lock, file links)

* napkin browser
  * reads from `.nap/nepics/<active>/30-napkins/` on disk
    * watches filesystem for changes (fs.watch or chokidar)
    * new napkin dir appears → browser updates
    * file added/removed inside napkin dir → artifacts list updates
  * reads agent statuses from SQLite
    * status dots: running (green), done (blue), exited (gray), napping (yellow?)
  * artifacts are clickable
    * click nap.md → `shell.openPath()` → opens in default editor
    * same mechanism as file link provider
  * middle column is NOT a terminal — it's a React component
    * tree view with collapsible sections
    * styled to match current dark theme

* SQLite persistence
  * better-sqlite3 in main process
    * native module — same rebuild story as node-pty
    * synchronous API — no async complexity
  * database at `.nap/nap.db`
  * tables
    * nepics: id, name, slug, created_at, napkin_dir
    * sessions: id, nepic_id, name, status, parent_id, cwd, command, created_at, exited_at
    * agents: id, session_id, napkin_slug, role, prompt_path, response_path
  * what goes in SQLite vs what stays on filesystem
    * SQLite: runtime state (statuses, timing, relationships)
    * filesystem: content (napkins, specs, prompts, responses)
    * the filesystem is the source of truth for CONTENT
    * SQLite is the source of truth for STATUS
  * board symlinks
    * when status changes in SQLite → app moves symlink in `40-board/`
    * if human moves symlink manually → app detects via fs.watch → updates SQLite
    * two-way sync — either side can initiate
    * conflict: SQLite wins (app is authoritative for status)
  * on app launch
    * read `.nap/nap.db`
    * restore session list from database
    * pty processes are gone (app was closed) — mark all "running" sessions as "exited"
    * architect session: show "resume" prompt or auto-resume if session ID saved

* nepic spaces
  * each nepic = one milestone/version
    * has its own napkin directory, roadmap, architect
    * builds on top of existing codebase (same `src/`)
  * creating a new nepic
    * click plus in left gutter
    * creates `.nap/nepics/NN-name/` with template dirs (10-docs, 20-architects, 30-napkins, 40-board)
    * creates row in SQLite nepics table
    * switches to the new nepic
    * middle column shows empty state — "start by writing inputs.nap.md"
  * nepic has its own architect
    * `.nap/nepics/NN/20-architects/001-architect/`
    * architect is an agent — same prompt/response pattern
    * first terminal runs the architect claude session
    * architect session ID stored in SQLite for resume
  * switching nepics
    * click nepic icon in left gutter
    * middle column switches to that nepic's napkin browser
    * terminal switches to that nepic's architect (or last viewed agent)
    * all sessions from other nepics keep running in background
  * previous nepic is read-only reference
    * can still click into it, view terminals (if alive), read artifacts
    * but new work happens in the active nepic

* architect lifecycle
  * architect = claude session running in the first terminal
  * bound to a nepic — each nepic has its own architect
  * architect creates napkins, writes specs, launches agents, reviews
  * when architect runs out of context
    * writes handoff to `.nap/nepics/NN/10-docs/handoff.md`
    * new architect created: `002-architect/`
    * reads handoff + inputs + codebase
    * picks up where predecessor left off
  * on app restart
    * architect session was lost (pty died)
    * show last architect's session ID so user can `claude -r`
    * or auto-run `claude --resume <session-id>` in first terminal

* kanban board view
  * toggle in middle column header — tree icon / board icon
  * board layout
    * horizontal rows or vertical columns — TBD, depends on space
    * status columns: draft, backlog, todo, doing, review, done
    * napkin cards in each column
      * feature name
      * agent progress (3/5 agents done)
      * click → switch to tree view focused on that napkin
  * reads from SQLite + filesystem
    * status from SQLite (or derived from board symlink position)
    * napkin names from filesystem
  * drag to reorder / change status — stretch goal
    * updates SQLite + moves symlink

* what carries over from POC
  * terminal management — xterm.js + WebGL + node-pty + IPC bridge
  * socket server + CLI — `nap start/ps/poke/nap/done/kill/close/log/peek/open`
  * per-project socket at `.nap/sock`
  * all CLI commands still work — they're terminal-centric, not UI-centric
  * electron-vite + TypeScript + React 18 + zustand
  * test infrastructure — vitest + playwright

* what changes from POC
  * flat sidebar → three-column layout with napkin browser
  * in-memory state → SQLite persistence
  * single workspace → nepic spaces
  * single architect → per-nepic architects
  * no board → kanban board view
  * agent cards showed terminal names → napkin browser shows features with nested agents

* tech additions
  * better-sqlite3 (native module, synchronous API)
  * fs.watch or chokidar (filesystem watching for napkin browser)
  * possibly a tree view component (react-arborist or hand-rolled)

* out of scope for v2
  * collaborative editing (multiple humans)
  * cloud sync / remote agents
  * auto-unfolding (nap reading napkin and auto-spawning the pipeline)
  * agent-to-agent communication beyond poke/nap/done
  * visual diff of napkin changes
  * mobile / web version
