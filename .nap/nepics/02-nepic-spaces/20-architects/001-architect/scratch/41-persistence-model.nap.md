* persistence model — what's stored, where, how they reconcile

* two layers, strict separation
  * filesystem — defines what exists
    * structure: napkin dirs, agent dirs, board symlinks
    * content: .nap.md, .spec.md, .journeys.md, .test.md, prompt.md, response.md
    * append-only by convention
      * dirs created, never renamed, never deleted
      * this is what makes the annotation model safe
      * if someone renames — not destructive, just loses annotations
    * human reads and edits in editor
      * the editor IS the UI for content
      * VS Code, Cursor — first-class interfaces
  * SQLite — annotates what exists
    * runtime metadata: statuses, CC session UUIDs, timestamps
    * keyed by stable filesystem path
      * key = nepic_slug + napkin_slug + agent_dir_name
      * stable because dirs are append-only
    * the app reads SQLite to render
      * sidebar: which napkins, which agents, what status
      * kanban: napkin statuses grouped by phase
      * resume: CC session UUIDs for `claude --resume`

* the annotation model — why this works
  * SQLite doesn't define what exists — filesystem does
  * SQLite adds metadata to what filesystem shows
  * like git notes on commits
    * commits exist independently
    * notes annotate them
    * delete all notes → commits still there
    * delete the commit → note is orphaned, harmless
  * no sync watchers needed
    * no chokidar, no fs.watch for structure
    * reconcile once on launch, done
  * no conflict resolution needed
    * filesystem wins for "what exists"
    * SQLite wins for "what status is it"
    * they never compete on the same question

* SQLite schema

  * nepics
    * id (uuid)
    * name, slug
    * created_at
    * is_active (boolean, only one true at a time)
    * the slug matches the dir name: `02-nepic-spaces`

  * napkins
    * id (uuid)
    * nepic_id → nepics.id
    * slug — matches dir name: `0100-design-sprint`
    * status: draft / backlog / todo / doing / review / done
      * this is the project phase, shown on kanban
      * orthogonal to agent runtime status
    * created_at

  * sessions
    * id (uuid)
    * nepic_id → nepics.id
    * napkin_slug — which napkin this agent works on
      * nullable: architect has no napkin
    * name — display name, e.g., `001-test-arch-sqlite`
    * role: architect / test-arch / fs-eng / test-eng
      * architect is just a role, not a separate table
      * but: only one architect active per nepic at a time
        * enforced by app logic, not DB constraint
    * status: running / done / exited
      * this is runtime state, shown as dots
      * orthogonal to napkin project phase
    * cc_session_uuid
      * pre-assigned by NAP before launch
      * passed to claude via `--session-id <uuid>`
      * stored so we can `claude --resume <uuid>` later
      * the key unlock for session persistence
    * parent_id → sessions.id (nullable)
      * architect's parent is null
      * agents' parent is the session that launched them
      * enables parent-child tree in sidebar
    * command — the full command string passed to pty
    * cwd — working directory
    * created_at, exited_at

  * ui_state (single row, or key-value)
    * active_nepic_id
    * active_terminal_id
      * which agent's terminal was focused when app closed
      * restored on launch → right panel shows correct terminal
    * sidebar_visible (boolean)
    * sidebar_scroll_position — nice-to-have, pixel offset

* filesystem structure (what SQLite annotates)
  * napkin content — human-editable, agent-writable
    * `30-napkins/NNNN-feature/`
      * `NNNN-feature.nap.md` — the napkin
      * `NNNN-feature.spec.md` — min spec
      * `NNNN-feature.journeys.md` — user/developer journeys
      * `NNNN-feature.test.md` — test architecture
      * `agents/`
        * `001-role-subject/`
          * `prompt.md` — architect writes
          * `response.md` — agent writes
          * `questions.md` — agent writes if stuck
  * board symlinks — pre-SQLite status tracking
    * `40-board/10-draft/0100-feature → ../../30-napkins/0100-feature`
    * once SQLite owns status, symlinks become editor lenses
      * still useful: `ls 40-board/40-doing/` shows what's in progress
      * app updates symlinks when SQLite status changes
      * human can browse in editor without opening the app

