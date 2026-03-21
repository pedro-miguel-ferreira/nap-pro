* nap v0.1 — technical poc
  * what it proves
    * electron + xterm.js + node-pty can run 10+ terminals without melting
    * switching between long-scrollback sessions is instant
    * CLI talks to app over unix socket
      * round-trip < 50ms
    * one agent can poke another agent's terminal input
    * message queue delivers in order when target is busy

* the app (Nap.app)
  * one window = one directory (cwd at launch)
    * window title = directory basename
  * layout
    * left: sidebar (~250px, collapsible Cmd+B)
      * list of agent cards
      * card shows
        * name
        * status dot (green=running, gray=exited, blue=done)
        * parent name if spawned by another
      * click card → switch terminal
    * right: terminal panel (xterm.js)
      * shows selected card's session
      * fills remaining space
      * no split panes, no tabs
  * dark theme, opaque
    * no transparency/vibrancy
      * WebGL renderer doesn't support rgba backgrounds
      * WebGL wins over vibrancy — smooth scrolling, GPU-offloaded rendering

* terminal management
  * each terminal = { id, name, pty, xterm, status, parentId, messageQueue[] }
  * pty (node-pty)
    * stays alive when terminal is not selected
    * never killed on switch
  * xterm.js + WebGL addon
    * WebGL mounted on every terminal, left attached
      * ≤10 terminals, GPU context limit ~16
      * no juggling, no dispose/re-init strategy
    * Terminal instance never disposed
      * holds buffer + scrollback
      * lives for entire session lifetime
    * on switch
      * detach DOM element from old terminal
      * reattach DOM element to new terminal
      * no re-rendering, no buffer replay
  * scrollback
    * 10,000 lines default
    * stress test at 50,000
  * addons
    * addon-fit (resize)
    * addon-search (find-in-scrollback)

* the nap CLI
  * node script
  * talks to Nap.app over unix socket at ~/.nap/sock
    * protocol: newline-delimited JSON, request-response
  * app starts socket server on launch
    * removes on quit via signal handlers (SIGTERM, SIGINT, beforeExit)
    * stale socket from hard crash (SIGKILL, OOM) — acceptable edge case
  * if app not running: "nap is not running" + exit 1
  * commands
    * nap start <command> [--name <n>] [--cwd <path>]
      * runs arbitrary command (not hardcoded to claude)
        * makes POC testable without Claude dependency
        * proving terminal/poke/nap mechanics is the point
      * creates pty, creates card, runs command in the pty
      * --name defaults to "agent-1", "agent-2" etc
      * returns JSON: { id, name } to stdout
      * if called from inside a nap terminal, auto-sets parentId
        * how: Nap.app sets NAP_SESSION_ID env var in each pty
        * CLI reads it, sends as parentId in request
    * nap poke <name> "message"
      * enqueues message for target session
      * delivery: write to pty stdin immediately
        * no prompt detection for POC
        * Claude Code handles unexpected input gracefully
      * queued messages
        * fixed delay between deliveries (500ms–1s)
        * sequential — don't fire next until delay elapsed
      * future: Claude Code hooks for proper delivery timing
    * nap nap <name> `[--timeout <s>]`
      * blocks until target's status becomes "done" or "exited"
      * polls over socket every 1s
      * timeout default: 600s (10 min)
      * returns target's last poke message if any
    * nap ps
      * returns JSON array: [{ id, name, status, parent, cwd, uptime }]
      * also pretty-prints a table for human use
    * nap peek <name>
      * tells Nap.app to focus/surface that terminal
      * if sidebar is collapsed, opens it
    * nap kill <name>
      * kills pty process, status → exited
      * card stays (gray dot) for inspection
    * nap close <name>
      * kills pty + removes card entirely
    * nap done [message]
      * sugar for: mark myself as done (blue dot) + poke parent with message
      * reads NAP_SESSION_ID from env to know who "myself" is
      * if no parent, just marks done

* first terminal on launch
  * app opens with one terminal
    * runs user's default shell
    * cwd = directory the app was launched from
  * this is where you run nap start, nap poke, etc.

* the integration test
  * launch Nap.app in ~/test-project
  * from first terminal
    * nap start "echo hello world" --name agent-a
    * nap start "sleep 10 && nap done 'finished sleeping'" --name agent-b
    * nap ps → shows 3 sessions (original + a + b)
    * nap poke agent-a "wake up"
    * nap peek agent-a → terminal switches
    * nap nap agent-b --timeout 15 → blocks, returns when agent-b runs nap done
  * stretch test
    * spawn 10 terminals running `top` or similar
    * switch between them rapidly
    * measure: CPU, memory, switch latency

* tech stack
  * electron 33+ (latest stable)
  * react 18 + zustand
  * @xterm/xterm + addon-fit + addon-webgl + addon-search
  * node-pty
  * net module (unix socket server/client)
  * no database — in-memory state only for poc

* out of scope
  * agent roles, napkin files, agent-docs protocol
  * file watching
  * multiple windows / "open project" flow
  * settings UI
  * session persistence across app restart
  * claude --resume integration
  * any NDD-specific logic — this is a dumb terminal manager with poke/nap
