* poke, nap, done — test cases

* T-0400-01: poke delivers message to pty stdin as typed input
  * flow: CLI sends { type: "poke", name, message } → app enqueues → delivery loop writes to pty.write(message + "\n")
  * subsystems: CLI, socket protocol, message queue, pty stdin
  * setup: terminal B runs `cat` (waits for stdin, echoes it)
  * action: `nap poke agent-b "hello from A"`
  * expected: "hello from A" appears in B's terminal as if typed, cat echoes it back
  * likely to break: missing newline — message written without trailing \n, so it sits in stdin buffer
    * shell/process won't process input until it sees Enter (newline)
    * also: message contains special characters (quotes, backslashes) — must arrive raw, not shell-interpreted

* T-0400-02: poke queue preserves order with 500ms delay
  * flow: three pokes rapid-fire → all enqueued → delivery loop pops and writes with 500ms gaps
  * subsystems: message queue, delivery timer
  * setup: terminal B runs `cat`
  * action: `nap poke B "first"` then `nap poke B "second"` then `nap poke B "third"` (rapid fire)
  * expected: B sees "first", 500ms pause, "second", 500ms pause, "third" — in exact order
  * likely to break: delivery loop fires all at once — no delay between writes
    * or: setTimeout/setInterval drift — messages bunch up or arrive with inconsistent timing
    * or: delivery loop processes queue in wrong order (LIFO instead of FIFO)
  * also test: poke a fourth message while delivery of first three is in progress — fourth should queue and deliver after third

* T-0400-03: poke to dead terminal returns error
  * flow: CLI sends poke for terminal with status "exited" or "done"
  * subsystems: message queue guard, status check
  * setup: terminal X has exited (gray dot)
  * action: `nap poke agent-x "hello"`
  * expected: error response "agent-x is not running", message NOT enqueued
  * likely to break: enqueue succeeds but delivery fails (pty is dead) — silent failure, no error to caller
    * spec says: check status before enqueue, reject at the gate
    * if check happens at delivery time (not enqueue time), CLI gets success but message vanishes

* T-0400-04: nap nap blocks and unblocks on done
  * flow: CLI sends { type: "nap", name, timeout } → polls { type: "status" } every 1s → target calls nap done → status becomes "done" → CLI exits
  * subsystems: CLI polling loop, socket protocol, status tracking
  * setup: `nap start "sleep 3 && nap done 'result-42'" --name worker`
  * action: `nap nap worker --timeout 10`
  * expected: CLI blocks ~3 seconds, then prints "result-42" and exits 0
  * likely to break: polling timing — done status set between polls
    * child calls `nap done`, status flips to "done", but CLI just polled 0.5s ago — next poll picks it up 0.5s later
    * this is fine (up to 1s delay), but verify it doesn't miss the transition entirely
    * edge case: what if CLI starts polling AFTER child already called done? must return immediately

* T-0400-05: nap nap on already-done terminal returns immediately
  * flow: CLI sends status poll for terminal already in "done" state
  * subsystems: CLI polling, status check
  * setup: terminal worker already called nap done with message "early-bird"
  * action: `nap nap worker`
  * expected: returns "early-bird" immediately, does not poll for 600 seconds
  * likely to break: CLI always enters poll loop without checking initial status
    * first poll returns status=done, but CLI waits 1s before checking response
    * should check immediately: if already done, return at once

* T-0400-06: nap nap timeout exits without killing target
  * flow: CLI polls until timeout, then exits with error
  * subsystems: CLI timeout logic
  * setup: `nap start "sleep 999" --name stuck`
  * action: `nap nap stuck --timeout 3`
  * expected: after 3 seconds, prints "timeout waiting for stuck", exit code 1, stuck is still running
  * likely to break: timeout handler kills the target terminal
    * spec says: exit with error, don't kill target
    * natural instinct: "if we timed out waiting, the thing must be stuck, kill it"
    * also: verify stuck's status is still "running" after timeout

* T-0400-07: nap done sets status, pokes parent, stores message
  * flow: child calls nap done "result" → CLI sends { type: "done", message, sessionId } → app sets status=done → pokes parent → stores done-message
  * subsystems: CLI, socket protocol, status management, poke delivery, done-message storage
  * setup: parent starts child, parent runs `nap nap child`
  * action: child runs `nap done "the answer is 42"`
  * expected: child's dot turns blue, parent receives "the answer is 42" as poke input, parent's nap nap returns "the answer is 42"
  * likely to break: three things must happen atomically-ish: status change, parent poke, message storage
    * if poke fails (parent already exited), does status still change? (should: yes)
    * if message not stored, nap nap has nothing to return
    * verify all three independently

* T-0400-08: nap done with no NAP_SESSION_ID errors cleanly
  * flow: CLI reads process.env.NAP_SESSION_ID → not set → sends done request without sessionId
  * subsystems: CLI env reading, app session lookup
  * action: run `nap done "test"` from a regular terminal (not inside Nap.app)
  * expected: error "not running inside nap", exit code 1
  * likely to break: app crashes trying to look up null sessionId
    * or: CLI sends the request anyway, app finds no matching terminal, returns generic error
    * should be a clear, specific error message

* T-0400-09: nap done called twice is a no-op
  * flow: child calls nap done "first" → status=done → child calls nap done "second"
  * subsystems: status management, idempotency guard
  * action: run `nap done "first"` then `nap done "second"` from same terminal
  * expected: second call is no-op — status stays "done", done-message stays "first", parent not poked again
  * likely to break: parent gets poked twice with different messages
    * or: done-message gets overwritten, nap nap returns "second" instead of "first"

* T-0400-10: the full spawn-wait-receive loop
  * flow: parent starts child → nap nap child → child works → nap done "result" → parent unblocks with "result" → parent continues
  * subsystems: everything — CLI, socket, pty, message queue, status, polling
  * this is THE critical path — the core NAP loop
  * setup: shell runs a script that orchestrates the full cycle
  * action: script spawns worker, waits, worker finishes, script gets result
  * expected: parent shell receives the done-message and can use it in subsequent commands
  * likely to break: anywhere in the chain — this test catches integration failures that per-component tests miss
    * most fragile point: timing between done signal and nap nap poll pickup
    * second most fragile: poke delivery writing to parent's stdin while parent is blocked in nap nap CLI
