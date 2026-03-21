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
    * the manifesto (include it, from the napkin skill)
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
    * first explain the MANUAL way — without NAP
      * you'd open 5 terminal tabs, manually copy commands, switch between them, forget which is which
      * no visibility into what's running, what's done, what's stuck
    * then show how NAP CLI solves this
      * each agent gets a directory: prompt.md, response.md
      * launched via `nap start 'claude ...' --name NNN-role-subject`
      * architect waits with `nap nap`, reads response, routes failures
      * real example: the actual command and what happened
    * agents must call `nap done` — they won't do it automatically, must be told in prompt
  * min specs — what they are and why
    * inspired by Liberating Structures Min Specs — the minimum rules that must be respected
    * not a PRD, not a template with sections
    * the architect's opinionated take on why and what
    * only the constraints the implementer can't derive on their own
    * if you find yourself writing a section header, you're writing a PRD
    * state the tension: the problem, the naive answer, why it's wrong, the real answer
    * real example from v1 (0300 socket CLI spec was our best)

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

* 06 — v2 direction (proposals, not prescriptions)
  * new workflow proposal
    * how it differs from v1
    * nepic spaces, architect handoff, status lifecycle
    * reference: scratch/workflow-proposal.md
  * new UI — three-column layout
    * ASCII wireframe showing the layout:
      ```
      ┌──────┬───────────────────┬──────────────────────────────┐
      │  S   │      main         │         terminal             │
      │      │                   │                              │
      │ [v1] │  ▼ architect      │  $ nap ps                    │
      │      │    ● running      │  NAME     STATUS   PARENT    │
      │ [v2] │                   │  shell    ● run    -         │
      │      │  ▼ 0100-napkin-   │  fs-eng   ● run    shell     │
      │      │    browser        │  test-eng ● done   shell     │
      │      │    ○ nap.md       │                              │
      │      │    ○ spec.md      │  $ nap start 'claude ...'    │
      │      │    ○ test.md      │    --name fs-eng-0200        │
      │      │    === agents === │                              │
      │      │    ● [done] t-arc │  ⏺ Reading prompt.md...     │
      │      │    ● [run] fs-eng │                              │
      │      │    ● [nap] t-eng  │  ⏺ Read(src/main/main.ts)  │
      │      │                   │    ⎿ Read 115 lines          │
      │      │  ▶ 0200-sqlite    │                              │
      │      │  ▶ 0300-spaces    │  ⏺ Let me implement the     │
      │      │                   │    socket server...          │
      │      │                   │                              │
      │  [+] │                   │                              │
      └──────┴───────────────────┴──────────────────────────────┘
        60px      ~300px                fills rest
      ```
    * left gutter: nepic switcher (like Slack workspaces)
    * middle: napkin browser — tree view of features with nested agents
    * right: terminal — click agent in middle → shows its terminal
    * board view toggle — kanban of napkins by status
  * design language
    * dark theme (#1e1e1e background, #252526 sidebar, #3c3c3c borders)
    * status dots: green (#22c55e), blue (#3b82f6), gray (#6b7280)
    * scroll lock borders: dim blue (#2a5a9a) follow, dim amber (#8a6a2a) read
    * monospace: Menlo, Monaco
    * the existing scheme is well-established — preserve it
  * these are starting points — the architect owns and reshapes them
