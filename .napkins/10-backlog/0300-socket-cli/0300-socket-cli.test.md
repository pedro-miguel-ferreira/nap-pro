* socket server + CLI — test cases

* T-0300-01: CLI → socket → app round-trip under 50ms
  * flow: CLI connects to ~/.nap/sock → sends ndjson request → app processes → responds → CLI parses
  * subsystems: net client (CLI), net server (main process), ndjson protocol
  * action: run `nap ps` 100 times, measure round-trip
  * expected: p95 latency < 50ms (the stated POC target)
  * likely to break: connection setup overhead — CLI connects/disconnects per command
    * each command = new socket connection + JSON parse + response + close
    * if connection setup alone takes 20ms, that eats into the budget
    * also: if the main process is busy (heavy pty output), socket handler gets starved

* T-0300-02: ndjson protocol handles split and concatenated messages
  * flow: TCP can split one JSON message across packets, or concatenate multiple messages in one packet
  * subsystems: ndjson parser on both sides
  * action: send a request that's larger than typical (long command string), and send rapid-fire requests
  * expected: each message parsed correctly regardless of TCP framing
  * likely to break: naive parsing — reading until \n without buffering partial messages
    * symptom: "unexpected end of JSON input" when a message arrives in two chunks
    * or: two messages arrive in one read → second message silently dropped
    * must accumulate buffer, split on \n, parse each complete line

* T-0300-03: stale socket detection on app launch
  * flow: app launches → checks if ~/.nap/sock exists → tries to connect → connection refused → unlinks stale file → creates new server
  * subsystems: socket lifecycle (main process)
  * setup: leave a stale socket file from a previous hard crash (SIGKILL/OOM)
  * action: launch app
  * expected: app detects stale socket, removes it, starts normally
  * likely to break: app sees existing socket, assumes another instance is running, quits
    * the spec says: try connect → if refused, it's stale → unlink
    * if the check is just `fs.existsSync(sock)` without the connect test → false positive

* T-0300-04: two app instances detect each other
  * flow: app A is running → app B launches → B tries to connect to sock → A responds → B knows another instance is running
  * subsystems: socket lifecycle (main process)
  * action: launch second Nap.app while first is running
  * expected: second instance shows error message and quits without corrupting first instance's socket
  * likely to break: second instance unlinks the socket and creates its own, orphaning first instance's server
    * first instance's server is now disconnected from the filesystem — no new clients can connect
    * must check connect success, not just file existence

* T-0300-05: NAP_SESSION_ID propagates through parent-child chain
  * flow: app creates terminal → sets NAP_SESSION_ID=<id> in pty env → child process reads it → CLI sends as parentId
  * subsystems: pty environment, CLI env reading, app parent tracking
  * setup: shell terminal (A) runs `nap start "echo $NAP_SESSION_ID" --name child`
  * action: check child's NAP_SESSION_ID and child's parentId
  * expected: child's parentId = A's id, child has its own NAP_SESSION_ID (not A's)
  * likely to break: child inherits A's NAP_SESSION_ID instead of getting its own
    * if the app doesn't set a fresh NAP_SESSION_ID for the new pty, child thinks it IS the parent
    * also: nested chain — A starts B, B starts C — C's parentId should be B, not A
    * verify: three-level chain, each level has correct parentId

* T-0300-06: nap start creates terminal with correct pty setup
  * flow: CLI sends { type: "start", command, name, cwd, parentId } → app creates pty → shell -c command → card appears
  * subsystems: CLI, socket protocol, pty creation (main), sidebar update (renderer)
  * action: `nap start "echo hello && sleep 2 && echo done" --name test-1`
  * expected: terminal created, command runs in a shell, card appears in sidebar with name "test-1" and green dot
  * likely to break: command execution — `pty.spawn(shell, ['-c', command])` vs `pty.spawn(command)`
    * if command is passed directly (not through shell -c), pipes and && don't work
    * also: --cwd not applied → command runs in wrong directory

* T-0300-07: name resolution — not found, ambiguous, close match
  * flow: CLI sends request with name → app looks up terminal by name → resolves or errors
  * subsystems: name resolution (main process)
  * action: `nap peek nonexistent`, then create "agent-1" and "agent-11", then `nap peek agent-1`
  * expected: not-found returns error with suggestion if close match; exact match resolves even when prefix matches exist
  * likely to break: substring matching — "agent-1" matches both "agent-1" and "agent-11"
    * must be exact match, not prefix/contains
    * "did you mean?" suggestions need fuzzy matching but resolution must be exact

* T-0300-08: CLI behavior when app is not running
  * flow: CLI tries to connect to ~/.nap/sock → socket file doesn't exist or connection refused
  * subsystems: CLI connection logic
  * action: run `nap ps` with no app running
  * expected: prints "nap is not running", exit code 1, no stack trace
  * likely to break: unhandled ECONNREFUSED or ENOENT exception → ugly stack trace instead of clean message
    * also: socket file exists but app crashed → ECONNREFUSED → same "not running" message

* T-0300-09: socket cleanup on app quit (normal and signal)
  * flow: app quits → signal handler fires → unlink ~/.nap/sock
  * subsystems: socket lifecycle, signal handlers (SIGTERM, SIGINT, beforeExit, will-quit)
  * action: quit app via Cmd+Q, then via kill -TERM, then via kill -INT
  * expected: socket file removed in all cases
  * likely to break: signal handler not registered for all signals
    * app.on('will-quit') works for Cmd+Q but not for SIGTERM from `kill`
    * process.on('SIGTERM') works for kill but maybe not for Electron's quit flow
    * need both
    * NOT testable for SIGKILL/OOM — that's the accepted stale socket edge case
