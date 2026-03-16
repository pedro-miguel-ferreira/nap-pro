* socket server + CLI — test cases (v2)

* T-0300-01: CLI → socket → app round-trip under 50ms
  * size: medium (Playwright + Electron)
  * flow: CLI connects to ~/.nap/sock → sends ndjson request → app processes → responds → CLI parses
  * subsystems: net client (CLI), net server (main process), ndjson protocol
  * verification: automatable
    * from within a nap terminal (or via `app.evaluate()`), run `nap ps` 100 times in a loop
    * measure each round-trip: `const start = Date.now(); execSync('nap ps'); const elapsed = Date.now() - start;`
    * assert p95 < 50ms
    * alternatively, use `app.evaluate()` to connect directly to the socket and measure server-side latency (eliminates CLI startup overhead)
    * if CLI startup overhead dominates (node cold start), measure socket-only latency separately
  * likely to break: per-command connect/disconnect overhead — each `nap` invocation is a fresh socket connection + JSON parse + response + close

* T-0300-02: ndjson protocol handles split and concatenated messages
  * size: small (Vitest)
  * flow: TCP delivers partial JSON, then the rest — or two messages in one chunk
  * subsystems: ndjson parser (both sides)
  * verification: automatable
    * unit test the ndjson parser/splitter function directly in Vitest
    * test cases:
      * split message: feed `'{"type":"ps","id":1' ` then `'}\n'` — assert parses to one complete message
      * concatenated: feed `'{"type":"ps","id":1}\n{"type":"ps","id":2}\n'` — assert parses to two messages
      * trailing partial: feed `'{"type":"ps","id":1}\n{"type":"ps"'` — assert yields one message, buffers the rest
      * empty lines: feed `'\n\n{"type":"ps","id":1}\n'` — assert ignores empties, parses one message
    * no Electron needed — pure string parsing logic
  * likely to break: naive `data.toString().split('\n').map(JSON.parse)` — fails on partial messages, throws on empty lines

* T-0300-03: stale socket detection on app launch
  * size: medium (Playwright + Electron)
  * flow: stale socket file exists → app launches → tries connect → ECONNREFUSED → unlinks → creates fresh server
  * subsystems: socket lifecycle (main process)
  * verification: automatable
    * before launching app: create a dummy file at `~/.nap/sock` (just a regular file, not a real socket)
    * launch Electron app via Playwright
    * assert app starts successfully (window appears)
    * assert socket is now a working unix socket: `app.evaluate(() => net.createConnection('~/.nap/sock'))` connects
    * alternative: use node `net.createConnection` from test to verify the new socket accepts connections
  * likely to break: app sees existing file, assumes another instance, quits — must try connect first, not just `fs.existsSync`

* T-0300-04: two app instances detect each other
  * size: medium (Playwright + Electron)
  * flow: app A running → app B launches → B connects to sock → A responds → B shows error and quits
  * subsystems: socket lifecycle (main process)
  * verification: automatable
    * launch app A via Playwright — verify socket is active
    * launch app B as a second Electron process
    * assert B exits (or shows error dialog) without corrupting A's socket
    * verify A is still functional: send a socket request from test, get valid response
    * verify socket file still works for A: `net.createConnection('~/.nap/sock')` succeeds
  * likely to break: B unlinks A's socket and creates its own — A's server is orphaned from filesystem

* T-0300-05: NAP_SESSION_ID propagates through parent-child chain
  * size: medium (Playwright + Electron)
  * flow: app creates terminal → sets NAP_SESSION_ID in pty env → child reads it → CLI sends as parentId
  * subsystems: pty environment, CLI env reading, app parent tracking
  * verification: automatable
    * create terminal A via store — A gets an id (e.g., "term-1")
    * from A's pty, run: `echo $NAP_SESSION_ID` — read xterm buffer, verify it outputs A's id
    * from A, run: `nap start "echo $NAP_SESSION_ID" --name child`
    * read child's parentId from store: `page.evaluate(() => useTerminalStore.getState().terminals.find(t => t.name === 'child')?.parentId)`
    * assert child's parentId === A's id
    * read child's xterm buffer — verify its NAP_SESSION_ID is different from A's (child got its own)
    * three-level test: child starts grandchild — verify grandchild's parentId = child's id, not A's
  * likely to break: child inherits parent's NAP_SESSION_ID instead of getting a fresh one — if app doesn't override the env var in the new pty

* T-0300-06: nap start creates terminal with correct pty setup
  * size: medium (Playwright + Electron)
  * flow: CLI sends { type: "start", command, name, cwd, parentId } → app creates pty → shell -c command → card appears
  * subsystems: CLI, socket protocol, pty creation (main), store (renderer)
  * verification: automatable
    * from first terminal's pty, write: `nap start "echo hello-from-start && sleep 2" --name test-1\n`
    * poll store for new terminal: `page.evaluate(() => useTerminalStore.getState().terminals.find(t => t.name === 'test-1'))`
    * assert found with status 'running'
    * switch to test-1, read xterm buffer — verify "hello-from-start" appears
    * verify command ran in a shell (pipes work): `nap start "echo foo | cat" --name test-2` — buffer shows "foo"
  * likely to break: command passed directly to pty.spawn instead of through `shell -c` — pipes and && don't work

* T-0300-07: name resolution — exact match, not found, ambiguous
  * size: small (Vitest)
  * flow: name lookup in session map → exact match, error with suggestion, or ambiguous error
  * subsystems: name resolution function (main process)
  * verification: automatable
    * unit test the name resolution function directly
    * test cases:
      * exact match: sessions = ["agent-1", "agent-11"], lookup "agent-1" → returns "agent-1" (not "agent-11")
      * not found: lookup "nonexistent" → error
      * close match: lookup "agnet-1" → error with "did you mean: agent-1?"
    * also test as medium: from a real terminal, `nap peek nonexistent` → verify error message and exit code 1
  * likely to break: substring or prefix matching instead of exact — "agent-1" matches both "agent-1" and "agent-11"

* T-0300-08: CLI behavior when app is not running
  * size: small (Vitest or direct node execution)
  * flow: CLI tries to connect → ENOENT or ECONNREFUSED → clean error message
  * subsystems: CLI connection logic
  * verification: automatable
    * ensure no socket file at ~/.nap/sock (or use a test-specific path)
    * run CLI as child process: `execSync('node cli.js ps', { env: { NAP_SOCKET: '/tmp/nap-test-nonexistent.sock' } })`
    * assert exit code === 1
    * assert stdout/stderr contains "nap is not running"
    * assert no stack trace in output
    * also test: stale socket file exists but no server → ECONNREFUSED → same "not running" message
  * likely to break: unhandled ECONNREFUSED or ENOENT → ugly stack trace instead of clean error

* T-0300-09: socket cleanup on app quit (normal and signal)
  * size: medium (Playwright + Electron)
  * flow: app quits → signal handler → unlink ~/.nap/sock
  * subsystems: socket lifecycle, signal handlers
  * verification: automatable
    * launch app, verify socket file exists: `fs.existsSync('~/.nap/sock')`
    * quit via Electron: `electronApp.close()`
    * assert socket file is gone: `!fs.existsSync('~/.nap/sock')`
    * second run: launch app, send SIGTERM: `process.kill(electronApp.pid, 'SIGTERM')`
    * assert socket file is gone
    * third run: SIGINT — same assertion
    * NOT testable: SIGKILL (hard kill) — this is the accepted stale socket edge case, handled by T-0300-03
  * likely to break: signal handler registered for `will-quit` but not `SIGTERM` — or vice versa
