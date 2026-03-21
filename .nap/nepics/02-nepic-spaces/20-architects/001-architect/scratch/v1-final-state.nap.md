* nap v1 (POC) — final state
  * compare against inputs-draft.nap.md to see what changed

* the app (Nap.app)
  * Electron 33+, macOS only
  * one window = one project directory
    * window title = directory basename
  * dark opaque theme (#1e1e1e)
    * no transparency — dropped early, WebGL can't do rgba
  * layout
    * left: sidebar (~250px, collapsible Cmd+B)
      * agent cards: name, status dot, parent name
      * Cmd+K filter (substring, case-insensitive)
      * click card → switch terminal
      * "+" button → new terminal (Cmd+T)
    * right: terminal panel (xterm.js + WebGL)
      * no split panes, no tabs
  * keyboard shortcuts
    * Cmd+B toggle sidebar
    * Cmd+T new terminal
    * Cmd+W close terminated session
    * Cmd+K filter sidebar
    * Cmd+G scroll lock toggle (follow / read)
    * Cmd+Click open file path

* terminal management
  * xterm.js + WebGL addon
    * WebGL on every terminal, never disposed
    * no context juggling — ≤10 terminals under GPU limit
    * canvas fallback if WebGL fails
  * node-pty
    * main process owns ptys
    * renderer owns xterm via IPC bridge (preload)
  * terminal switching = DOM reparenting
    * detach xterm.element, reattach to container
    * WebGL survives reparent
    * Terminal instance never disposed (holds buffer)
  * scrollback: 100,000 lines
  * addons: addon-fit, addon-webgl, addon-canvas, addon-search (partial)
  * scroll lock modes
    * follow lock: viewport pinned to bottom (onWriteParsed → scrollToBottom)
    * read lock: viewport pinned to current position (queueMicrotask to distinguish user/write scroll)
    * Cmd+G toggle: single press → follow, double press → read, again → off
    * visual: dim blue bottom border (follow), dim amber side borders (read)
    * partial: edge cases with Claude Code's ink rendering remain

* clickable file paths
  * custom link provider via registerLinkProvider
  * regex matches relative, absolute, with line:col
  * Cmd+hover → underline
  * Cmd+click → shell.openPath()
  * no stat, no fs check — just tries to open

* the nap CLI
  * standalone node script, no electron dependencies
  * talks to app over unix socket at .nap/sock
    * per-project socket — CLI walks up from cwd to find it
  * protocol: newline-delimited JSON, request-response
  * commands
    * nap open [path] [--name] [--command]
      * launches Nap.app with cwd = path
      * --name sets first terminal card name
      * --command runs that command instead of login shell
      * detached spawn, CLI exits immediately
    * nap start <command> [--name] [--cwd]
      * runs arbitrary command (not hardcoded to claude)
      * NAP_SESSION_ID env var for parent detection
      * returns { id, name } JSON
    * nap ps [--json]
      * colored status dots (ANSI)
      * table format or raw JSON
    * nap log <name>
      * dumps terminal scrollback to stdout
      * IPC round-trip to renderer to read xterm buffer
    * nap peek <name> → focus terminal in UI
    * nap poke <name> "message"
      * writes to pty stdin + newline
      * queued messages: 500ms delay between deliveries
      * bug: doesn't trigger Claude Code's input handler (logged in issues)
    * nap nap <name> [--timeout]
      * polls socket every 1s
      * blocks until done/exited
      * returns done-message
    * nap done [message]
      * marks self as done (blue dot)
      * pokes parent with message
      * reads NAP_SESSION_ID from env
    * nap kill <name> → kill pty, card stays (gray dot)
    * nap close <name> → kill + remove card
    * nap --help / nap <command> --help
  * name resolution with fuzzy matching ("did you mean?")

* state management
  * zustand store (renderer)
    * terminal metadata: id, name, status, parentId, cwd, createdAt
    * activeTerminalId, sidebarVisible, scrollLockModes
  * terminal registry (renderer, outside React)
    * Map<id, { terminal, fitAddon, scrollLock, opened }>
    * React never touches terminal objects
  * session store (main process)
    * in-memory — lost on app restart
    * mirrors renderer store for socket queries (nap ps)
  * no database — persistence is the #1 gap

* process lifecycle
  * socket server starts before window creation
    * stale socket detection (try connect → refused → unlink)
    * another instance detection (try connect → success → quit)
  * socket cleanup: SIGTERM, SIGINT, beforeExit, will-quit
  * pty shutdown: kill all → wait for onExit callbacks → quit (2s timeout)
  * window close on last terminal → kill ptys → quit

* testing
  * 110+ tests
  * vitest (small): store actions, parsers, pure functions
  * playwright + electron (medium): real app via page.evaluate/app.evaluate
    * no UI automation — drive store actions, read xterm buffers
  * test isolation: unique NAP_SOCKET per test via launchApp() helper
  * real bugs caught: pty SIGABRT, socket cleanup race, status overwrite, segfault on second instance

* tech stack
  * electron 33+, electron-vite, TypeScript strict
  * react 18, zustand
  * @xterm/xterm + addon-webgl + addon-canvas + addon-fit
  * node-pty (native module, electron-rebuild)
  * net module (unix socket)

* what's NOT in v1
  * persistence (in-memory only)
  * structured project view (flat sidebar)
  * nepic spaces
  * kanban board
  * SQLite
  * multiple windows / projects
  * agent roles / napkin awareness in UI
  * claude --resume integration
  * auto-unfolding pipeline
