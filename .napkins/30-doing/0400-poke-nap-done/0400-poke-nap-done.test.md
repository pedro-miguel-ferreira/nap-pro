* poke, nap, done — test cases (v2)

* T-0400-01: poke delivers message to pty stdin
  * size: medium (Playwright + Electron)
  * flow: CLI sends { type: "poke", name, message } → app enqueues → delivery loop writes message + \n to pty.write()
  * subsystems: socket protocol, message queue, pty stdin
  * verification: automatable
    * create terminal B running `cat` (echoes stdin)
    * send poke via socket (or CLI): `nap poke B "hello from A"`
    * read B's xterm buffer: `page.evaluate(() => getTerminal('term-2').terminal.buffer.active.getLine(N).translateToString())`
    * assert buffer contains "hello from A" (cat echoed it)
    * also test special characters: `nap poke B 'quotes "and" backslashes \\'` — verify raw text arrives, not shell-interpreted
  * likely to break: missing trailing newline — message sits in stdin buffer, shell/cat doesn't process it until Enter

* T-0400-02: poke queue preserves order with 500ms delay
  * size: medium (Playwright + Electron)
  * flow: three pokes rapid-fire → all enqueued → delivery loop writes with 500ms gaps
  * subsystems: message queue, delivery timer
  * verification: automatable
    * create terminal B running `cat`
    * rapid-fire three pokes: "first", "second", "third"
    * all three CLI calls return immediately (enqueue, not delivery)
    * wait 2s for delivery to complete
    * read B's xterm buffer — scan lines for "first", "second", "third"
    * assert they appear in that order (line number of "first" < "second" < "third")
    * timing verification: use `app.evaluate()` to instrument the delivery loop
      * record timestamps when each pty.write happens
      * assert gaps between deliveries are ~500ms (±100ms tolerance)
    * also: poke a fourth message while first three are delivering — verify it queues and delivers after third
  * likely to break: delivery loop fires all at once (no setTimeout between writes) or uses LIFO instead of FIFO

* T-0400-03: poke to dead terminal returns error
  * size: medium (Playwright + Electron)
  * flow: terminal X exited → poke request → app checks status → rejects at enqueue
  * subsystems: message queue guard, status check
  * verification: automatable
    * create terminal X, run `exit\n` to make it exit
    * wait for status to become 'exited'
    * send poke via socket: `{ type: "poke", name: "X", message: "hello" }`
    * assert response: `{ error: "X is not running" }` (or similar)
    * verify message was NOT enqueued — no delivery attempted, B's buffer unchanged
    * same test for status 'done' — poke to a done terminal also rejects
  * likely to break: enqueue succeeds but delivery fails silently (pty is dead, write throws) — spec says reject at the gate

* T-0400-04: nap nap blocks and unblocks on done
  * size: big (full CLI + socket + pty)
  * flow: CLI sends status polls every 1s → target calls nap done → status flips → CLI detects on next poll → exits
  * subsystems: CLI polling loop, socket protocol, status tracking, nap done signaling
  * verification: automatable
    * `nap start "sleep 2 && nap done 'result-42'" --name worker`
    * in parallel: `nap nap worker --timeout 10`
    * measure wall time of nap nap — should be ~2-3s (2s sleep + up to 1s poll interval)
    * assert nap nap stdout contains "result-42"
    * assert nap nap exit code === 0
    * assert worker's status is 'done' in store
    * the 1s polling means up to 1s extra latency — this is acceptable per spec
  * likely to break: polling misses the done transition — CLI polls, then target goes done, then CLI polls again 1s later — this should work, but if status is cleared between polls it breaks

* T-0400-05: nap nap on already-done terminal returns immediately
  * size: medium (Playwright + Electron)
  * flow: terminal already status='done' with done-message → CLI polls → first poll returns done → CLI exits immediately
  * subsystems: CLI polling, status check, done-message storage
  * verification: automatable
    * create terminal, set its status to 'done' with done-message "early-bird" (via nap done or direct store manipulation)
    * run `nap nap worker` with timeout 10
    * measure wall time — should be < 2s (one poll round-trip, not 10s)
    * assert stdout contains "early-bird"
    * assert exit code 0
  * likely to break: CLI enters poll loop unconditionally, waits 1s before first status check — should check immediately on connect

