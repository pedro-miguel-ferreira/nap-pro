* integration + stress test — test cases

* T-0500-01: full CLI command sequence runs unattended
  * flow: integration script runs every CLI command in sequence, asserts results
  * subsystems: all — socket, pty, sidebar, poke, nap, done
  * action: script executes:
    * nap start "echo hello world" --name agent-a → assert returns { id, name: "agent-a" }
    * nap start "sleep 5 && nap done 'finished sleeping'" --name agent-b → assert returns { id, name: "agent-b" }
    * nap ps → assert shows 3 sessions (shell + agent-a + agent-b) with correct names and statuses
    * nap poke agent-a "wake up" → assert no error
    * nap peek agent-a → assert no error (can't easily assert UI switch from script)
    * nap nap agent-b --timeout 15 → assert returns "finished sleeping" with exit 0
    * nap kill agent-a → assert no error
    * nap ps → assert agent-a status is "exited"
    * nap close agent-a → assert no error
    * nap ps → assert agent-a is gone, 2 sessions remain
  * expected: all assertions pass, script exits 0
  * likely to break: ordering dependencies — each step assumes previous step's state
    * if nap start is slow (pty spawn takes >1s), the nap ps right after might not see the terminal yet
    * if nap done message doesn't arrive before nap nap timeout, the whole chain fails
    * need adequate sleep/retry between steps, or poll for expected state

* T-0500-02: parent-child chain three levels deep
  * flow: shell → starts parent → parent starts child → child calls nap done → parent receives, calls nap done → shell receives
  * subsystems: NAP_SESSION_ID propagation, poke delivery chain, nap nap polling
  * action: shell runs:
    * nap start "nap start 'sleep 2 && nap done result-from-child' --name grandchild && nap nap grandchild && nap done got-$?" --name child
    * nap nap child --timeout 15
  * expected: shell unblocks with child's done message, nap ps shows correct parent chain: shell → child → grandchild
  * likely to break: NAP_SESSION_ID environment variable doesn't propagate correctly through nested pty spawns
    * child's pty has NAP_SESSION_ID=child-id
    * grandchild's nap start reads child's NAP_SESSION_ID → sets parentId correctly
    * if env vars don't cascade through shell -c invocation, parentId is wrong

* T-0500-03: 10 concurrent terminals with high-output commands
  * flow: spawn 10 terminals each running output-heavy command → all running simultaneously
  * subsystems: pty management, xterm.js buffers, WebGL contexts, memory
  * action: `for i in {1..10}; do nap start "yes | head -n 10000" --name stress-$i; done`
  * expected: all 10 spawn, all produce output, app doesn't crash or freeze
  * likely to break: 10 ptys dumping data simultaneously overwhelms IPC bridge
    * main process is single-threaded — 10 pty.onData handlers firing concurrently
    * each fires IPC to renderer, renderer has 10 xterm.write() streams
    * CPU spikes, UI thread starves, app appears frozen
  * metric: CPU peak during burst, recovery time after commands finish

* T-0500-04: rapid terminal switching under load — no visual corruption
  * flow: 10 terminals active → click through all cards rapidly
  * subsystems: DOM reparenting, WebGL reattach, fitAddon, sidebar state
  * setup: 10 terminals with different content (some scrollback, some active output)
  * action: click through all 10 cards in sequence, <200ms between clicks
  * expected: each switch shows the correct terminal content, no terminal shows another's buffer
  * likely to break: the DOM reparent + fitAddon.fit() race condition from 0200-04, amplified by 10 terminals
    * with load: fit() takes longer, next click fires before fit() completes
    * wrong terminal gets resized, or reattach shows stale DOM state
  * metric: switch latency (should be < 100ms perceived)

* T-0500-05: 10 WebGL contexts simultaneously — no context lost
  * flow: each terminal has its own WebGL addon → 10 contexts active on GPU
  * subsystems: addon-webgl, GPU context management
  * setup: 10 terminals created and rendered at least once
  * action: listen for webglcontextlost event on all 10 terminals, run for 30 seconds
  * expected: zero context-lost events, all terminals render correctly when switched to
  * likely to break: GPU has a limit (~16 contexts on most hardware)
    * 10 should be fine, but some GPUs report lower limits
    * if a context is lost, that terminal falls back to... nothing, unless canvas fallback is wired
    * this is the "it works on my machine" test — CI/CD environments may differ

* T-0500-06: memory stays bounded with scrollback pressure
  * flow: 10 terminals each accumulate large scrollback (10k lines) → measure total memory
  * subsystems: xterm.js buffer management, V8 heap
  * setup: 10 terminals, each runs `seq 1 20000` (fills 10k scrollback, older lines evicted)
  * action: measure memory before, after spawning, after scrollback fills
  * expected: memory < 500MB total (ballpark from spec), grows linearly not exponentially
  * likely to break: scrollback eviction not working — buffer grows unbounded
    * xterm.js scrollback limit is set to 10k, but does it actually evict?
    * 10 terminals × 10k lines × ~100 bytes/line = ~10MB of text — memory should be dominated by xterm objects, not raw text
    * if memory is >500MB, something is leaking (DOM nodes, WebGL textures, pty buffers)

* T-0500-07: poke delivery under contention — multiple agents poking one target
  * flow: agents A, B, C all poke agent D simultaneously
  * subsystems: message queue, delivery loop, pty stdin
  * setup: terminal D runs `cat`, terminals A/B/C exist
  * action: simultaneously: `nap poke D "from-A"`, `nap poke D "from-B"`, `nap poke D "from-C"`
  * expected: all three messages delivered to D, in enqueue order, with 500ms gaps, no interleaving
  * likely to break: message queue is per-terminal but concurrent enqueues could corrupt it
    * Node is single-threaded so actual corruption is unlikely, but enqueue ORDER depends on which socket message arrives first
    * verify: messages arrive in D in the order they were enqueued (which may differ from send order)
    * critical: no partial message delivery (half of "from-A" followed by half of "from-B")

* T-0500-08: integration test script is idempotent
  * flow: run integration script → clean up → run again → same result
  * subsystems: test harness, cleanup logic
  * action: run integration.sh twice in a row
  * expected: second run passes — no stale state from first run
  * likely to break: terminals from first run still exist
    * script must clean up (nap close all test terminals) or use unique names
    * stale socket from crashed test run — app restart needed
    * also: auto-increment naming ("agent-1") — second run gets "agent-11", "agent-12" unless counter resets

* T-0500-09: addon-search works across terminals (if implemented)
  * flow: user hits Cmd+F → search bar appears → types query → matches highlighted in active terminal
  * subsystems: addon-search, terminal switching
  * setup: terminal A has output containing "ERROR" in scrollback
  * action: Cmd+F, type "ERROR", Enter for next match, Escape to close
  * expected: matches highlighted, scrolls to first match, Escape clears and closes
  * likely to break: search addon searches wrong terminal's buffer after a switch
    * if search addon is attached to one terminal and user switches, search must rebind
    * or: search always operates on the active terminal's buffer
    * low priority per spec — skip if time is tight
