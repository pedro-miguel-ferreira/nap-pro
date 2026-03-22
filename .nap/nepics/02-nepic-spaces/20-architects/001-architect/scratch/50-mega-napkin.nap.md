* nap v2 — nepic spaces

* what it proves
  * structured project view replaces flat terminal sidebar
    * napkin bullets as UI — sidebar renders `*` format, not cards
  * SQLite persistence — state survives restart
  * CC session resume — architect picks up mid-thought
  * nepic spaces — pivot as cheap as having an idea

* what carries over unchanged
  * terminal management — xterm.js + Canvas addon + node-pty + IPC bridge
    * DOM reparenting for switching
    * 100k scrollback
  * socket server + CLI — all commands still work
    * per-project socket at `.nap/sock`
    * ndjson protocol, request-response
  * electron-vite + TypeScript strict + React 18 + zustand
  * test infrastructure — vitest (small) + playwright (medium)


* three-column layout
  * left gutter (~60px)
    * nepic switcher — vertical stack of icons/initials
    * click to switch active nepic
    * (+) sits where the next nepic would appear, not at bottom
    * active nepic highlighted
  * middle column (~300px)
    * napkin browser — project navigation
    * React component, not a terminal
    * architect pinned at top
      * not a napkin — it's the control plane
      * click → architect terminal
      * status: running / not running
    * napkin list below
      * three card states, progressive disclosure
        * collapsed — one line: `* name ●●◌ status`
          * scan the whole project in N lines
        * focused — bullets expand: artifacts as `*`, agents as `●/◌`
          * artifact clicks → open in editor (shell.openPath)
          * agent clicks → switch terminal
        * extended (Cmd+E) — full directory snapshot
          * file controls: copy path, open in editor
          * hover-reveal, not always visible
    * Cmd+K filter (substring, case-insensitive)
    * styled to match v1 dark theme
  * right panel (fills rest)
    * terminal — same as v1
    * default: architect terminal
    * click agent in middle → switches via DOM reparent
    * all v1 features preserved
      * Canvas rendering, 100k scrollback, addon-fit
      * scroll lock (follow / read)
      * clickable file paths (Cmd+click)


