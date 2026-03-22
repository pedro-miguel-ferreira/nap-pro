* filesystem service — live project data from disk

* main process watches `30-napkins/` via fs.watch (recursive)
  * on change: re-read affected napkin dir
  * push updates to renderer via IPC

* what it reads per napkin dir
  * readdir → artifact existence (.nap.md, .spec.md, .test.md, .journeys.md)
  * read first N lines of .nap.md → top-level bullets for kanban cards
  * readdir agents/ → agent directories that exist

* IPC to renderer
  * new channel: `napkin:update` — sends napkin data to renderer
  * renderer updates store → React re-renders sidebar + kanban
  * initial load: full scan on startup, send all napkins
  * incremental: on fs.watch event, send only changed napkin

* what it doesn't do
  * no SQLite reads — that's the renderer's job via existing IPC
  * no status tracking — SQLite owns status
  * just: "what files exist on disk right now"

* debounce
  * fs.watch fires multiple events per file save
  * debounce per napkin dir: 200ms — batch rapid changes
