* persistence model — what's stored, where, and how they reconcile

* two layers
  * filesystem — what exists (structure + content)
    * napkin dirs, agent dirs, specs, prompts, responses
    * append-only: created, never renamed, never deleted
    * human reads and edits in editor
  * SQLite — annotations on what exists (runtime metadata)
    * statuses, CC session UUIDs, timestamps, relationships
    * keyed by stable filesystem path (napkin_slug + agent_dir_name)
    * app reads for rendering sidebar, kanban, resume

* the annotation model
  * SQLite doesn't define what exists — filesystem does
  * SQLite adds metadata to what filesystem shows
  * like git notes on commits — commits exist independently, notes annotate
  * no sync watchers, no conflict resolution, no distributed consistency

* what's stored where

  * SQLite tables
    * nepics
      * id, name, slug, created_at, is_active
    * napkins
      * id, nepic_id, slug, status (draft/backlog/todo/doing/review/done)
      * created_at
    * sessions
      * id, nepic_id, napkin_slug, name, status (running/done/exited)
      * cc_session_uuid — pre-assigned by NAP, passed via `--session-id`
      * parent_id, role, command, cwd
      * created_at, exited_at
    * ui_state (key-value or single row)
      * active_nepic_id, active_terminal_id, sidebar_visible

  * filesystem
    * napkin content: .nap.md, .spec.md, .journeys.md, .test.md
    * agent artifacts: prompt.md, response.md, questions.md
    * board symlinks in 40-board/ (pre-SQLite status tracking)
    * onboarding packages, handoffs

* reconciliation on launch
  * one pass, on startup, every time
  * walk `30-napkins/` — these are the napkins that exist right now
  * walk each napkin's `agents/` — these are the agents that exist
  * match against SQLite by key (napkin_slug + agent_dir_name)
    * match found → reconnect, render with stored status and UUID
    * no match in SQLite → new entry, default status
    * SQLite entry but no dir → orphaned, hide from UI, don't delete row

* CC session management
  * NAP generates UUID before agent launch
  * stores UUID in SQLite (cc_session_uuid)
  * passes to claude via `--session-id <uuid>`
  * on app restart: `claude --resume <uuid>` for architect (auto)
  * agent resume: show "was running when you left", manual for now
    * auto-resume all agents = fast-follow napkin, not v2 scope
  * CC sessions are persistent — full conversation history survives restart

* branch switch scenario
  * on main: 10 napkins, 30 agents, all annotated in SQLite
  * switch to feature-branch: 3 napkins exist, different structure
  * open app → filesystem walk finds 3 → SQLite matches 3, orphans 7
  * UI shows 3 napkins. everything works.
  * switch back to main → open app → all 10 reconnect
  * statuses, UUIDs, timestamps — all back. nothing lost.

* rename scenario
  * someone renames `0100-old-name/` to `0100-new-name/`
  * on launch: new-name has no SQLite match → new entry, default status
  * agents inside show as orphaned — no resume capability, no status history
    * visually distinct: orphaned dot style (not "new", clearly disconnected)
  * old-name SQLite entries: hidden, not deleted
  * work product (specs, responses, code) is on filesystem, untouched
  * not destructive — just loss of runtime metadata for those agents

* what doesn't persist (and that's ok)
  * pty processes — dead on quit, re-created on resume
  * xterm scrollback — in-memory, CC session history covers context
  * scroll lock state — minor, re-derive
  * message queue — ephemeral

* SQLite init (v2 scope)
  * no migration framework — wipe and re-init for testing
  * init scripts create tables from scratch
  * keep schema creation in one place
  * migration framework later when we have real data worth preserving

* design principles
  * filesystem changes can't corrupt SQLite
  * SQLite entries can't prevent filesystem from working
  * reconciliation is additive, never destructive
  * worst case: stale annotations get hidden, not data loss
  * the only real loss: delete nap.db → metadata gone, project structure untouched
