# v2 Direction

These are proposals from the v1 architect and human. You own them — reshape, push back, extend. The detailed draft is in `scratch/inputs-draft.nap.md`. The workflow proposal is in `scratch/workflow-proposal.md`. This doc summarizes the direction.

## Two Big Shifts

v2 makes two changes that are equally important. Both are load-bearing — the tool doesn't work without either.

### From terminals to a structured project

The POC is a terminal manager. You see agents as cards in a sidebar — their names, their status dots. That's it. You don't see the project. You don't see which agents belong to which feature, which napkins have specs, which features are in progress. When you have 15 agents, the sidebar is a wall of names.

v2 replaces the flat sidebar with a **napkin browser** — a tree view organized by features, not terminals. Each napkin expands to show its artifacts (nap.md, spec.md, test.md) and its agent pipeline with statuses. You see the work — which features exist, how far along each one is, where agents are stuck. The middle column becomes a project dashboard, not a terminal list.

This also means **persistence**. SQLite stores agent statuses, session history, napkin metadata. Close the app, reopen it — your project is there. The POC lost everything on quit.

### From one continuous push to pivotable nepics

Every project hits a wall where the current thinking doesn't fit the next ambition. The POC proved the concept — now you need a real version. Different roadmap, different architecture decisions, different scope. In a normal workflow, this pivot is painful: archive the old stuff, rewrite context, brief a new session, spend hours on overhead that kills momentum.

The answer is the **(+) button**. It sits in the left gutter, right where a new nepic icon would appear. Click it and a fresh space is created — new architect, new napkin directory, new roadmap, new onboarding package. But the codebase is right there. The previous nepics are right there for reference. You don't lose what you built. You start thinking again, unburdened by the old context.

The (+) makes a pivot as cheap as having a new idea. The onboarding package means the new architect starts with full understanding — same energy as the first conversation, but standing on validated ground. Moving to a new version is as easy as clicking (+), and here's a new era, a new space, a fresh team ready to build, starting with exploration as exciting as the very first one.

## The Three-Column Layout

```
┌──────┬───────────────────┬──────────────────────────────────┐
│  S   │      main         │         terminal                 │
│      │                   │                                  │
│ [v1] │  ▼ architect      │  $ nap ps                        │
│      │    ● running      │  NAME     STATUS   PARENT        │
│ [v2] │                   │  shell    ● run    -             │
│      │  ▼ 0100-napkin-   │  fs-eng   ● run    shell         │
│      │    browser        │  test-eng ● done   shell         │
│      │    ○ nap.md       │                                  │
│      │    ○ spec.md      │  $ nap start 'claude ...'        │
│      │    ○ test.md      │    --name fs-eng-0200            │
│      │    === agents === │                                  │
│      │    ● [done] t-arc │  ⏺ Reading prompt.md...         │
│      │    ● [run] fs-eng │                                  │
│      │    ● [nap] t-eng  │  ⏺ Read(src/main/main.ts)      │
│      │                   │    ⎿ Read 115 lines              │
│      │  ▶ 0200-sqlite    │                                  │
│      │  ▶ 0300-spaces    │  ⏺ Let me implement the         │
│      │                   │    socket server...              │
│      │                   │                                  │
│  [+] │                   │                                  │
└──────┴───────────────────┴──────────────────────────────────┘
  60px      ~300px                  fills rest
```

- **Left gutter (~60px):** Nepic switcher. Click to switch workspaces. Plus button creates new nepic.
- **Middle (~300px):** Napkin browser. Tree view of features with nested agents. Toggle to board view (kanban by status). Cmd+K filter.
- **Right (fills rest):** Terminal. Default shows architect. Click agent in middle → shows that agent's terminal.

## SQLite Persistence

In-memory state doesn't survive app restart. v2 uses **better-sqlite3** for persistence.

- Database at `.nap/nap.db`
- SQLite is source of truth for STATUS (running, done, exited)
- Filesystem is source of truth for CONTENT (napkins, specs, prompts)
- Board symlinks stay in sync with database

## Kanban Board View

The middle column toggles between tree view and board view. Board view shows napkins grouped by status columns (draft → backlog → todo → doing → review → done). Quick glance at project status without leaving the terminal.

Three options were discussed for how to show the kanban alongside the architect terminal:
- **Option A:** Board replaces the terminal in the right panel
- **Option B:** Board is the middle column (toggle with tree view)
- **Option C:** Board is a floating overlay (Cmd+K style popup)

All three are worth trying. Start with B (simplest), try A and C if it doesn't feel right.

## Design Language

Established in v1, preserve it:
- Dark theme: `#1e1e1e` background, `#252526` sidebar, `#3c3c3c` borders
- Status dots: green `#22c55e` (running), blue `#3b82f6` (done), gray `#6b7280` (exited)
- Scroll lock borders: dim blue `#2a5a9a` (follow), dim amber `#8a6a2a` (read)
- Font: Menlo, Monaco, monospace, 14px
- Active card: `#37373d` background, `#007acc` left border

## Directory Structure

```
.nap/
  sock                          ← runtime socket
  nap.db                        ← SQLite database
  00-org/                       ← shared across nepics
  nepics/
    01-poc/                     ← v1 reference
    02-nepic-spaces/            ← current work
      10-docs/
      20-architects/
      30-napkins/
      40-board/                 ← symlinked status dirs
```

Details in `scratch/workflow-proposal.md`.

## Open Questions

- How live should the napkin browser be? Watch filesystem, or refresh on demand?
- How does the architect resume after app restart?
- Should there be formal review gates, or is "human comments in editor" sufficient?
- How much of the pipeline could be automated? (`nap unfold 0100` auto-spawns the pipeline)
