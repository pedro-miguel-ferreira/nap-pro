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
  * // comment on this one:
    * // -> "things we think we know, but haven't proven"
    * // sets thinking train on particular rails, don't leave space to guess
    * // otherwise is really clunky in important pivot point
    * // so sometimes from reader perspective you have to articulate important pieces
    * // like doing a small voiceover for a presentation
    * // it's just like preso format, where you say a punchy remark 
    * // to get everyone onboard and puzzled with a striking question, 
    * // and then giving some bullets to think and talk about; 
    * // stretching metaphr here a bit
    * // but guess mind-to-mind transfer similar to preso 
    * // also doesn't look / sound too long
  * three-column layout works at this scale
  * kanban adds value beyond tree view
  * filesystem watching reliable enough for live updates

* things we DO know (carry forward) // same here
  * terminal management — xterm + WebGL + node-pty solid
  * socket + CLI — protocol proven
  * pipeline — four roles, napkin → spec → test → code

* M1 — the spatial shift
  * question: does structured project view changes how you see the work? // this is ok
    * napkin cards, 
    * multiple agents inside one, 
    * activatin of agent's terminal, 
    * file links to click
    * // what do you exactly mean (in your current mindset) by "structured views"
      * // think of just including a picture next to the question or idea
      * // idea reads 10x better if it has a picture attached
      * // just include couple tags to make it "visual",
      * // and _feel_ the experience, when you're asking a question
      * // shouldn't do it each time, obv, strategicly, like where you want attention to go to
      * // remind of the look, just like the pic would
      * // here's to the power of tags to invoke images in people's minds
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
      * // let's place some mock nepics there, would already feel magical
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
      * // how would sqlite approach work if data schema would change slightly?
      * // add field; rename field; add many fields;
      * // or refactor the schema (what kind of changes can you foresee?)
        * // def there's going to be _many_
    * napkin browser reads status from DB, content from filesystem
  * learn
    * persistence changes usage pattern?
      * close the app more freely?
      * // i just love how i can close and open cursor
      * // i often have security requirement to install patch/update
      * // and rebooting os dreads me if i can't just restart the IDE
      * // also we need to be updating app versions while we're working on the app
    * dual-truth model causes confusion?
    * crash reopen vs clean quit — what breaks?
      * // i'm more curious about clean; let's focus on that first
      * // crash is P2 or P3
    * native module rebuild — how painful?
      * // are we really doing it? 
      * // bc why we need a rebuild if native modules stay the same?
  * value: close laptop, come back tomorrow, project still there // exactly!
  * why second
    * M1 proves UI concept with filesystem data
    * M2 swaps in real backend
    * M1's tree view doesn't work?
      * reshape before investing in persistence

* M3 — session continuity
  * question: can you pick up mid-thought?
  * build
    * store architect session IDs
      * // i think we need to discuss what is mental model:
        * // what is stored and what is allows to restore
    * auto-resume via `claude --resume` on app reopen
    * reconnect agent tree from SQLite
      * // what exactly does that mean?
      * // i think it would make sense to split this out
      * // as a separate napkin 
        * // and do a focused discussion there
        * // we can treat it as a refinement of backlog item?
    * "this agent was running when you left" states
  * learn
    * `claude --resume` reliable enough as default?
      * // yes, this is the only thing we can rely upon
    * what context is actually lost on resume?
      * // all spatial things within ui? also statuses etc
      * // what makes an agent a Nap agent? in ideal world
      * // need to put together a good mental model
    * does the architect feel continuous?
      * // it's okay for them to be fresh; but they need to bring enough context
      * // really good question: define enough context
      * or like a new conversation with no continuity?
    * handoff docs less critical?
  * value
    * "close and resume" works end-to-end
    * first time NAP feels like persistent environment, not session
  * why third
    * depends on M2 (session IDs in SQLite)
    * where we learn: persistence "nice to have" or "changes everything"

* M4 — nepic spaces
  * // i feel this one goes strongly after state restoration
  * // one point to state persistance: nepics are impossible without it
  * question: cheap pivots change how you approach projects?
  * build
    * left gutter → nepic switcher
    * (+) creates new space — fresh architect, fresh napkins, same codebase
    * switching nepics swaps middle column and terminal
  * learn
    * how often do you create nepics?
      * // thoughts: 
        * // 1. scaffolding of folders / structures
        * // 2. creating onboarding package 
          * // maybe with some review? should strive for autonomous
        * // 3. launching a new architect
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
      * // we at least need persistance
      * // ui can take different shape, 
        * // basically should be the same for each space/nepic

* M5 — board view
  * question: second view mode adds value — or tree view sufficient?
  * // feels like something to take a look after happy path working for one version
    * // doesn't depend on spaces
    * // should / might brainstorm uis early
    * // need design agent for this?
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
    * // we should prototype pure-ui/ux with mock data to see how it feels
    * // after validation much easier to move forward
    * → M2's schema changes
  * M2 shows dual-truth causes sync bugs?
    * → M3's resume logic changes
  * M3 shows resume unreliable?
    * → M4's architect handoff becomes more critical

* open: poke bug
  * v1 bug, but fundamental to architect → agent workflow
    * // poke is not essential to happy path; 
    * // we know start / done / nap work
    * // pole is one of collab patterns, isn't critical for all of v2 flows
    * // v3 might be more about feedback loops and collaboration
  * quick fix or deep rabbit hole — unknown
  * investigate before M1, so agents work during development
