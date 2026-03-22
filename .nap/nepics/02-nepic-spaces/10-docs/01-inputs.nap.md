* nap v2 — nepic spaces

* what it proves
  * structured project view replaces flat terminal sidebar
    * napkin bullets as UI — sidebar renders `*` format, not cards
    * 40 napkins scannable in one column, density holds at scale
  * SQLite persistence — state survives restart
  * CC session resume — architect picks up mid-thought
  * nepic spaces — pivot as cheap as having an idea

* what carries over unchanged
  * terminal — xterm.js + Canvas addon + node-pty + IPC bridge
    * DOM reparenting for switching
    * 100k scrollback
  * socket server + CLI
    * per-project socket at `.nap/sock`
    * ndjson protocol, request-response
  * electron-vite + TypeScript strict + React 18 + zustand
  * test infrastructure — vitest (small) + playwright (medium)


* three-column layout

  * left gutter (~60px)
    * nepic switcher — vertical icon stack
    * P — previous era (POC, retired)
    * S — active era (highlighted with white bar)
    * (+) — sits where the next nepic would appear
      * not a button at the bottom — it's the next thing in the sequence
      * click → fresh space, fresh architect, same codebase

  * middle column — the sidebar
    * a napkin rendering itself as an interactive surface
      * `*` bullets, nesting, labels — same format as the documents it navigates
    * the project as a scannable document
      * each line: name, agent dots, napkin phase
      * green dots pulse — agents actively working
      * read the entire project state without clicking anything
    * Cmd+K filter (substring, case-insensitive)

    * architects pinned at top
      * 002-nova — active, running, managing everything
      * 001-architect — retired but still there
        * click to read historical context
        * poke to pull knowledge from their deeper history
      * separated from napkins — the control plane, not a feature

    * napkin cards — three states, progressive disclosure
      * collapsed — one line
        * `* 0200-sqlite-persistence ●● doing`
        * scan 40 napkins in 40 lines
      * focused — click to expand in place
        * artifacts as `*` bullets
          * nap.md, spec.md, test.md
          * click → open in editor (shell.openPath)
        * agents as directories with status dots
          * `* 001-test-architect/ ● done`
          * `* 002-fs-eng/ ● run` (green, pulsing)
          * `* 003-test-eng/ ◌ nap` (amber, hollow)
          * click agent → switch terminal
        * rest of 40 napkins still visible below as one-liners
          * never lose the forest for the tree
      * extended (Cmd+E) — filesystem snapshot
        * full file names visible
          * `0100-design-sprint.nap.md`
          * `0100-design-sprint.spec.md`
        * agent directories expand to show contents
          * `[terminal]` — click to open live session
            * italic, bracketed — signals action, not file
          * prompt.md, response.md — the actual artifacts
        * file controls on hover
          * ⎘ copy relative path
          * ↗ open in editor
        * same visual language at every zoom level
          * bullets all the way down

  * right panel (fills rest)
    * terminal — same as v1
    * default: architect terminal
    * click agent in sidebar → switches via DOM reparent
    * breadcrumb navigation in header
      * `S > 0100-design-sprint > FS-100`
      * click S → back to architect
      * click napkin name → refocus card in sidebar
      * spatial context — always know where you are
    * all v1 features preserved
      * Canvas rendering, 100k scrollback, addon-fit
      * scroll lock (follow / read)
      * clickable file paths (Cmd+click)