* T-0400-06: nap nap timeout exits without killing target
  * size: medium (Playwright + Electron)
  * flow: CLI polls until timeout expires → prints error → exits 1 → target still running
  * subsystems: CLI timeout logic
  * verification: automatable
    * `nap start "sleep 999" --name stuck`
    * `nap nap stuck --timeout 3` — run as child process with timeout
    * measure wall time — should be ~3s
    * assert exit code === 1
    * assert output contains "timeout waiting for stuck"
    * assert stuck's status is still 'running': `page.evaluate(() => useTerminalStore.getState().terminals.find(t => t.name === 'stuck')?.status === 'running')`
    * verify stuck's pty is still alive: `app.evaluate(() => ptys.has(stuckId))`
  * likely to break: timeout handler kills the target — spec says exit with error, don't kill

* T-0400-07: nap done sets status, pokes parent, stores message
  * size: medium (Playwright + Electron)
  * flow: child sends { type: "done", message, sessionId } → app sets status=done → pokes parent → stores done-message
  * subsystems: status management, poke delivery, done-message storage
  * verification: automatable
    * create parent terminal, from it: `nap start "sleep 1 && nap done 'the answer is 42'" --name child`
    * verify three things independently:
      * 1) child's status: poll `page.evaluate(() => useTerminalStore.getState().terminals.find(t => t.name === 'child')?.status)` until 'done'
      * 2) done-message stored: read child's done-message from store/app state
      * 3) parent received poke: read parent's xterm buffer — "the answer is 42" appears as input
    * also: if parent has already exited, does status still change? (should: yes — status change is independent of poke delivery)
  * likely to break: three things must happen in sequence — if poke to parent fails (parent exited), the error may prevent status change or message storage

* T-0400-08: nap done with no NAP_SESSION_ID errors cleanly
  * size: small (direct node execution)
  * flow: CLI reads process.env.NAP_SESSION_ID → not set → should error before sending request
  * subsystems: CLI env reading
  * verification: automatable
    * run `node cli.js done "test"` with NAP_SESSION_ID unset (not inside nap)
    * assert exit code === 1
    * assert output contains "not running inside nap" (or similar)
    * assert no socket connection attempted (or if attempted, server returns specific error)
    * test does NOT need Electron running — it's a CLI-only check
  * likely to break: CLI sends request anyway with null sessionId → app crashes looking up null, or returns generic "session not found" instead of specific error

* T-0400-09: nap done called twice is a no-op
  * size: medium (Playwright + Electron)
  * flow: child calls nap done "first" → status=done → child calls nap done "second" → no-op
  * subsystems: status management, idempotency guard
  * verification: automatable
    * create terminal, run nap done "first" from it
    * verify status is 'done', done-message is "first"
    * run nap done "second" from same terminal
    * verify status still 'done', done-message still "first" (not overwritten)
    * verify parent was NOT poked twice:
      * if parent exists, count poke deliveries — should be exactly 1
      * read parent's xterm buffer — "first" appears once, "second" does not appear
  * likely to break: second nap done overwrites done-message or pokes parent again

* T-0400-10: full spawn-wait-receive loop
  * size: big (full CLI + socket + pty chain)
  * flow: parent starts child → nap nap child → child works → nap done "result" → parent unblocks → parent uses result
  * subsystems: everything — CLI, socket, pty, message queue, status, polling
  * verification: automatable
    * from first terminal, run a script:
      ```
      nap start "sleep 2 && nap done 'result-42'" --name worker
      RESULT=$(nap nap worker --timeout 10)
      echo "GOT: $RESULT"
      ```
    * read first terminal's xterm buffer — verify "GOT: result-42" appears
    * assert worker's status is 'done'
    * assert parent's terminal is back at shell prompt
    * this is THE critical path — the core NAP loop
  * likely to break: timing between done signal and nap nap poll pickup — message must survive the polling gap
