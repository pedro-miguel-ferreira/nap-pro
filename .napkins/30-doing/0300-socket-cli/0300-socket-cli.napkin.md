* socket server + CLI
  * the nervous system — how the outside world talks to Nap.app
  * proves: CLI → socket → app round-trip < 50ms

* socket server (app side)
  * unix socket at ~/.nap/sock
  * net.createServer in main process
  * protocol: newline-delimited JSON
    * request: { type, id, ...params }
    * response: { id, ok, ...data } or { id, error, message }
    * id for matching request to response
  * lifecycle
    * create on app launch
    * remove on quit
      * signal handlers: SIGTERM, SIGINT, beforeExit
      * also: app.on('will-quit')
    * if socket file already exists on launch
      * try connect — if refused, it's stale, unlink and proceed
      * if connects, another instance is running — show error, quit

* the nap CLI
  * standalone node script
    * not bundled in electron — runs in any terminal
    * connects to ~/.nap/sock
    * if socket doesn't exist or connection refused: "nap is not running" + exit 1
  * commands
    * nap start <command> [--name <n>] [--cwd <path>]
      * sends: { type: "start", command, name, cwd, parentId }
      * parentId read from NAP_SESSION_ID env var (may be null)
      * app creates pty, creates card, runs command
      * app sets NAP_SESSION_ID=<id> in new pty's env
      * returns: { id, name }
      * --name defaults to "agent-N" (auto-increment)
    * nap ps
      * sends: { type: "ps" }
      * returns: [{ id, name, status, parent, cwd, uptime }]
      * pretty-prints table for human use
      * if --json flag, raw JSON only
    * nap peek <name>
      * sends: { type: "peek", name }
      * app sets activeTerminalId, opens sidebar if collapsed
    * nap kill <name>
      * sends: { type: "kill", name }
      * app kills pty process
      * status → exited (gray dot)
      * card stays for inspection
    * nap close <name>
      * sends: { type: "close", name }
      * kills pty + removes card + disposes terminal
  * name resolution
    * commands accept name, not id
    * if ambiguous (multiple matches): error, list matches
    * if not found: error with "did you mean?" if close match exists
