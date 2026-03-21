* nap v2 — milestones optimized for learning

* the real unknowns — things we genuinely don't know
  * does seeing features instead of terminals actually change how you work?
    * the v1 sidebar was dead simple — maybe that simplicity was a feature, not a bug
  * does persistence change behavior?
    * do you use the app differently when closing it isn't death?
  * is the dual-truth model (SQLite for status, filesystem for content) clean in practice — or do they fight?
  * does making pivots cheap (nepic spaces) actually change how you approach version transitions — or is it organizational overhead?
  * does architect handoff/resume actually preserve momentum — or does the new architect always start slow?

* things we think we know but haven't proven
  * three-column layout works at this scale
  * kanban adds value beyond tree view
  * filesystem watching is reliable enough for live updates

* things we DO know (carry forward, don't re-validate)
  * terminal management works — xterm + WebGL + node-pty is solid
  * socket + CLI works — the protocol is proven
  * the pipeline works — four roles, napkin → spec → test → code

* M1 — the spatial shift
  * question: does replacing the flat sidebar with a structured project view change how you see and manage the work?
  * build
    * three-column layout
    * napkin browser reads from filesystem (no SQLite yet)
    * tree view: features → artifacts → agents
    * click agent → terminal
  * learn
    * do you navigate by feature or still by terminal name?
    * is 300px enough?
    * does the tree feel like a dashboard or like noise?
    * does the left gutter (empty, no nepic switching yet) feel right spatially?
  * value delivered: you open NAP and see your project, not a wall of terminal names
  * why first
    * this is the riskiest UI bet
    * if the structured view doesn't feel right, everything downstream changes
    * cheapest to learn before we add persistence

* M2 — persistence
  * question: what changes when state survives app restart?
  * build
    * better-sqlite3
    * sessions, agents, napkin metadata in SQLite
    * napkin browser now reads status from DB, content from filesystem
  * learn
    * does persistence change your usage pattern — do you close the app more freely?
    * does the dual-truth model cause confusion?
    * what breaks when you reopen after a crash vs clean quit?
    * how painful is the native module rebuild story?
  * value delivered: close laptop, come back tomorrow, project is still there
  * why second
    * M1 proves the UI concept with filesystem data
    * M2 swaps in the real backend
    * if M1's tree view doesn't work, we reshape before investing in persistence

* M3 — session continuity
  * question: can you actually pick up mid-thought?
  * build
    * store architect session IDs
    * auto-resume via `claude --resume` on app reopen
    * reconnect agent tree from SQLite
    * show "this agent was running when you left" states
  * learn
    * is `claude --resume` reliable enough to be the default?
    * what context is actually lost on resume?
    * does the architect feel continuous or does it feel like a new conversation wearing the old one's clothes?
    * does this make handoff docs less critical?
  * value delivered
    * the "close and resume" workflow works end-to-end
    * first time NAP feels like a persistent environment, not a session
  * why third
    * depends on M2 (session IDs in SQLite)
    * this is where we learn whether persistence is "nice to have" or "changes everything"

* M4 — nepic spaces
  * question: does making pivots cheap actually change how you approach projects?
  * build
    * left gutter becomes a nepic switcher
    * (+) creates a new space — fresh architect, fresh napkin dir, same codebase
    * switching nepics swaps the middle column and terminal
  * learn
    * how often do you create nepics?
    * is it really "as easy as having a new idea" or does it feel like overhead?
    * does the new architect actually benefit from the onboarding package, or does it feel like starting over?
    * do you look back at old nepics or never touch them?
  * value delivered
    * version transitions are a button click
    * the tool supports how projects actually evolve — not one continuous push but eras of thinking
  * why fourth
    * this is the second big shift, but it depends on everything above (UI, persistence, resume)
    * if M1-M3 don't validate, nepic spaces might need a different shape

* M5 — board view
  * question: does a second view mode add value, or is tree view sufficient?
  * build
    * kanban toggle in middle column
    * status columns
    * compact cards
  * learn
    * do you use it? how often?
    * is "glance at project status" actually faster in kanban than in tree?
    * does drag-to-reorder matter?
  * value delivered: project status at a glance without mentally walking the tree
  * why last
    * lowest risk, lowest uncertainty
    * it's a view layer on top of data that already exists
    * nice to have, not load-bearing

* the thread through all five
  * each milestone answers a question whose answer shapes the next milestone
  * if M1 reveals that the tree view is too noisy, M2's schema changes
  * if M2 shows that dual-truth causes sync bugs, M3's resume logic changes
  * if M3 shows resume is unreliable, M4's architect handoff becomes more critical

* open: where does the poke bug fit?
  * it's a v1 bug but it's fundamental to the architect → agent workflow
  * could be a quick fix early, or could be a deep rabbit hole
  * investigate before M1 starts, so agents can actually be managed during development
