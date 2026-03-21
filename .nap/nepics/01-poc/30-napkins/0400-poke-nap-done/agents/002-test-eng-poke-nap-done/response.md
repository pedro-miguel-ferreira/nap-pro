* 0400 test results

* summary: 14 tests written, 14 passing. 1 bug found and fixed.

* test files
  * `tests/poke-nap-done/poke-nap-done.spec.ts` — 12 medium/big Playwright + Electron tests
  * `tests/poke-nap-done/done-no-session.test.ts` — 2 small Vitest tests

* results by test case

  * T-0400-01: poke delivers message to pty stdin — PASS (2 tests)
    * basic message delivery via cat echo
    * special characters (quotes, backslashes) arrive without shell interpretation

  * T-0400-02: poke queue preserves FIFO order — PASS
    * four messages rapid-fire, verified line indices strictly increasing
    * timing note: the 500ms inter-message delivery delay cannot be triggered via socket protocol — each poke request completes synchronously (enqueue + immediate delivery) before the next arrives. The delay mechanism exists for concurrent internal enqueue calls but isn't exercisable from outside. Precise gap measurement (±100ms tolerance) would require instrumenting the bundled message-queue module via `app.evaluate()`, which isn't feasible with electron-vite's bundled output.

  * T-0400-03: poke to dead terminal returns error — PASS (2 tests)
    * exited terminal: `{ error: "not_running" }`
    * done terminal: same rejection — `status !== 'running'` gate works for both

  * T-0400-04: nap nap blocks and unblocks on done — PASS
    * worker sleeps 2s then calls `nap done "result-42"`
    * `nap nap worker-04 --timeout 10` blocks ~3s, exits 0, stdout contains `result-42`
    * worker status is 'done' after fix (see bug below)

  * T-0400-05: nap nap on already-done terminal returns immediately — PASS
    * terminal marked done before nap nap starts
    * nap nap detects done on first poll, returns in <3s with `early-bird`

  * T-0400-06: nap nap timeout exits without killing target — PASS
    * `nap nap stuck-06 --timeout 3` exits 1 after ~3s
    * stderr: `timeout waiting for stuck-06`
    * target still running after timeout — not killed

  * T-0400-07: nap done sets status, pokes parent, stores message — PASS (2 tests)
    * child done → status=done, doneMessage stored, parent buffer contains message
    * also: done succeeds when parent has already exited (status change is independent of poke delivery)

  * T-0400-08: nap done with no NAP_SESSION_ID errors cleanly — PASS (2 tests)
    * exits 1 with `not running inside nap`
    * no socket connection attempted (verified: no `nap is not running` in stderr)

  * T-0400-09: nap done called twice is a no-op — PASS
    * second done returns ok but does not overwrite doneMessage
    * parent not poked a second time (verified after 1s wait)

  * T-0400-10: full spawn-wait-receive loop — PASS
    * parent shell runs: start worker → nap nap worker → worker does done → parent captures result
    * `GOT: result-42` appears in parent's xterm buffer
    * worker status is 'done'

* bug found and fixed: pty exit overwrites 'done' status

  * what: when a terminal calls `nap done`, status is set to 'done'. Then the pty process exits (shell finishes the -c command), and two handlers unconditionally set status to 'exited' — overwriting 'done'.
  * where: `src/main/main.ts:99` (pty onExit handler) and `src/renderer/index.tsx:26` (pty:exit IPC handler)
  * impact: `nap nap` still works (it checks for 'done' OR 'exited'), but the 'done' semantic is lost. Callers can't distinguish "worker finished with result" from "worker crashed."
  * fix applied: both handlers now check `status !== 'done'` before setting 'exited'. Two lines changed.
  * tests T-0400-04 and T-0400-10 assert `status === 'done'` and caught this.

* full test run after fix: 24/24 small, 34/34 medium (1 skipped: T-0100-08 manual)
