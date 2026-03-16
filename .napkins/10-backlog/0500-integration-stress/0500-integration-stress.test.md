* integration + stress test — test cases (v2)

* T-0500-01: full CLI command sequence runs unattended
  * size: big (full Electron + CLI + socket)
  * flow: integration script runs every CLI command in sequence, asserts results
  * subsystems: all — socket, pty, sidebar, poke, nap, done
  * verification: automatable
    * run as shell script from first terminal (or as Playwright test driving CLI via `app.evaluate`)
    * sequence with assertions:
      * `nap start "echo hello world" --name agent-a` → parse JSON stdout, assert `name === "agent-a"`
      * `nap start "sleep 5 && nap done 'finished sleeping'" --name agent-b` → assert `name === "agent-b"`
      * `nap ps` → parse output, assert 3 sessions: shell, agent-a, agent-b
      * `nap poke agent-a "wake up"` → assert exit code 0
      * `nap peek agent-a` → assert exit code 0
      * `nap nap agent-b --timeout 15` → assert output contains "finished sleeping", exit code 0
      * `nap kill agent-a` → assert exit code 0
      * `nap ps` → assert agent-a status is "exited"
      * `nap close agent-a` → assert exit code 0
      * `nap ps` → assert 2 sessions remain (shell + agent-b)
    * script exits 0 on all pass, exits 1 with failure detail on any assertion failure
  * likely to break: ordering dependencies — nap ps right after nap start might not see the terminal if pty spawn is slow — need poll/retry with short timeout

* T-0500-02: parent-child chain three levels deep
  * size: big (full CLI chain)
  * flow: shell → starts child → child starts grandchild → grandchild does nap done → child receives, does nap done → shell receives
  * subsystems: NAP_SESSION_ID propagation, poke delivery chain, nap nap polling
  * verification: automatable
    * from shell:
      * `nap start "nap start 'sleep 2 && nap done child-result' --name grandchild && nap nap grandchild && nap done got-grandchild" --name child`
      * `RESULT=$(nap nap child --timeout 15)`
    * assert RESULT contains "got-grandchild"
    * verify parent chain via nap ps: shell → child → grandchild
    * verify all three have correct parentId in store:
      * `page.evaluate(() => useTerminalStore.getState().terminals.map(t => ({ name: t.name, parentId: t.parentId })))`
    * verify all three status dots: grandchild=done, child=done, shell=running
  * likely to break: NAP_SESSION_ID doesn't propagate through `shell -c` invocation — grandchild's parentId points to shell instead of child

* T-0500-03: 10 concurrent terminals with high-output commands
  * size: big (Playwright + Electron, resource-intensive)
  * flow: spawn 10 terminals → each runs output-heavy command → all running simultaneously
  * subsystems: pty management, xterm.js buffers, IPC bridge, memory
  * verification: automatable
    * spawn 10 terminals via CLI: `for i in {1..10}; do nap start "seq 1 10000" --name stress-$i; done`
    * wait for all to complete (poll status until all exited)
    * verify all 10 exist in store: `page.evaluate(() => useTerminalStore.getState().terminals.length) === 11` (10 + initial shell)
    * verify each has output: `page.evaluate(() => getTerminal('stress-1-id').terminal.buffer.active.length > 100)` for each
    * measure: `page.evaluate(() => performance.memory?.usedJSHeapSize)` (Chrome-only API)
    * assert app didn't crash: window still exists, store is responsive
  * likely to break: 10 ptys dumping data simultaneously overwhelm the IPC bridge — main process single-threaded, all 10 pty.onData handlers fire concurrently

* T-0500-04: rapid terminal switching under load — no content corruption
  * size: big (Playwright + Electron)
  * flow: 10 terminals with different content → switch through all rapidly → verify correct content on each
  * subsystems: DOM reparenting, WebGL, fitAddon, zustand store
  * verification: automatable
    * create 10 terminals, write unique markers: `echo MARKER_N` where N=1..10
    * rapid switch loop via `page.evaluate()`:
      * cycle through all 10 terminal ids with `setActive()` calls, 50ms between each
      * do 3 full cycles (30 switches)
    * after settling, for each terminal:
      * `setActive(termId)`, wait 100ms
      * read xterm buffer — assert MARKER_N present and no other MARKER_M
    * assert no console errors during switches
  * likely to break: race condition in Terminal.tsx useEffect — DOM manipulation from switch N overlaps with switch N+1 under load

