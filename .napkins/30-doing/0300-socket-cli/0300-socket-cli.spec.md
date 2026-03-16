* socket server + CLI — min spec

* socket
  * path: ~/.nap/sock (hardcoded for POC)
  * protocol: ndjson (newline-delimited JSON)
    * one JSON object per line
    * each request has a unique id (incrementing integer from CLI)
    * responses echo the id back
  * no auth, no encryption — local socket, single user
  * max message size: don't enforce for POC, but don't send terminal output over socket

* CLI is a separate package/entrypoint
  * not electron code — pure node
  * must work when run via `node cli.js` or as a symlinked binary `nap`
  * no electron dependencies
  * connects, sends one request, waits for response, disconnects
    * exception: nap nap (0400) holds connection open for polling

* NAP_SESSION_ID
  * app generates unique id per terminal (uuid or nanoid)
  * sets NAP_SESSION_ID=<id> in pty's env
  * CLI reads process.env.NAP_SESSION_ID
  * if present: include as parentId in nap start requests
  * if absent: parentId is null (top-level invocation)

* nap start
  * command is a string, passed to shell via pty.spawn(shell, ['-c', command])
    * not parsed, not validated — shell handles it
  * --cwd defaults to caller's cwd (sent by CLI from process.cwd())
  * auto-naming: app tracks a counter, "agent-1", "agent-2", etc.

* error handling
  * socket not found → "nap is not running" exit 1
  * unknown command type → { error: "unknown command" }
  * name not found → { error: "no session named 'x'" }
  * name resolves to multiple → { error: "ambiguous name" } (unlikely with auto-naming)