* kanban overlay (Cmd+`)
  * Quake console — slides down from top, full width
  * terminal stays underneath, untouched
  * columns: backlog → todo → doing → review → done
  * napkin cards show:
    * name + agent dots (collapsed)
    * first-level bullets from .nap.md (expanded)
      * napkin format IS the UI — kanban reads file content
    * artifact tags: which files exist (nap, spec, test, journeys)
    * agent status dots per card
  * click card → dismiss overlay, sidebar scrolls to napkin
  * read-only for now, drag-to-reorder is future


* two orthogonal status systems
  * napkin status (project phase)
    * backlog → todo → doing → review → done
    * shown on kanban, shown as badge on sidebar cards
    * stored in SQLite, synced to board symlinks
  * agent status (runtime state)
    * running ● (green) / done ● (blue) / napping ◌ (amber) / exited ◌ (gray)
    * shown as dots on sidebar cards and kanban cards
    * running dots pulse subtly
    * stored in SQLite
  * orthogonal: agents can be active at any project phase


* persistence model — annotation layer
  * two sources, strict separation
    * filesystem — defines what exists (structure + content)
      * napkin dirs, agent dirs, specs, prompts, responses
      * append-only by convention: created, never renamed, never deleted
      * human reads and edits in editor
    * SQLite — annotates what exists (runtime metadata)
      * statuses, CC session UUIDs, timestamps, relationships
      * keyed by stable filesystem path (napkin_slug + agent_dir_name)
      * app reads for rendering sidebar, kanban, resume
  * the model
    * SQLite doesn't define what exists — filesystem does
    * SQLite adds metadata to what filesystem shows
    * like git notes on commits — commits exist independently
    * no sync watchers for structure, no conflict resolution
  * design principles
    * filesystem changes can't corrupt SQLite
      * worst case: orphaned rows (hidden, harmless)
    * SQLite loss can't corrupt filesystem
      * delete nap.db → metadata gone, project structure untouched
      * reconciliation rebuilds from filesystem
    * reconciliation is additive, never destructive
      * never deletes rows, never deletes files
    * "what exists?" → always filesystem
    * "what's the status?" → always SQLite

  * SQLite schema
    * database at `.nap/nap.db`
    * init scripts, no migration framework for v2
      * wipe and re-init for testing
      * CREATE TABLE IF NOT EXISTS — idempotent
    * nepics
      * id (uuid), name, slug, created_at, is_active
    * napkins
      * id (uuid), nepic_id, slug
      * status (backlog/todo/doing/review/done)
      * created_at
    * sessions
      * id (uuid), nepic_id, napkin_slug (nullable for architect)
      * name, role (architect/test-arch/fs-eng/test-eng)
      * status (running/done/exited)
      * cc_session_uuid — pre-assigned, passed via `--session-id`
      * parent_id (nullable), command, cwd
      * created_at, exited_at
    * ui_state (single row)
      * active_nepic_id, active_terminal_id, sidebar_visible

  * reconciliation on launch
    * walk `30-napkins/` → list napkin dirs
    * walk each `agents/` → list agent dirs
    * match against SQLite by key
      * match → reconnect with stored metadata
      * dir exists, no SQLite → new entry, default status
      * SQLite exists, no dir → orphaned, hide, don't delete
    * performance: 20 napkins × 3 agents = milliseconds

  * board symlinks
    * `40-board/` dirs with symlinks to `30-napkins/`
    * one API for status changes: updates SQLite + moves symlink together
      * used by CLI (`nap` commands) and app (UI actions)
    * symlinks are editor lenses — `ls 40-board/40-doing/` in terminal
    * human can browse project status without opening the app


* filesystem service
  * main process watches `30-napkins/` via fs.watch (recursive)
  * on change: re-read affected napkin dir
    * readdir for artifact existence (.nap.md, .spec.md, etc.)
    * read first N lines of .nap.md for kanban card content
    * push update to renderer via IPC
  * renderer updates store → React re-renders sidebar + kanban
  * catches everything: agent file writes, human edits, git operations
  * `30-napkins/` is small and stable — watching is cheap


* CC session management
  * launch flow
    * NAP generates UUID (crypto.randomUUID())
    * stores in SQLite: sessions.cc_session_uuid
    * spawns: `claude --session-id <uuid> --verbose "read prompt.md ..."`
    * UUID known before session starts — no parsing needed
  * resume flow
    * architect: auto-resume on app restart
      * `claude --resume <uuid>` in architect terminal
      * full conversation history preserved
    * agents: manual for v2
      * UI shows "was running when you left" (orphaned dot style)
      * human can click → resume
      * auto-resume all = fast-follow napkin
  * fork (future)
    * `claude --fork-session` — new session, copied history
    * agent retry from checkpoint
    * not v2 scope


* nepic spaces
  * each nepic = one milestone/era
    * own napkin directory, architect, roadmap
    * same codebase, same `src/`
  * creating a new nepic — clicking (+)
    * scaffold `.nap/nepics/NN-name/`
      * 10-docs/, 15-feedback/, 20-architects/, 30-napkins/, 40-board/
    * SQLite: insert nepic, set is_active
    * architect boots: pty spawned, session created
    * onboarding package generation
      * skill/workflow concern, not app code
      * reads previous nepic's state
      * TBD: autonomous or human-reviewed
  * switching nepics
    * click icon in gutter
    * middle column swaps to that nepic's browser
    * terminal swaps to that nepic's architect
    * all sessions from other nepics keep running
  * architect lifecycle
    * runs out of context → writes handoff to own folder
      * `20-architects/001-architect/handoff.md`
    * new architect: `002-architect/`, reads predecessor's handoff
    * old architect stays in SQLite — can resume via `claude --resume`
  * previous nepics: visible in gutter, browsable, read-only


* clean quit flow
  * on app close (before-quit event)
    * save UI state to SQLite (active nepic, active terminal, sidebar)
    * session statuses already accurate in SQLite (updated on nap done/exit)
    * kill all ptys, wait for exit callbacks (2s timeout, same as v1)
    * close SQLite connection
  * crash: no special handling
    * on next launch: reconciliation handles stale state
    * "running" sessions with no dir → mark exited
    * P2/P3 concern


* nap start flow (updated for CC sessions)
  * CLI sends start request via socket
  * main process:
    * generate CC session UUID
    * create session in SQLite with UUID
    * spawn pty: `claude --session-id <uuid> --verbose "..."`
    * set NAP_SESSION_ID env var (for nap done)
    * IPC: notify renderer
  * renderer: create xterm, add to registry + store, sidebar updates


* status change API
  * single function: `changeNapkinStatus(slug, newStatus)`
    * updates SQLite napkins table
    * moves symlink in `40-board/`
    * IPC: notify renderer
  * called by:
    * nap CLI (architect moves status via commands)
    * app UI (human drags card — future)
    * internal (architect agent via nap CLI from terminal)


* design language (carry from v1)
  * dark theme: #1e1e1e bg, #252526 sidebar, #3c3c3c borders
  * status dots
    * running: green #22c55e (filled ●, pulsing)
    * done: blue #3b82f6 (filled ●)
    * napping: amber (hollow ◌)
    * exited: gray #6b7280 (hollow ◌)
    * orphaned: dotted border, dimmed
  * artifact text: #9cdcfe (file blue)
  * scroll lock borders: dim blue #2a5a9a (follow), dim amber #8a6a2a (read)
  * font: Menlo, Monaco, monospace, 14px
  * active card: #37373d bg, #007acc left border


* milestones (sequenced for learning)

  * M0 — design sprint ✅
    * 0100-design-sprint — layout validated, napkin-as-UI, Quake kanban

  * M1 — storage
    * 0200-sqlite-setup
      * better-sqlite3, init scripts, schema
      * store sessions with CC session UUIDs
      * nap start flow updated: generate UUID, pass --session-id
    * 0300-status-api
      * single API: SQLite update + symlink move
      * used by CLI and app

  * M2 — real layout (built in layers)
    * 0400-layout-with-mock-data
      * three-column React layout
      * hardcoded data, match design sprint mocks
      * input: design sprint HTML mocks + v2-final screenshot
    * 0500-filesystem-service
      * main process: fs.watch on 30-napkins/ (recursive)
      * reads dirs, artifacts, first N lines of .nap.md
      * pushes updates to renderer via IPC
    * 0600-live-wiring
      * connect filesystem service to React components
      * sidebar reads from store (fed by fs service + SQLite)
      * kanban overlay reads napkin bullets + statuses

  * M3 — session continuity
    * 0700-clean-quit
      * save UI state to SQLite on quit
      * restore on launch: active nepic, active terminal, sidebar
    * 0800-architect-resume
      * auto `claude --resume <uuid>` on app reopen
      * agent "was running" states (orphaned dot style)
    * 0900-reconciliation
      * filesystem walk vs SQLite on launch
      * match/new/orphan handling

  * M4 — nepic spaces
    * 1000-nepic-creation
      * (+) button, scaffold dirs, SQLite insert, architect boot
    * 1100-nepic-switching
      * gutter click swaps middle column + terminal


* out of scope
  * collaborative editing (multiple humans)
  * cloud sync / remote agents
  * auto-unfolding pipeline
  * agent-to-agent communication beyond start/done/nap
  * visual diff of napkin changes
  * mobile / web version
  * poke as Enter — v3 collaboration patterns
  * auto-resume all agents on restart (fast-follow)
  * drag-to-reorder in kanban (future)
