* nap v0.1 — technical poc
  * what it proves
    * electron + xterm.js + node-pty can run 10+ terminals without melting
    * transparency/vibrancy works (iTerm-like translucent dark)
    * switching between long-scrollback sessions is instant
    * CLI can talk to app over unix socket, round-trip < 50ms
    * one agent can poke another agent's terminal input reliably
    * message queue delivers in order when target is busy

  * the app (Nap.app)
    * one window = one directory (cwd at launch)
    * window title = directory basename
    * left: sidebar, list of agent cards
    * right: terminal panel (xterm.js), shows selected card's session
    * layout
      * sidebar: ~250px, collapsible (Cmd+B)
      * terminal: fills the rest
      * no split panes, no tabs within the terminal panel
    * card shows: name, status dot (green=running, gray=exited, blue=done), parent name if spawned by another
    * click card → switch terminal
    * dark translucent theme
      * BrowserWindow: transparent + vibrancy 'under-window'
      * xterm background: rgba(30,30,30,0.7) — test if WebGL renderer respects this
      * if not: fall back to canvas, measure perf difference

  * terminal management
    * each terminal = { id, name, pty, xterm, status, parentId, messageQueue[] }
    * pty (node-pty) stays alive when tab is hidden
    * xterm.js + WebGL addon
      * tension: GPU context limit ~16, we want 10+ terminals
      * strategy: keep active + 2 recent terminals with WebGL, dispose rest
      * on switch: re-init WebGL, re-render from pty buffer
      * test: does this feel instant or is there a flash?
    * scrollback: 10,000 lines default, stress test at 50,000
    * addon-fit for resize, addon-search for find-in-scrollback

  * the nap CLI
    * node script, talks to Nap.app over unix socket at ~/.nap/sock
    * app starts socket server on launch, removes on quit
    * protocol: newline-delimited JSON, request-response
    * if app not running: "nap is not running" + exit 1
    * commands:
      * nap start <prompt> [--name <n>] [--cwd <path>]
        * creates pty, creates card, runs: claude <prompt> in the pty
        * --name defaults to "agent-1", "agent-2" etc
        * returns JSON: { id, name } to stdout
        * if called from inside a nap terminal, auto-sets parentId
          * how: Nap.app sets NAP_SESSION_ID env var in each pty
          * CLI reads it, sends as parentId in request
      * nap poke <name> "message"
        * enqueues message for target session
        * delivery: Nap.app writes to pty input when target is at prompt
        * prompt detection: match Claude Code's prompt pattern in pty output
          * good enough for poc: detect idle after 2s of no output
          * better: regex on the ╰─ or $ prompt characters
        * if target is busy: hold in queue, deliver on next prompt
        * sequential: next message only after previous one appears in output
      * nap nap <name> [--timeout <s>]
        * blocks until target's status becomes "done" or "exited"
        * polls over socket every 1s (dumb but works for poc)
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

  * the integration test
    * launch Nap.app in ~/test-project
    * from built-in first terminal:
      * nap start "echo hello world" --name agent-a
      * nap start "sleep 10 && nap done 'finished sleeping'" --name agent-b
      * nap ps → shows 3 sessions (original + a + b)
      * nap poke agent-a "wake up"
      * nap peek agent-a → terminal switches
      * nap nap agent-b --timeout 15 → blocks, returns when agent-b runs nap done
    * stretch test:
      * spawn 10 terminals running `top` or similar
      * switch between them rapidly
      * measure: CPU, memory, switch latency
      * test transparency on macOS Ventura + Sonoma + Sequoia

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

