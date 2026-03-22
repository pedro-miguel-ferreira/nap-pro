## Why

The napkin browser needs to show what files exist on disk — artifacts, agents, napkin content. This service watches the filesystem and pushes updates to the renderer.

## What

A filesystem watcher in main process that reads `30-napkins/` and sends structured data to renderer via IPC.

## Constraints

* fs.watch on `<nepicDir>/30-napkins/` with recursive option
* Debounce per napkin dir: 200ms
* Data structure per napkin:
  ```typescript
  { slug: string, artifacts: string[], agents: string[], napkinBullets: string[] }
  ```
  * artifacts: list of file extensions that exist (.nap.md, .spec.md, etc.)
  * agents: list of agent dir names (001-test-arch-sqlite, etc.)
  * napkinBullets: first N lines of .nap.md starting with `*` (for kanban cards)
* IPC channel: `napkin:update` (main → renderer)
  * On startup: send all napkins as array
  * On change: send single updated napkin
* Must handle: dir doesn't exist yet (new nepic, empty 30-napkins/)
* Must handle: .nap.md doesn't exist yet (napkin dir created but no content)
* Don't read agent internals (prompt.md, response.md) — just dir names
* Nepic path comes from SQLite active nepic or from app startup config

## What to read

* `src/main/main.ts` — where to init the watcher
* `src/main/preload.ts` — IPC channel registration pattern
* `src/renderer/store.ts` — where napkin data will land
