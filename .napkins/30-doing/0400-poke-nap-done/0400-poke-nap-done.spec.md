* poke, nap, done — min spec

* poke delivery
  * write message + newline to pty.write()
  * add newline at end so it acts like pressing Enter
  * delay between queued messages: 500ms
    * configurable later, hardcoded for POC
  * delivery happens in main process (app side)
    * CLI sends poke request, app enqueues and delivers
    * CLI returns immediately after enqueue — doesn't wait for delivery

* nap nap connection model
  * CLI connects, sends { type: "nap", name, timeout }
  * app does NOT hold the connection
    * CLI polls: sends { type: "status", name } every 1s
    * simpler, no long-lived connection management
  * on done/exited: CLI prints done-message and exits 0
  * on timeout: CLI prints "timeout waiting for <name>" and exits 1

* nap done
  * sends { type: "done", message } to socket
  * app looks up caller by NAP_SESSION_ID env var
    * how: request includes sessionId, read from env by CLI
  * app sets status = "done"
  * app enqueues poke to parent (if exists)
    * same poke mechanism, same queue
  * done-message stored on the terminal record
    * so nap nap can return it even if it polls after the fact

* edge cases
  * poke to a dead terminal (exited/done): return error, don't enqueue
  * nap nap on already-done terminal: return immediately with done-message
  * nap done called twice: second call is a no-op (status already "done")
  * nap done with no NAP_SESSION_ID: error "not running inside nap"
