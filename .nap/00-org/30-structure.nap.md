# Structure

## Directory Layout

```
.napkins/
  00-org/                         <- how we work (you are here)
    promise.md                    <- why NAP exists
    workflow.md                   <- interaction protocol
    structure.md                  <- this file
    roles/                        <- role definitions
      architect.md
      test-architect.md
      fullstack-eng.md
      test-eng.md

  10-backlog/                     <- napkins waiting to be picked up
  20-todo/                        <- architect is writing spec
  30-doing/                       <- agents are working
  40-done/                        <- shipped

  Each stage contains feature directories:

  30-doing/
    0100-terminal-mgmt/
      0100-terminal-mgmt.napkin.md
      0100-terminal-mgmt.spec.md
      0100-terminal-mgmt.journeys.md
      0100-terminal-mgmt.test.md
      agents/
        001-fs-eng-electron-shell/
          prompt.md
          response.md
          questions.md
        002-test-arch-terminal-mgmt/
          prompt.md
          response.md
        003-test-eng-terminal-mgmt/
          prompt.md
          response.md
```

## Feature Numbering

4 digits, spaced by 100:

```
0100, 0200, 0300, ...
```

Room for 99 insertions between each (0101-0199).
Up to ~100 features at the default spacing.

## Agent Numbering

3 digits within a feature directory:

```
001-role-subject
```

Both role and subject in the name:
- `001-fs-eng-electron-shell` — fullstack engineer working on the electron shell
- `002-test-arch-terminal-mgmt` — test architect for terminal management
- `003-test-eng-terminal-mgmt` — test engineer for terminal management

## File Extensions

| File | Purpose |
|---|---|
| `.napkin.md` | The napkin — compressed idea anchors |
| `.spec.md` | Min spec — only the why, what, and constraints the implementer can't derive from the napkin + codebase alone |
| `.journeys.md` | Developer/user journeys |
| `.test.md` | Test architecture — strategic test cases |

## Moving Features

Moving between directories IS the status change:

```bash
mv .napkins/10-backlog/0100-terminal-mgmt .napkins/20-todo/
mv .napkins/20-todo/0100-terminal-mgmt .napkins/30-doing/
mv .napkins/30-doing/0100-terminal-mgmt .napkins/40-done/
```
