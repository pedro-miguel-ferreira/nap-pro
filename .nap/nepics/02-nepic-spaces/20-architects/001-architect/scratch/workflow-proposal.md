# Workflow Proposal for v2

This is a proposal from the v1 architect. The v2 architect owns the final version.

## What Changed from v1

In v1, napkins lived in kanban directories (`10-backlog/`, `30-doing/`, etc.). Moving a directory was the status change. This worked but had problems:
- Paths broke when napkins moved between dirs
- Hard to reference a napkin's canonical location
- No persistence — close the app, lose all state

## Proposed v2 Workflow

### Directory Structure

Napkins live in one place and never move. Status is tracked in SQLite. Board directories use symlinks as editor lenses.

```
.nap/
  00-org/                         ← shared across all nepics
  nepics/
    01-poc/                       ← v1 reference
    02-nepic-spaces/              ← current work
      10-docs/
        inputs.nap.md             ← mega napkin (authoritative)
      20-architects/
        001-architect/
          prompt.md
          onboarding/
          scratch/
      30-napkins/
        0100-feature/             ← canonical location, never moves
      40-board/
        10-draft/
          0100-feature → ../../30-napkins/0100-feature   (symlink)
        ...
        60-done/
```

### Status Lifecycle

draft → backlog → todo → doing → review → done

- **draft** — architect and human are shaping the napkin
- **backlog** — napkin reviewed and approved, not yet scheduled
- **todo** — scheduled for implementation
- **doing** — agents are working
- **review** — human reviews the result
- **done** — shipped

Status changes:
1. App updates SQLite
2. App moves symlink from old board dir to new board dir
3. Both stay in sync — either side can initiate

### Nepic Lifecycle

1. Human clicks plus → new nepic created
2. New architect session starts
3. Architect reads onboarding, brainstorms with human
4. Architect creates mega napkin → `10-docs/inputs.nap.md`
5. Architect breaks mega napkin into feature napkins
6. Implementation proceeds (same pipeline: test arch → fs eng → test eng)
7. When architect runs out of context → handoff doc → successor architect

### Architect Handoff

When context window is exhausted:
1. Current architect writes `10-docs/handoff.md`
2. New architect dir created: `20-architects/002-architect/`
3. New session launched, reads onboarding + handoff + current state
4. Picks up where predecessor left off

### What the Architect Owns

- The mega napkin (with human input)
- The roadmap and sequencing
- All specs and journeys
- Agent prompts and management
- The workflow itself — this proposal is a starting point, not final

## Open Questions

- Should the kanban board be a UI view only, or do the symlink dirs add enough value?
- How does the architect resume after app restart? Auto `claude -r`? Manual?
- Should there be a formal review gate, or is the current "human reads and comments in editor" sufficient?
- How much of the pipeline should be automatable? (e.g., `nap unfold 0100-feature` auto-spawns test arch → fs eng → test eng)


//Again in this workflow description and in overall package we are missing what's the idea behind the workflow? What exactly is the logic? What happens on each step? And without this workflow it doesn't make sense to explain UI because it's not clear what everything does in a bigger picture