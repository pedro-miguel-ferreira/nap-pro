* nap v2 — nepic spaces

* what it proves
  * structured project view replaces flat terminal sidebar
    * features, not terminals — napkin cards with nested agents
  * SQLite persistence — state survives app restart
  * nepic spaces — fresh architect, fresh napkins, same codebase
  * board view — project status at a glance

* three-column layout
  * left gutter (~60px)
    * nepic switcher — vertical stack of icons/initials
    * click to switch active nepic
    * (+) at bottom — create new nepic
    * active nepic highlighted
    * when only one nepic: gutter still visible, establishes spatial model
  * middle column (~300px)
    * napkin browser — the project navigation
    * React component, not a terminal
      * tree with collapsible sections
      * styled to match v1 dark theme
    * two view modes (toggle at top)
      * tree view — napkins grouped by feature, expandable
        * collapsed: feature name + status badge
        * expanded: artifacts + agents
          * artifacts (nap.md, spec.md, test.md) — clickable → shell.openPath()
            * same mechanism as v1 file link provider
          * agents with status dots — clickable → show terminal on right
      * board view — napkins grouped by status (kanban)
    * Cmd+K filter works in both views
      * same substring, case-insensitive as v1 sidebar filter
    * architect section pinned at top
      * click → architect terminal
      * status: running / not running
  * right panel (fills rest)
    * terminal — same as v1
    * default: architect terminal
    * click agent in middle → switches to that agent's terminal
      * same DOM reparenting as v1 terminal switching
      * Canvas addon survives, no re-rendering
    * all v1 features preserved
      * Canvas rendering, 100k scrollback, addon-fit
      * scroll lock (follow / read)
      * clickable file paths (Cmd+click)

* napkin browser data model
  * two sources, strict separation
    * SQLite → status, relationships, timing
    * filesystem → content listing (readdir for what .md files exist)
  * no filesystem watching for status — SQLite is authoritative
  * filesystem is passive — just answers "what artifacts exist in this dir"
    * `readdir(.nap/nepics/NN/30-napkins/0100-feature/)` → list of .md files
    * no chokidar, no fs.watch for content — refresh on demand or on focus
  * tree structure derived from
    * napkin dirs in `30-napkins/` (filesystem)
    * agent-to-napkin relationships (SQLite)
    * status per agent (SQLite)
    * status per napkin (SQLite, or derived from agent statuses)

* SQLite persistence
  * better-sqlite3 in main process
    * native module — electron-rebuild, same story as node-pty
    * synchronous API — reads/writes block, no async complexity
    * single writer, no concurrency concerns (Electron main is single-threaded)
  * database at `.nap/nap.db`
  * schema migrations
    * version table: `schema_version` with single row
    * migration files run sequentially on startup
    * schema will change — add fields, rename, refactor
    * migrations must be idempotent (safe to re-run)
  * tables (initial, will evolve)
    * nepics
      * id, name, slug, created_at, napkin_dir
    * sessions
      * id, nepic_id, name, status, parent_id, cwd, command
      * created_at, exited_at
      * session_key — claude session ID for resume
    * agents
      * id, session_id, napkin_slug, role, prompt_path
  * dual-truth model
    * SQLite: runtime state (statuses, timing, relationships)
    * filesystem: content (napkins, specs, prompts, responses)
    * SQLite authoritative for status — always wins on conflict
    * filesystem authoritative for content — human edits in editor
  * board symlinks
    * `40-board/` dirs: `10-draft/`, `20-backlog/`, `30-todo/`, `40-doing/`, `50-review/`, `60-done/`
    * symlinks point back to canonical napkin dir in `30-napkins/`
      * `40-board/40-doing/0100-feature → ../../30-napkins/0100-feature`
    * status change in SQLite → app moves symlink to new board dir
    * human moves symlink manually → app detects → updates SQLite
    * conflict resolution: SQLite wins
  * on app launch
    * read `.nap/nap.db`
    * restore session list, nepic state, agent relationships
    * mark all previously "running" sessions as "exited" (ptys are gone)
    * restore UI: which nepic was active, which terminal was focused

