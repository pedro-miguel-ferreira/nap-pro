* technical journeys — systems and seams behind each story beat
  * companion to: `30-napkins/0100-design-sprint/agents/003-ux-design-review/journeys.nap.md`
  * same J1-J5 structure, same moments
  * each beat gets: what systems interact, what data flows, where it's tricky


* J1: the spark

  * clicking (+)
    * app creates new nepic
      * SQLite: insert into nepics (id, name, slug, created_at)
      * filesystem: scaffold `.nap/nepics/NN-name/` with template dirs
        * 10-docs/, 15-feedback/, 20-architects/, 30-napkins/, 40-board/
        * 40-board/ subdirs: 10-draft/ through 60-done/
      * 20-architects/001-architect/ created with prompt.md + onboarding/
    * UI switches to new nepic
      * store: activeNepicId changes
      * sidebar: clears, shows empty state for new nepic
      * gutter: new icon appears, highlighted
    * architect boots up
      * pty spawned: `claude --verbose "read .../001-architect/prompt.md ..."`
      * session created in SQLite with nepic_id
      * terminal appears in sidebar, pinned at top
    * onboarding package generation
      * skill/workflow concern — reads previous nepic's state
      * writes: project summary, codebase overview, lessons, v(N+1) direction
      * TBD: autonomous or human-reviewed?
    * systems: SQLite, filesystem scaffolding, pty spawn, store, onboarding skill

  * the conversation (architect + human brainstorm)
    * just a Claude Code session — no special app mechanics
    * architect reads mega napkin, pushes back, stress-tests
    * the app's role: terminal is visible, scrollback is there, human can read it
    * Claude Code IS the system
    * systems: pty, xterm buffer, terminal-registry

  * the mega-napkin takes shape
    * architect writes to `10-docs/01-inputs.nap.md`
    * file write from inside Claude Code — no app involvement
    * human reads in editor (VS Code, Cursor, etc.)
    * human comments inline with `//`
    * architect reads comments, adjusts
    * systems: filesystem (editor is the UI), Claude Code file tools

  * the stress test
    * same as conversation — no new systems
    * napkin is a file, iteration is editing a file


* J2: the unfolding

  * architect breaks mega-napkin into feature napkins
    * for each feature:
      * filesystem: create `30-napkins/NNNN-feature/`
      * filesystem: write `NNNN-feature.nap.md` (extracted from mega-napkin)
      * filesystem: create symlink in `40-board/10-draft/`
      * SQLite: insert napkin metadata (slug, status, created_at)
    * sidebar: napkin cards appear as collapsed bullets
      * `* 0100-design-sprint  draft`
      * store reads napkin list from SQLite + artifact list from filesystem
    * systems: filesystem, SQLite, symlinks, store, sidebar render

  * sequencing
    * architect moves symlinks to reflect priority
      * `rm 40-board/10-draft/0100-feature`
      * `ln -s ../../30-napkins/0100-feature 40-board/20-backlog/0100-feature`
      * SQLite: update status
    * kanban overlay reflects new positions
    * systems: symlinks, SQLite, board overlay

  * human reviews the split
    * human reads napkins in editor, adds // comments
    * architect reads comments in Claude Code, adjusts
    * no app systems — editor + Claude Code
    * sidebar shows current state — that's the feedback loop
    * systems: filesystem, sidebar render


* J3: the pipeline

  * architect picks up first napkin
    * symlink moves to `40-board/40-doing/`
    * SQLite: status update
    * sidebar: card status badge changes

  * spec
    * architect writes `NNNN-feature.spec.md` — Claude Code file write
    * no app systems, pure Claude Code + filesystem

  * test architecture agent
    * architect creates agent dir: `30-napkins/NNNN/agents/001-test-arch/`
    * architect writes prompt.md
    * `nap start 'claude --verbose "read .../prompt.md ..."' --name 001-test-arch`
      * main process: create session in session-store (+ SQLite)
      * main process: spawn pty with command
      * main process: set NAP_SESSION_ID env var
      * IPC: socket:terminal-created → renderer
      * renderer: create xterm instance, add to registry, add to store
      * sidebar: new dot appears under napkin card — green, pulsing
    * architect waits: `nap nap 001-test-arch --timeout 300`
      * CLI polls socket every 1s
      * blocks until status = done or exited
    * agent calls `nap done`
      * CLI reads NAP_SESSION_ID from env
      * socket request: mark session done, poke parent with message
      * main process: update session-store (+ SQLite), send IPC
      * renderer: dot turns blue
    * architect reads response.md
    * systems: nap CLI, socket server, session-store, SQLite, pty, IPC, store, sidebar

  * implementation agent
    * same launch pattern as test architect
    * agent reads spec + test.md — shapes code for testability
    * agent calls `nap done` — same flow

  * test engineer agent
    * same launch pattern
    * runs tests, reports failures
    * failures route back to fs-eng — architect launches new agent or pokes existing
    * iterate loop: test fails → fix → re-test → green
    * systems: same + test infrastructure (vitest, playwright)

  * multiple napkins in parallel
    * architect launches agents across napkins simultaneously
    * 9+ agents running, each with own pty, own xterm, own session
    * sidebar shows all dots — density test for the UI
    * architect terminal shows orchestration log
    * kanban DOING column has multiple cards with pulsing dots


