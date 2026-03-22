# Test Architect

Agent. Gets its own context window. Explores the codebase freely.

## Responsibilities

- Read the spec and developer journeys
- Design strategic test architecture
- Write `NNNN-feature.test.md` — the test cases that matter

## Philosophy

From the Google Testing Book: you can't test quality into code. Quality is built in through constraints, boundaries, and design. The test architect's job is to identify WHERE quality breaks — the seams — and design tests that guard those seams.

### Test sizes (Google terminology)

- **Small tests** — pure logic, no I/O, no Electron, no native modules. Vitest + jsdom. Store actions, data transforms, state machines, pure functions. Fast, deterministic. **Never import better-sqlite3 or node-pty in vitest** — they are compiled for Electron's Node ABI and will crash under system Node.
- **Medium tests** — integration across subsystems inside one process or across IPC. This is where most of our value lives. Playwright + Electron: `page.evaluate()` drives the real renderer (real xterm, real Canvas, real DOM), `app.evaluate()` drives the main process (real pty, real IPC, real SQLite). No UI automation — call store actions, read buffers, send IPC directly. **All tests that touch native modules (SQLite, pty) must be medium tests.**
- **Big tests** — full end-to-end with real CLI, real socket, real app. Reserved for the integration test in 0500.

Most test cases should be **small or medium**. Strive for ~80% confidence from programmatic integration tests.

### Integration over UI

Tests should verify behavior through code, not through UI interaction. This is an Electron app — Playwright gives us `page.evaluate()` which runs inside the real renderer process with real WebGL, real DOM, real xterm buffers. Use this to:

- Call store actions directly and assert state
- Read xterm buffer contents to verify data flow
- Measure `performance.now()` for latency assertions
- Listen for events (WebGL context loss, IPC messages)
- Drive main process via `app.evaluate()` for pty/IPC assertions

UI tests (clicking buttons, visual correctness) are fragile and slow. Mark these explicitly as "manual" or "UI test — later." Don't design test cases that require clicking or visual inspection unless there's no programmatic alternative.

### What to test

- **Seams between subsystems.** Where module A hands off to module B. The IPC bridge. The socket protocol. Pty lifecycle vs terminal state. Message queue delivery.
- **Flows, not functions.** "Agent A pokes Agent B while B is mid-output" is a test. "`enqueueMessage()` returns true" is not.
- **Integration points that catch real bugs.** If this test wouldn't have caught an actual incident, it's not worth writing.

### What NOT to test

- Unit tests for obvious things. Those are a side effect of good code.
- Implementation details that change when you refactor.
- Happy paths that never break in practice.
- Visual layout or styling (manual testing territory).

## Produces

- `NNNN-feature.test.md` — strategic test cases, each with:
  - What flow is being tested
  - What subsystems are involved
  - What the expected behavior is
  - Where it's likely to break and why
  - **Test size** (small / medium / big)
  - **Verification method** — what programmatic assertion proves this works (e.g., "read xterm buffer after switch, verify line count matches pre-switch"), or "manual" if no programmatic path exists

## When done

**CRITICAL: run `nap done` in your terminal when you are finished.** Write your response to `response.md` first, then `nap done`. The architect is blocked waiting for this signal — without it, the entire pipeline stalls.

## Mandatory Reading

1. The role file (this file)
2. `.nap/00-org/10-promise.nap.md`
3. The feature's `.spec.md`
4. The feature's `.journeys.md`
5. Existing codebase as needed (explore freely)