* T-0500-05: 10 WebGL contexts simultaneously — no context lost
  * size: medium (Playwright + Electron)
  * flow: each terminal has WebGL addon → 10 contexts active on GPU
  * subsystems: addon-webgl, GPU context management
  * verification: automatable
    * create 10 terminals, each opened (rendered at least once so WebGL initializes — terminal-registry.ts:44-66)
    * install webglcontextlost listeners on all 10:
      * `page.evaluate(() => { window._contextLostCount = 0; for (const [id, entry] of registry) { entry.terminal.element?.querySelector('canvas')?.addEventListener('webglcontextlost', () => window._contextLostCount++); } })`
    * switch through all 10 terminals (forces reattach)
    * wait 5s
    * assert: `page.evaluate(() => window._contextLostCount) === 0`
    * verify each terminal renders: switch to it, write a character, read it back from buffer
  * likely to break: GPU limit exceeded — most hardware supports ~16 contexts, 10 should be fine, but integrated GPUs may be lower

* T-0500-06: memory stays bounded with scrollback pressure
  * size: medium (Playwright + Electron)
  * flow: 10 terminals each fill scrollback → measure total memory
  * subsystems: xterm.js buffer management, V8 heap
  * verification: automatable
    * measure baseline: `page.evaluate(() => performance.memory?.usedJSHeapSize)` (renderer process)
    * spawn 10 terminals, each runs `seq 1 20000` (fills 10k scrollback, evicts older lines)
    * wait for all to complete
    * measure after: same API
    * compute delta — assert < 500MB (spec ballpark)
    * verify scrollback eviction: for each terminal, check `terminal.buffer.active.length <= 10000 + some_overhead`
    * also check main process memory via `app.evaluate(() => process.memoryUsage().heapUsed)`
  * likely to break: scrollback eviction not working — buffer grows unbounded, or WebGL textures leak on repeated renders

* T-0500-07: poke delivery under contention — multiple agents poking one target
  * size: big (full CLI + socket + pty)
  * flow: agents A, B, C all poke agent D simultaneously → D's queue receives all three → delivery in order
  * subsystems: message queue, delivery loop, pty stdin
  * verification: automatable
    * create terminal D running `cat`
    * simultaneously send: `nap poke D "from-A"`, `nap poke D "from-B"`, `nap poke D "from-C"`
    * wait 3s for delivery (3 messages × 500ms gap + overhead)
    * read D's xterm buffer — all three messages present
    * assert no partial message delivery: "from-A" is a complete line, not interleaved with "from-B"
    * order depends on enqueue order (which socket message arrives first) — verify messages are whole, ordered won't be deterministic across runs
  * likely to break: concurrent pty.write calls interleave bytes — Node is single-threaded so this shouldn't happen, but if delivery loop doesn't serialize properly, partial writes could occur

* T-0500-08: integration test script is idempotent
  * size: big (full test harness)
  * flow: run integration script → clean up → run again → same result
  * subsystems: test harness, cleanup logic
  * verification: automatable
    * run integration script (T-0500-01) twice in a row
    * assert second run passes — no stale terminals from first run
    * verify cleanup: script must `nap close` all test terminals before exiting, or use unique name prefixes per run
    * also: if app is restarted between runs, auto-increment counter resets — terminal names must not collide
  * likely to break: terminals from first run still exist with same names — second run's `nap start --name agent-a` conflicts

* T-0500-09: addon-search works across terminals
  * size: manual
  * verification: manual
    * reason: search overlay is a UI feature — Cmd+F opens a search bar, matches are visually highlighted, scrolls to match. Verifying visual highlighting and scroll-to-match programmatically is fragile and low-value for POC.
    * also: this feature is marked "nice-to-have — skip if time is tight" in spec
    * manual test: open terminal with output containing "ERROR", hit Cmd+F, type "ERROR", verify highlight and scroll, press Escape to dismiss
    * if ever automated: `page.evaluate(() => searchAddon.findNext('ERROR'))` returns boolean, but doesn't verify visual highlighting

* confidence assessment
  * small tests (T-0300-02, T-0300-07, T-0300-08): pure logic — cheap, fast, high confidence for protocol and CLI edge cases
  * medium tests (most of the above): Playwright + Electron integration — these cover the seams where bugs actually live (IPC bridge, socket protocol, buffer management, pty lifecycle)
  * big tests (T-0500-01 through T-0500-04, T-0500-07, T-0500-08): full end-to-end — expensive but necessary for the integration/stress proof point
  * manual (T-0500-09): low priority, UI-only
  * ~80% confidence comes from small + medium tests across 0100-0400 — the big tests in 0500 fill the remaining gaps and prove the system works as a whole