* J4: the nap

  * you come back. you open the app.
    * app launch sequence
      * main process: read `.nap/nap.db` (SQLite)
      * restore: active nepic, session list, agent relationships, statuses
      * restore statuses to what they were when app closed
        * CC sessions are persistent — we have UUIDs for all agents
        * on restart: sessions resume where they stopped, statuses are accurate
      * auto-resume architect: `claude --resume <session-key>`
      * agent resume (fast-follow, not v2 scope)
        * send "pls continue" to each agent that was running
        * requires `claude --resume` per agent — works but adds complexity
        * for now: agents show as "was running when you left", manual resume
      * create window, load renderer
      * renderer: reads state from main via IPC → zustand hydrates
    * systems: SQLite, session-store, IPC hydration, pty spawn

  * architect is single pane of glass
    * architect terminal is default on launch
      * store.activeTerminalId restored from SQLite
      * terminal created, pty spawned with resume command
      * DOM reparent into right panel
    * architect catches you up — summarizes what happened
      * prompt engineering: architect role doc says to summarize on resume
    * systems: terminal-registry, store, architect prompt

  * Cmd+` — board slides down
    * overlay component, full width, above terminal
      * reads napkin statuses from SQLite
      * reads napkin names from filesystem (readdir)
      * renders kanban columns
    * systems: SQLite queries, React overlay, filesystem readdir

  * you click → on a card in the kanban
    * board dismisses (overlay closes)
    * sidebar scrolls to napkin, card focuses with highlight
      * store.setActive(agentId) → terminal switches via DOM reparent
      * sidebar scroll-into-view with animation
    * terminal shows agent — full scrollback if app didn't restart
      * xterm buffer is in-memory only
      * CC session history is persistent — agent has full context regardless
    * systems: store, terminal-registry, sidebar, xterm buffer

  * reviewing completed work
    * human reads spec/code in editor
    * human adds // comments
    * architect reads, explains, adjusts
    * napkin moves to done — symlink + SQLite update
    * systems: filesystem, editor, symlinks, SQLite


* J5: the ship

  * architect succession
    * architect context is full — token count high, responses slower
    * architect writes handoff to own folder: `20-architects/001-architect/handoff.md`
      * state of each napkin, decisions + why, what's stuck
    * new architect dir: `20-architects/002-architect/`
    * new session spawned, reads onboarding + predecessor's handoff
    * old architect session stays in SQLite — can still be poked
      * `nap poke 001-architect "why did you spec 0200 that way?"`
      * old pty may be dead — `claude --resume` to bring it back
    * systems: filesystem, SQLite, pty spawn, nap poke

  * clicking (+) — new nepic
    * same as J1 clicking (+) — full cycle
    * previous nepic visible in gutter, browsable, read-only
    * gutter: new icon, old ones stay
    * systems: same as J1 spark


* cross-cutting concerns

  * IPC volume under load
    * 10+ agents = 10+ ptys streaming output via IPC
    * each pty:data event → IPC → xterm.write
    * only active terminal renders — others buffer in xterm silently
    * but IPC still fires for all — main process is routing all streams
    * the concern: if an agent dumps large output (verbose build, test suite),
      that's a burst of IPC messages on top of all other agents' streams
    * Electron IPC is async postMessage under the hood — no true backpressure
    * in practice v1 handled 10 terminals fine
    * mitigation if needed: batch pty:data events (accumulate N ms, send chunk)
    * monitor: input lag on architect terminal while agents are busy

  * SQLite init
    * no migration framework for v2 — wipe and re-init for testing
    * init scripts create tables from scratch
    * keep schema creation in one place — easy to evolve
    * migration framework when we have real persistent data worth preserving