* reconciliation on launch
  * runs once, every startup, before rendering
  * the algorithm
    * walk `30-napkins/` → list of napkin dirs that exist
    * for each napkin dir, walk `agents/` → list of agent dirs
    * for each dir, look up SQLite by key
    * three outcomes:
      * match found
        * reconnect: render with stored status, UUID, timestamps
        * this is the happy path — most common
      * dir exists, no SQLite entry
        * new: create entry with default status
        * napkin → status: draft
        * agent → status: not started, no UUID
      * SQLite entry exists, no dir
        * orphaned: hide from UI, keep in SQLite
        * don't delete — dir may come back (branch switch)
        * orphaned rows are invisible, harmless, negligible space
  * performance
    * 20 napkins × 3 agents each = 60 readdir calls + 60 SQLite lookups
    * milliseconds — not a concern
    * scales to hundreds before it matters

* CC session management
  * launch flow
    * NAP generates UUID (crypto.randomUUID())
    * stores in SQLite: sessions.cc_session_uuid
    * spawns: `claude --session-id <uuid> --verbose "read prompt.md ..."`
    * UUID known before session starts — no parsing output
  * resume flow
    * architect: auto-resume on app restart
      * `claude --resume <uuid>` in architect terminal
      * seamless: architect has full conversation history
    * agents: manual for v2
      * UI shows "was running when you left" with orphaned dot style
      * human can click → resume manually
      * auto-resume all = fast-follow napkin
        * straightforward: iterate sessions where status=running, spawn `claude --resume` for each
        * but: adds complexity, want to validate single-resume first
  * fork (future potential)
    * `claude --fork-session` with `--resume`
    * creates new session with copied history
    * useful for: agent retry from checkpoint, branching exploration
    * not v2 scope, but the UUID model supports it cleanly

* branch switch scenario
  * on main: 10 napkins, 30 agents, all annotated
  * `git checkout feature-branch` — different `30-napkins/` content
  * open app → reconciliation
    * filesystem walk finds 3 napkins
    * SQLite matches 3, orphans 7
    * UI shows 3 napkins, everything works
  * `git checkout main` → open app
    * filesystem walk finds 10
    * all 10 reconnect to their SQLite entries
    * statuses, UUIDs, timestamps — all back, nothing lost
  * the key: SQLite rows are never deleted
    * they hibernate when their dir is absent
    * they wake up when their dir returns

* rename scenario
  * someone renames `0100-old-name/` to `0100-new-name/`
  * on launch
    * `0100-new-name` found on filesystem, no SQLite match → new entry
    * `0100-old-name` in SQLite, no dir → orphaned, hidden
  * agents inside the renamed dir
    * key was `old-name + 001-test-arch` → no match under new-name
    * agents show as orphaned — distinct visual, not "new"
      * dotted border, dimmed text, "disconnected" indicator
      * can still read prompt.md/response.md (files are there)
      * can't resume CC session (UUID link broken)
  * old SQLite entries: hidden, not deleted
    * if someone renames back → everything reconnects
  * work product untouched
    * specs, responses, code — all on filesystem
    * loss is runtime metadata only

* what doesn't persist (and that's ok)
  * pty processes — dead on quit
    * re-created on resume via `claude --resume`
  * xterm scrollback — in-memory only
    * CC session history is persistent — agent has full context
    * visual scrollback is convenience, not critical
  * scroll lock state per terminal — re-derive on focus
  * message queue — ephemeral by nature

* SQLite init (v2 approach)
  * no migration framework
    * wipe and re-init for testing
    * `nap.db` is disposable during development
  * init script
    * one file: `CREATE TABLE IF NOT EXISTS ...` for all tables
    * runs on startup if tables don't exist
    * idempotent — safe to run multiple times
  * when migration matters
    * when real users have real data worth preserving
    * then: version table + sequential migration files
    * not v2 scope

* design principles — the rules that make this safe
  * filesystem changes can't corrupt SQLite
    * worst case: orphaned rows (hidden, harmless)
  * SQLite loss can't corrupt filesystem
    * delete nap.db → metadata gone, project structure untouched
    * re-create db → reconciliation rebuilds from filesystem
    * only loss: CC session UUIDs (can't resume), statuses (reset to default)
  * reconciliation is additive, never destructive
    * never deletes rows
    * never deletes files
    * only creates new entries or hides orphans
  * two layers answer different questions
    * "what exists?" → always filesystem
    * "what's the status?" → always SQLite
    * they never compete
