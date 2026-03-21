* architect onboarding package — structure

* the reader
  * brilliant engineer, day one
  * can read code, figure out tools
  * has zero context on why, what, how
  * wasn't in the room for any brainstorming
  * needs the story, not the reference card

* reading order — each doc builds on the previous

* 01 — the vision
  * why NAP exists
    * the bottleneck in AI development is thinking, not coding
    * vibe coding skips thinking — it works until it doesn't, then nobody knows what "correct" means
    * napkins compress thinking to its seed — load-bearing ideas that agents can unfold
  * the napkin philosophy
    * the manifesto (from the napkin skill)
    * napkin format: asterisks, nesting, labels not sentences, tension before solution
    * examples of real napkins from this project
  * the promise
    * 15 min napkin → agents unfold → come back to full thinking traces
    * napkin → spec → journeys → tests → code → running system
  * what the human is building toward
    * a collaborative environment where agents unfold napkins into systems
    * the human thinks, the machines build
    * everything is visible, traceable, inspectable

* 02 — the pipeline
  * why it's shaped this way — the reasoning, not the list
  * why not one agent doing everything?
    * context window limits — one agent can't hold the whole system
    * quality can't be tested in, has to be designed in
    * separation of concerns: thinking about what to test ≠ writing code ≠ writing tests
  * the roles and WHY each exists
    * architect — holds the whole system shape, human can't manage 10 agents directly
    * test architect — separate from test eng because test STRATEGY is a design act, not a coding act
      * Google Testing Book: focus on seams, integration points, not unit test busywork
    * fullstack eng — writes code shaped so tests are possible, proper APIs and boundaries
    * test eng — implements tests, finds real bugs, reports back
      * separate from fs-eng because the person who wrote the code is biased toward their design
  * the flow: napkin → spec → test arch → fs eng → test eng → iterate
    * walk through a REAL example from v1
      * e.g., 0300-socket-cli: the napkin, what the spec said, what test arch produced, what fs-eng built, what test-eng found (two real bugs)
    * this is the core section — make the reader FEEL how it works
  * how agents are managed
    * each agent gets a directory: prompt.md, response.md, questions.md
    * launched via `nap start 'claude --verbose "..."' --name NNN-role-subject`
    * architect waits with `nap nap`, reads response, routes failures
    * real example of a launch command and what happened
  * min specs — what they are and why
    * not a PRD, not a template with sections
    * the architect's opinionated take on why and what
    * only the constraints the implementer can't derive on their own
    * real example from v1

* 03 — what was built (the POC)
  * features shipped — table, one line per feature
  * architecture decisions — the important ones, with why
  * CLI commands — the full list
  * test coverage — numbers, strategy (small/medium/big via vitest/playwright)
  * the bootstrapping moment — using NAP to build NAP

* 04 — lessons learned
  * agent prompt voice — talk like a teammate, not a document
    * the story of how we learned this (agents delegating reading to subagents)
  * nap done — agents must be told, they won't do it automatically
  * testing strategy — playwright + page.evaluate is the sweet spot
    * real bugs caught by tests (list them)
  * the architect doesn't write code
  * scroll lock rabbit hole — know when to stop

* 05 — the codebase
  * source layout
  * stack
  * build/run/test commands
  * key files to read first
  * stable app vs dev setup (~/nap-app vs working repo)
