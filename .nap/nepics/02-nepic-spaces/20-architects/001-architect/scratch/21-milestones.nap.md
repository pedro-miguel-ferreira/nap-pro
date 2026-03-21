* nap v2 — milestones optimized for learning

* real unknowns
  * features instead of terminals — changes how you work?
    * v1 sidebar dead simple, maybe feature not a bug?
  * persistence changes behavior?
    * do you use the app differently when closing it isn't death?
  * dual-truth model (SQLite status, filesystem content) — clean or fight?
  * cheap pivots (nepic spaces) — changes version transitions or just overhead?
  * architect handoff/resume — preserves momentum?
    * or new architect always starts slow?

* think we know, haven't proven
  * three-column layout works at this scale
  * kanban adds value beyond tree view
  * filesystem watching reliable enough for live updates

* DO know (carry forward)
  * terminal management — xterm + WebGL + node-pty solid
  * socket + CLI — protocol proven
  * pipeline — four roles, napkin → spec → test → code

* M1 — the spatial shift
  * question: structured project view changes how you see the work?
  * build
    * three-column layout
    * napkin browser reads filesystem (no SQLite yet)
    * tree view: features → artifacts → agents
    * click agent → terminal
  * learn
    * navigate by feature or still by terminal name?
    * 300px enough?
    * tree feels like dashboard or noise?
    * left gutter (empty, no nepic switching yet) — right spatially?
  * value: open NAP, see your project — not a wall of terminal names
  * why first
    * riskiest UI bet
    * structured view doesn't feel right?
      * everything downstream changes
    * cheapest to learn before persistence

* M2 — persistence
  * question: what changes when state survives app restart?
  * build
    * better-sqlite3
    * sessions, agents, napkin metadata in SQLite
    * napkin browser reads status from DB, content from filesystem
  * learn
    * persistence changes usage pattern?
      * close the app more freely?
    * dual-truth model causes confusion?
    * crash reopen vs clean quit — what breaks?
    * native module rebuild — how painful?
  * value: close laptop, come back tomorrow, project still there
  * why second
    * M1 proves UI concept with filesystem data
    * M2 swaps in real backend
    * M1's tree view doesn't work?
      * reshape before investing in persistence

* M3 — session continuity
  * question: can you pick up mid-thought?
  * build
    * store architect session IDs
    * auto-resume via `claude --resume` on app reopen
    * reconnect agent tree from SQLite
    * "this agent was running when you left" states
  * learn
    * `claude --resume` reliable enough as default?
    * what context is actually lost on resume?
    * does the architect feel continuous?
      * or like a new conversation with no continuity?
    * handoff docs less critical?
  * value
    * "close and resume" works end-to-end
    * first time NAP feels like persistent environment, not session
  * why third
    * depends on M2 (session IDs in SQLite)
    * where we learn: persistence "nice to have" or "changes everything"

* M4 — nepic spaces
  * question: cheap pivots change how you approach projects?
  * build
    * left gutter → nepic switcher
    * (+) creates new space — fresh architect, fresh napkins, same codebase
    * switching nepics swaps middle column and terminal
  * learn
    * how often do you create nepics?
    * "easy as having a new idea" — or overhead?
    * new architect benefits from onboarding — or feels like starting over?
    * look back at old nepics or never touch them?
  * value
    * version transitions = button click
    * supports how projects actually evolve — eras, not one push
  * why fourth
    * second big shift, depends on everything above (UI, persistence, resume)
    * M1-M3 don't validate?
      * nepic spaces might need different shape

* M5 — board view
  * question: second view mode adds value — or tree view sufficient?
  * build
    * kanban toggle in middle column
    * status columns
    * compact cards
  * learn
    * do you use it? how often?
    * "glance at status" faster in kanban than tree?
    * drag-to-reorder matter?
  * value: project status at a glance, no mental tree-walking
  * why last
    * lowest risk, lowest uncertainty
    * view layer on data that already exists
    * nice to have, not load-bearing

* the thread
  * each milestone's answer shapes the next
  * M1 reveals tree view too noisy?
    * → M2's schema changes
  * M2 shows dual-truth causes sync bugs?
    * → M3's resume logic changes
  * M3 shows resume unreliable?
    * → M4's architect handoff becomes more critical

* open: poke bug
  * v1 bug, but fundamental to architect → agent workflow
  * quick fix or deep rabbit hole — unknown
  * investigate before M1, so agents work during development
