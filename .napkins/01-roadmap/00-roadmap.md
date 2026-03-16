* nap v0.1 poc — roadmap v0 (2026-03-16)

* build order — each feature builds on the previous, each independently testable

* 0100 — electron app + single terminal
  * the foundation — nothing else works without this
  * BrowserWindow, dark opaque theme
  * one xterm.js terminal + WebGL addon + node-pty
  * runs user's default shell in cwd
  * addon-fit for resize
  * testable: launch app, get a working terminal in a dark window

* 0200 — multi-terminal + sidebar
  * zustand store for terminal state { id, name, pty, xterm, status, parentId, messageQueue[] }
  * sidebar (~250px, collapsible Cmd+B)
    * agent cards: name, status dot, parent name
    * click card → switch terminal
  * terminal switching
    * detach/reattach DOM element
    * Terminal instance stays alive
  * testable: programmatically spawn terminals, switch between them, verify scrollback preserved

* 0300 — socket server + CLI core
  * unix socket server in app (net module, ~/.nap/sock)
    * ndjson protocol, request-response
    * cleanup on exit (signal handlers)
  * CLI (node script)
    * nap start <command> [--name] [--cwd]
      * arbitrary command, not hardcoded to claude
      * NAP_SESSION_ID env var for parent detection
      * returns { id, name } JSON
    * nap ps — list sessions
    * nap peek <name> — focus terminal
    * nap kill <name> — kill pty, card stays (gray dot)
    * nap close <name> — kill pty + remove card
  * testable: launch app, use CLI from first terminal to spawn/list/kill sessions

* 0400 — poke, nap, done
  * nap poke <name> "message"
    * write to pty stdin immediately
    * queued messages: fixed delay (500ms–1s), sequential
  * nap nap <name> [--timeout]
    * poll socket every 1s
    * block until done/exited
    * return last poke message
  * nap done [message]
    * mark self as done (blue dot)
    * poke parent with message
  * testable: the full integration test from the napkin
    * start agents, poke between them, nap on completion

* 0500 — integration + stress test
  * run the full integration test script from poc inputs
  * stretch test
    * 10 terminals running `top`
    * rapid switching
    * measure CPU, memory, switch latency
  * addon-search (find-in-scrollback) — add here, low priority

* risks
  * xterm.js DOM detach/reattach — does WebGL survive? test early in 0200
  * node-pty + electron packaging — native module rebuild, test in 0100
  * 10 WebGL contexts simultaneously — test in 0500, should be fine under limit