* session continuity
  * architect resume
    * store claude session ID (session_key) in SQLite
    * on app reopen: auto-run `claude --resume <session-key>` in architect terminal
    * `claude --resume` is the only reliable mechanism
  * agent state on restart
    * ptys are gone — processes died when app closed
    * SQLite knows: who was running, who was done, parent-child tree
    * UI shows ghost state: "this agent was running when you left"
      * gray dot with "last seen" timestamp
    * no auto-resume for agents — only architect resumes
      * agents are short-lived, architect is long-lived
  * what persists across restart
    * nepic structure, active nepic
    * session list with statuses and relationships
    * architect session key for resume
    * which terminal was focused, sidebar state
  * what doesn't persist
    * pty processes (obviously)
    * terminal scrollback (xterm buffers are in-memory)
      * `nap log` output could be saved to disk — stretch goal
    * scroll lock state per terminal

* nepic spaces
  * each nepic = one milestone/era of the project
    * own napkin directory, architect, roadmap
    * same codebase, same `src/`
  * directory structure per nepic
    * `10-docs/` — mega napkin, milestones, handoffs
    * `20-architects/` — `001-architect/`, `002-architect/`, etc.
    * `30-napkins/` — canonical napkin dirs, never move
    * `40-board/` — symlinked status dirs
  * creating a new nepic
    * (+) in left gutter
    * scaffolds `.nap/nepics/NN-name/` with template dirs
    * prompts and onboarding templates are customizable
      * live outside app code — skill/workflow concern
    * creates row in SQLite nepics table
    * switches UI to new nepic
  * switching nepics
    * click icon in left gutter
    * middle column swaps to that nepic's napkin browser
    * terminal swaps to that nepic's architect (or last viewed agent)
    * all sessions from other nepics keep running
      * ptys don't care about UI focus
  * architect lifecycle within a nepic
    * first architect: `001-architect/`
    * runs out of context → writes handoff to `10-docs/`
    * new architect: `002-architect/`, reads handoff + inputs
    * session key stored in SQLite for each architect
  * previous nepics are read-only reference
    * visible in gutter, browsable, terminals viewable if alive

* board view
  * toggle in middle column header — tree icon / board icon
  * status columns: draft → backlog → todo → doing → review → done
  * compact napkin cards
    * feature name
    * agent progress (e.g., 3/5 agents done)
    * status dot
    * click → expand in tree view
  * reads from SQLite (status) + filesystem (napkin names)
  * drag-to-reorder / change status — stretch goal
    * updates SQLite + moves symlink

* what carries over from v1
  * terminal management — xterm.js + Canvas + node-pty + IPC bridge
    * DOM reparenting for switching
    * Canvas on every terminal, never disposed
    * 100k scrollback
  * socket server + CLI
    * per-project socket at `.nap/sock`
    * all commands: start, ps, poke, nap, done, kill, close, log, peek, open
    * ndjson protocol, request-response with id matching
  * electron-vite + TypeScript strict + React 18 + zustand
  * test infrastructure — vitest (small) + playwright (medium)
  * design language
    * dark theme: #1e1e1e bg, #252526 sidebar, #3c3c3c borders
    * status dots: green #22c55e, blue #3b82f6, gray #6b7280
    * scroll lock borders: dim blue #2a5a9a, dim amber #8a6a2a
    * font: Menlo, Monaco, monospace, 14px
    * active card: #37373d bg, #007acc left border

* what changes from v1
  * flat sidebar → three-column layout with napkin browser
  * in-memory state → SQLite persistence
  * single workspace → nepic spaces
  * single architect → per-nepic architects with handoff
  * no board → kanban board view
  * terminal names → napkin cards with nested agents

* tech additions
  * better-sqlite3 (native, synchronous)
  * tree view component (react-arborist or hand-rolled)

* out of scope
  * collaborative editing (multiple humans)
  * cloud sync / remote agents
  * auto-unfolding pipeline
  * agent-to-agent communication beyond start/done/nap
  * visual diff of napkin changes
  * mobile / web version
  * poke as Enter — v3 collaboration patterns