* kanban overlay (Cmd+`)

  * Quake console — slides down from top, full width
    * terminal stays underneath, untouched
    * a HUD, not a replacement

  * five columns: backlog → todo → doing → review → done
    * count per column in header: DOING (7)
    * the distribution IS the information
      * where the weight is, where the gaps are

  * cards
    * collapsed (default)
      * name + agent dots + → navigation arrow
      * see the shape of the entire version at a glance
    * expanded (click card name)
      * first-level `*` bullets from .nap.md
        * the actual ideas, not just status labels
        * napkin format carries through even here
      * artifact badges: nap spec test journeys
        * filled = exists, dimmed = not yet
        * see how far along the pipeline each feature is
      * agent dots — who's working, who's done

  * → navigation
    * click → on any card
    * board slides away
    * sidebar scrolls to that napkin, blue flash
    * terminal switches to best agent
    * one click: overview → deep work

  * read-only for v2
    * drag-to-reorder is future


* two orthogonal status systems
  * napkin status (project phase)
    * backlog → todo → doing → review → done
    * shown on kanban columns, shown as badge on sidebar cards
    * stored in SQLite, synced to board symlinks
  * agent status (runtime state)
    * running ● green (filled, pulsing)
    * done ● blue (filled)
    * napping ◌ amber (hollow)
    * exited ◌ gray (hollow)
    * orphaned — dotted border, dimmed (lost annotation)
  * orthogonal: agents active at any project phase


* persistence model — annotation layer

  * two sources, strict separation
    * filesystem — defines what exists
      * napkin dirs, agent dirs, specs, prompts, responses
      * append-only: created, never renamed, never deleted
      * human reads and edits in editor
    * SQLite — annotates what exists
      * statuses, CC session UUIDs, timestamps, relationships
      * keyed by stable path (napkin_slug + agent_dir_name)
      * app reads for sidebar, kanban, resume

  * the model
    * filesystem defines what exists
    * SQLite adds metadata to what filesystem shows
    * like git notes — commits exist independently, notes annotate
    * no sync watchers for structure, no conflict resolution

  * design principles
    * filesystem changes can't corrupt SQLite
      * worst case: orphaned rows (hidden, harmless)
    * SQLite loss can't corrupt filesystem
      * delete nap.db → metadata gone, project untouched
      * reconciliation rebuilds from filesystem
    * reconciliation is additive, never destructive
    * "what exists?" → filesystem
    * "what's the status?" → SQLite

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
      * id (uuid), nepic_id
      * napkin_slug (nullable — architect has no napkin)
      * name, role (architect/test-arch/fs-eng/test-eng)
      * status (running/done/exited)
      * cc_session_uuid
        * pre-assigned by NAP (crypto.randomUUID)
        * passed to claude via `--session-id <uuid>`
        * enables `claude --resume <uuid>` later
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
    * performance: 40 napkins × 3 agents = milliseconds

  * board symlinks
    * `40-board/` dirs with symlinks to `30-napkins/`
    * one API for status changes
      * updates SQLite + moves symlink together
      * used by CLI and app
    * symlinks are editor lenses
      * `ls 40-board/40-doing/` in terminal
      * browse project status without opening app


* filesystem service

  * main process watches `30-napkins/` via fs.watch (recursive)
  * on change: re-read affected napkin dir
    * readdir → artifact existence (.nap.md, .spec.md, etc.)
    * read first N lines of .nap.md → kanban card bullets
    * push update to renderer via IPC
  * renderer updates store → React re-renders sidebar + kanban
  * catches everything
    * agent file writes, human edits, git operations
  * `30-napkins/` is small and stable — watching is cheap


* CC session management

  * launch flow
    * NAP generates UUID
    * stores in SQLite (sessions.cc_session_uuid)
    * spawns: `claude --session-id <uuid> --verbose "read prompt.md ..."`
    * UUID known before session starts — no parsing needed

  * resume flow
    * architect: auto-resume on app restart
      * `claude --resume <uuid>` in architect terminal
      * full conversation history preserved
    * agents: manual for v2
      * UI shows orphaned dot style — "was running when you left"
      * human can click → resume
      * auto-resume all = fast-follow napkin

  * retired architects
    * old architect session stays in SQLite
    * visible in sidebar, browsable
    * `claude --resume <uuid>` to bring back
    * poke for historical context


* nepic spaces

  * each nepic = one milestone/era
    * own napkins, architect, roadmap
    * same codebase

  * clicking (+) — new nepic
    * scaffold `.nap/nepics/NN-name/`
      * 10-docs/, 15-feedback/, 20-architects/, 30-napkins/, 40-board/
    * SQLite: insert nepic, set is_active
    * architect boots: pty spawned, session created
    * onboarding package generation
      * skill/workflow concern, not app code
      * TBD: autonomous or human-reviewed

  * switching nepics
    * click icon in gutter
    * sidebar swaps to that nepic's browser
    * terminal swaps to that nepic's architect
    * all sessions from other nepics keep running

  * architect lifecycle
    * runs out of context → writes handoff to own folder
      * `20-architects/001-architect/handoff.md`
    * new architect: `002-architect/`, reads predecessor's handoff
    * old architect: retired, browsable, resumable


* nap start flow (updated)
  * CLI sends start request via socket
  * main process:
    * generate CC session UUID
    * create session in SQLite with UUID
    * spawn pty: `claude --session-id <uuid> --verbose "..."`
    * set NAP_SESSION_ID env var
    * IPC: notify renderer
  * renderer: create xterm, add to registry + store
  * sidebar: new dot appears under napkin card


* status change API
  * single function: changeNapkinStatus(slug, newStatus)
    * updates SQLite napkins table
    * moves symlink in `40-board/`
    * IPC: notify renderer
  * used by CLI and app


* clean quit flow
  * on before-quit
    * save UI state to SQLite
    * session statuses already accurate
    * kill ptys, wait for exit callbacks (2s timeout)
    * close SQLite connection
  * crash: no special handling
    * reconciliation handles stale state on next launch


* design language (carry from v1)
  * dark theme: #1e1e1e bg, #252526 sidebar, #3c3c3c borders
  * status dots
    * running: green #22c55e (filled ●, pulsing)
    * done: blue #3b82f6 (filled ●)
    * napping: amber (hollow ◌)
    * exited: gray #6b7280 (hollow ◌)
    * orphaned: dotted border, dimmed
  * artifact text: #9cdcfe (file blue)
  * scroll lock borders: dim blue #2a5a9a, dim amber #8a6a2a
  * font: Menlo, Monaco, monospace, 14px
  * active card: #37373d bg, #007acc left border


* milestones

  * M0 — design sprint ✅
    * 0100-design-sprint — validated

  * M1 — storage
    * 0200-sqlite-setup
      * better-sqlite3, init scripts, schema
      * store sessions with CC session UUIDs
      * nap start updated: generate UUID, pass --session-id
    * 0300-status-api
      * single API: SQLite + symlink together
      * used by CLI and app

  * M2 — real layout (built in layers)
    * 0400-layout-with-mock-data
      * three-column React layout, hardcoded data
      * input: design sprint HTML mocks + screenshots
      * match v2-final.html exactly
    * 0500-filesystem-service
      * fs.watch on 30-napkins/ (recursive)
      * reads dirs, artifacts, .nap.md content
      * pushes updates via IPC
    * 0600-live-wiring
      * connect fs service to React components
      * sidebar: napkin list + agent dots from store
      * kanban overlay: napkin bullets + statuses
      * breadcrumb navigation in terminal header

  * M3 — session continuity
    * 0700-clean-quit
      * save UI state to SQLite on quit
      * restore on launch
    * 0800-architect-resume
      * auto `claude --resume <uuid>` on reopen
      * agent "was running" states
    * 0900-reconciliation
      * filesystem walk vs SQLite on launch
      * match / new / orphan handling

  * M4 — nepic spaces
    * 1000-nepic-creation
      * (+) button, scaffold dirs, SQLite insert, architect boot
    * 1100-nepic-switching
      * gutter click swaps middle + terminal


* out of scope
  * collaborative editing (multiple humans)
  * cloud sync / remote agents
  * auto-unfolding pipeline
  * agent-to-agent communication beyond start/done/nap
  * visual diff / history per agent (future virtual entries)
  * mobile / web version
  * poke as Enter — v3 collaboration
  * auto-resume all agents (fast-follow)
  * drag-to-reorder in kanban
