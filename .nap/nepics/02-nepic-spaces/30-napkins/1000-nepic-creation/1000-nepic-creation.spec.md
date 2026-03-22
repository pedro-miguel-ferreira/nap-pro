## Why

The (+) button is the second big shift — making pivots as cheap as having an idea. Fresh space, fresh architect, same codebase.

## What

Clicking (+) scaffolds a new nepic directory, creates SQLite entries, switches the UI, and boots a fresh architect.

## Constraints

* (+) in gutter triggers a name input (minimal: text input overlay or prompt)
* Directory scaffold: `mkdir -p` for all subdirs (10-docs through 40-board)
* SQLite: INSERT nepic, UPDATE all others to is_active=0, new one is_active=1
* Architect prompt.md template: stored in `00-org/` or generated
* Architect session: generate UUID, store in SQLite, spawn with `--session-id`
* Gutter re-renders to show new icon
* Sidebar clears and shows empty state (no napkins yet)
* Terminal switches to new architect
* Previous nepic's sessions keep running (ptys don't care about UI focus)
* Nepic slug: `NN-name` where NN is next available number

## What to read

* `src/renderer/components/Gutter.tsx` — from 0400
* `src/main/main.ts` — nepic creation handler
* `src/main/session-store.ts` — nepic table operations
* `src/main/database.ts` — nepics table schema
