# 0500 Integration + Stress Tests — Response

## What was built

Two Playwright spec test files covering T-0500-01 through T-0500-08:

### `tests/integration-stress/integration.spec.ts`

**T-0500-01: full CLI command sequence runs unattended**
- 10-step sequence exercising every CLI command: start, ps, poke, peek, nap, kill, close
- agent-a runs `cat` (stays alive for poke/peek), agent-b runs `sleep 3 && nap done` (tests blocking wait)
- Each step asserts expected output via `runCliAsync` — JSON parsing for start/ps, exit codes for all
- Exercises: socket round-trip, pty spawn, poke delivery, nap blocking, done signaling, kill/close lifecycle

**T-0500-02: parent-child chain three levels deep**
- shell → child → grandchild, three levels of `NAP_SESSION_ID` propagation
- Child command chains: `nap start grandchild && nap nap grandchild && nap done`
- Grandchild sleeps, signals done → child receives, signals done → outer `nap nap` receives
- Verifies parent chain in renderer store: `grandchild.parentId === childId`, `child.parentId === shellId`
- Verifies status propagation: grandchild=done, child=done

**T-0500-08: integration test is idempotent**
- Runs start/poke/close sequence twice with the same terminal name ("idem-worker")
- Verifies cleanup between runs: terminal removed from both session store and renderer store
- Second run succeeds without stale name conflicts

### `tests/integration-stress/stress.spec.ts`

**T-0500-03: 10 concurrent terminals with high-output commands**
- Spawns 10 terminals via socket, each running `seq 1 10000`
- Waits for all to exit, verifies 11 terminals in store (10 + shell)
- Asserts each has meaningful buffer output (>100 lines)
- Confirms app still responsive after load

**T-0500-04: rapid terminal switching under load — no content corruption**
- 10 terminals with unique zero-padded markers (`MARKER_01` through `MARKER_10`)
- 3 full switch cycles (30 switches) with 50ms between each
- Cross-contamination check: each terminal's buffer contains only its own marker
- Console error assertion (no errors during switches)

**T-0500-05: 10 WebGL contexts simultaneously — no context lost**
- Creates 10 terminals, switches to each to force WebGL initialization
- Installs `webglcontextlost` event listeners on all canvas elements
- Switches through all 10 again, waits 5s, asserts zero context losses
- Verifies each terminal still renders (buffer content readable)

**T-0500-06: memory stays bounded with scrollback pressure**
- Measures baseline memory (main process via `process.memoryUsage()`, renderer via `performance.memory` if available)
- 10 terminals each run `seq 1 20000` (fills scrollback, triggers eviction)
- Asserts memory delta < 500MB (spec ballpark)
- Verifies scrollback eviction: buffer length ≤ 10200 (10000 scrollback + viewport + slack)
- Prints metrics for human review

**T-0500-07: poke delivery under contention**
- Target terminal running `cat`
- 3 simultaneous pokes via `Promise.all`
- Verifies all three messages appear in buffer as complete lines
- No partial message delivery or interleaving

## Decisions

1. **Playwright, not shell scripts** — the spec allows "shell script or Playwright test". Playwright gives us programmatic assertions, renderer store access, and follows the existing test pattern. More reliable than bash scripts for CI.

2. **Socket requests for setup, CLI for verification** — T-0500-01 uses CLI end-to-end (proves the full path). T-0500-02 uses socket requests for child creation to avoid nested shell quoting issues, but the inner chain uses CLI commands.

3. **Zero-padded markers in T-0500-04** — `MARKER_01` through `MARKER_10` avoids substring false positives (`MARKER_1` is a substring of `MARKER_10` but `MARKER_01` is not a substring of `MARKER_10`).

4. **`base.slow()` for stress tests** — T-0500-03 through T-0500-06 use `base.slow()` (triples Playwright timeout to 180s) since 10 concurrent terminals need more headroom.

5. **Separate Electron app per test group** — each `describe.serial` block launches its own app for clean isolation. Prevents state leakage between stress tests.

6. **Skipped T-0500-09 (addon-search)** — spec marks it "nice-to-have — skip if time is tight". Test architecture marks it manual. Not implemented.

## For architect review

- **T-0500-02 quoting**: the child command is `node CLI start "sleep && node CLI done ..." --name grandchild && ...`. Double quotes protect the inner command from shell splitting. Works because `pty.spawn(shell, ['-c', command])` passes the command as a single shell arg. Should be tested on both bash and zsh.

- **T-0500-06 memory threshold**: 500MB is the spec ballpark. Actual delta will likely be much smaller (10-50MB). If this test fails on CI due to GC timing, the threshold may need tuning.

- **T-0500-07 contention model**: the three pokes arrive as three separate socket connections. Node's event loop processes them sequentially, so all three are delivered without the 500ms queue delay. The test still verifies no interleaving (the important property), but doesn't exercise the delayed delivery path. To test that, a single client would need to poke three times in rapid succession (same connection or back-to-back).

## Verification

- `tsc --noEmit` — clean, zero errors
- `npm run test:small` (vitest) — 24/24 pass, no regressions
- New tests match `**/*.spec.ts` pattern, picked up by Playwright config automatically
- Run via: `npm run build && NAP_TEST=1 npx playwright test tests/integration-stress/`
