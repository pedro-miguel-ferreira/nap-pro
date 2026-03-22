* nap v2 — milestones optimized for learning (revised)

* real unknowns
  * features instead of terminals — changes how you work?
    * v1 sidebar dead simple, maybe feature not a bug?
  * persistence changes behavior?
    * do you use the app differently when closing it isn't death?
  * dual-truth model (SQLite status, filesystem content) — clean or fight?
  * cheap pivots (nepic spaces) — changes version transitions or just overhead?
  * architect handoff/resume — preserves momentum?
    * or new architect always starts slow?

* things we think we know, but haven't proven
  * three-column layout works at this scale
  * kanban adds value beyond tree view
  * filesystem watching reliable enough for live updates

* carry forward (proven in v1)
  * terminal management — xterm + WebGL + node-pty solid
  * socket + CLI — protocol proven
  * pipeline — four roles, napkin → spec → test → code

* M0 — design sprint (standalone HTML mocks)
  * question: what does v2 feel like before we build it?
  * build
    * standalone HTML/CSS prototypes, no Electron
    * explore three-column layouts
      * napkin cards, agents nested inside, file links, status dots
    * board view: 2nd column with terminal visible — or full takeover?
    * mock nepics in left gutter — even placeholders make it click
  * learn
    * which layout makes you see your project at a glance?
    * 300px middle column — enough? too much?
    * board view — companion to tree, or replacement?
    * does the gutter with nepic icons feel like Slack workspaces?
  * value: cheapest possible validation — answer layout questions in hours, not weeks
  * why first
    * every implementation milestone depends on these answers
    * HTML mock costs nothing to throw away

* M1 — storage + state model
  * question: what is stored and what does it allow to restore?
  * build
    * better-sqlite3 setup, schema, migration strategy from day one
      * version table + migration files on startup
      * schema will change many times — add fields, rename, refactor
    * iterate on state model
      * brainstorm napkin: what approaches exist?
      * try 2-3 implementations, feel how each restores
      * pick one
  * learn
    * what makes an agent a NAP agent? (in ideal world)
    * what spatial/UI state needs persisting vs re-deriving?
    * clean quit → reopen: what's seamless? what's jarring?
      * clean quit first, crash recovery is P2/P3
    * native module rebuild — one-time cost if Electron version stays
  * value: close laptop, come back tomorrow, project still there
  * why before layout
    * fs-based browsing is brittle, throwaway (tests, integrations, all deleted)
    * SQLite from day one — one implementation, no rework
    * filesystem only for content listing (readdir, trivial)

* M2 — real layout
  * question: does structured project view change how you work?
    * napkin cards, agents nested, terminal activation, file links
  * build
    * three-column layout (informed by M0 designs)
    * napkin browser backed by SQLite from day one
    * click agent → terminal activation
    * content from filesystem (readdir for artifacts), status from SQLite
  * learn
    * navigate by feature or still by terminal name?
    * tree feels like dashboard or noise?
    * left gutter with mock nepics — right spatially?
  * value: open NAP, see your project — not a wall of terminal names
  * why after M1
    * layout needs real data, not mocks
    * SQLite is the foundation, layout is the surface

* M3 — session continuity
  * question: can you pick up mid-thought?
  * build
    * store architect session IDs in SQLite
    * auto-resume via `claude --resume` on app reopen
      * only thing we can rely upon
    * agent tree reconnection (separate napkin — focused exploration)
    * "this agent was running when you left" states
  * learn
    * does the architect feel continuous?
      * or like a new conversation with no continuity?
    * what context is actually lost on resume?
      * spatial/UI state? statuses? scrollback?
    * define "enough context" — what's the minimum for continuity?
    * handoff docs less critical if resume works?
  * value
    * "close and resume" works end-to-end
    * first time NAP feels like persistent environment, not session
  * why after M2
    * depends on SQLite (session IDs, agent relationships)
    * persistence "nice to have" or "changes everything" — this is where we find out
  * note: may need 2-3-4 napkins iterating on what "continuous" means
    * brainstorm approaches first, then implement and feel

* M4 — nepic spaces
  * question: cheap pivots change how you approach projects?
  * build
    * scaffolding + creation (folders, structures, templates)
      * ability to customize prompts separately from app changes
    * nepic switching UI (left gutter → real switcher)
    * onboarding package generation
      * prompting/workflow/skill problem, not app code
      * should strive for autonomous generation
  * learn
    * how often do you create nepics?
    * "easy as having a new idea" — or overhead?
    * new architect benefits from onboarding — or feels like starting over?
    * look back at old nepics or never touch them?
  * value
    * version transitions = button click
    * supports how projects evolve — eras, not one push
  * why after M3
    * nepics impossible without persistence
    * UI should be same shape for each space
    * M1-M3 don't validate?
      * nepic spaces might need different shape

* M5 — board view
  * question: second view mode adds value — or tree view sufficient?
  * build
    * kanban toggle or full takeover (answered in M0 design sprint)
    * status columns, compact cards
  * learn
    * do you use it? how often?
    * "glance at status" faster in kanban than tree?
    * drag-to-reorder matter?
  * value: project status at a glance, no mental tree-walking
  * why last
    * lowest risk, lowest uncertainty
    * doesn't depend on spaces
    * view layer on data that already exists
    * nice to have, not load-bearing
  * note: UI brainstorm can happen early in M0

* the thread
  * each milestone's answer shapes the next
  * M0 answers layout questions cheaply
    * → M2 implements with confidence
  * M1 defines what's stored
    * → M2 builds on real data, not throwaway fs plumbing
  * M2 reveals tree view too noisy?
    * → reshape before M3 invests in continuity
  * M3 shows resume unreliable?
    * → M4's architect handoff becomes more critical

* deprioritized: poke bug
  * not essential to happy path
  * start/done/nap work — poke is one collaboration pattern
  * v3 might be more about feedback loops and collaboration
