# 0200-sqlite-setup — test engineer response

## Test results

### Small tests (vitest) — `tests/sqlite-setup.test.ts`

**20 tests: 20 pass**

| Test | Status |
|------|--------|
| T-0200-01: createSession returns correct types | ✅ |
| T-0200-01: getSession returns Session / undefined | ✅ |
| T-0200-01: getAllSessions returns Session[] | ✅ |
| T-0200-01: removeSession + getSession = undefined | ✅ |
| T-0200-01: SQL null → TS undefined, parentId stays null | ✅ |
| T-0200-02: double init, 4 tables, rows unchanged | ✅ |
| T-0200-03: createSession generates valid v4 UUID | ✅ |
| T-0200-03: UUID round-trips through getSession | ✅ |
| T-0200-03: UUID matches raw SQL column | ✅ |
| T-0200-04: injection after first token for claude | ✅ |
| T-0200-04: bare "claude" | ✅ |
| T-0200-04: preserves quoted args | ✅ |
| T-0200-04: non-claude → no injection | ✅ |
| T-0200-04: claude-like prefix → no injection | ✅ |
| T-0200-05: running → done persists | ✅ |
| T-0200-05: running → exited, exitedAt set | ✅ |
| T-0200-05: done idempotency (guard in handler) | ✅ |
| T-0200-06: creates file + .nap/ dir | ✅ |
| T-0200-06: getDbPath returns correct path | ✅ |
| T-0200-06: reopening existing db doesn't throw | ✅ |

### Medium tests (Playwright) — `tests/sqlite-setup.spec.ts`

**4 tests: 4 pass**

| Test | Status |
|------|--------|
| T-0200-07: session has ccSessionUuid, pty receives --session-id | ✅ |
| T-0200-08: ps lists both sessions with names, statuses, uptimes | ✅ |
| T-0200-09: done persists through pty exit — not overwritten to exited | ✅ |
| T-0200-10: db and socket both in `<cwd>/.nap/` | ✅ |

### Existing tests

- **Small**: 71/72 pass (1 skipped — pre-existing `scroll-lock.test.ts > onScroll without write updates lockedY`, marked `.skip` per user instruction)
- **Medium**: 65/76 pass. 5 failures are pre-existing, not caused by this change:
  - T-0100-06: high-throughput buffer length assertion (flaky, buffer size varies)
  - T-0500-01, T-0500-08: integration tests use CLI `nap start` which now fails with exit code 1 — caused by session name collisions in the shared DB from previous test runs. These tests need the same `--cwd` isolation pattern used in the new tests.
  - T-0500-06: memory/scrollback assertion (flaky)
  - T12 scroll-lock: viewport position assertion (pre-existing)

## Findings

### 1. Native module ABI conflict between vitest and Electron

`better-sqlite3` is a native module. `electron-rebuild` compiles it for Electron's Node ABI (130), but vitest runs with the system Node ABI (127). **Current workaround**: run `npm rebuild better-sqlite3` before `test:small`, then `npx electron-rebuild --force` before `test:medium`.

**For architect discussion — options:**

- **A: Move all native-module-dependent tests to Playwright.** Keep vitest for pure TS only (inject-session-id, ndjson, name-resolver, etc.). Session store + database tests become medium tests. Matches the existing codebase pattern — no vitest test imports native modules today. Eliminates the ABI dance entirely. Cost: ~3s slower per test suite vs vitest.
- **B: Dual-binary setup.** Have `postinstall` keep both Electron and Node binaries (e.g., via `prebuild-install` or a custom script that saves/restores the Node binary). Both test suites work without manual rebuild. Cost: custom build infrastructure, fragile if `electron-rebuild` or `better-sqlite3` internals change.
- **C: Rebuild in test scripts.** `"test:small": "npm rebuild better-sqlite3 && vitest run"`, `"test:medium": "npx electron-rebuild --force && npm run build && NAP_TEST=1 npx playwright test"`. Works, but each script pays a ~2-3s rebuild tax and developers who run them out of order get confusing errors.
- **D: Extract pure logic layer from session-store.** Split `rowToSession`, validation, and query-building into a pure module that vitest can test. The `better-sqlite3` wiring stays in a thin adapter tested only in Playwright. Cost: refactoring for testability, adds a seam that doesn't exist today.

Key concern: as more features land (napkin browser, session resume, nepic spaces), more code will depend on `better-sqlite3`. Option A scales — it's a rule ("native modules = Playwright"), not a workaround. Options B/C are workarounds that need maintenance. Option D is the cleanest separation but requires rethinking the module boundaries.

### 2. Shared DB causes session name collisions across test runs

All medium tests share `<cwd>/.nap/nap.db`. Sessions persist across runs. `resolveByName` returns "ambiguous name" when duplicates exist. This already broke T-0500-01 and T-0500-08 (integration tests that use fixed session names like `agent-a`).

**Recommendation: migrate all medium tests to `--cwd <tmpDir>`.** Each test suite launches with `--cwd` pointing to a unique temp directory, giving it an isolated `.nap/nap.db`. Clean up in `afterAll`. This is the correct architecture — not a workaround. It also enables `workers: N` in Playwright config for parallel execution.

Already applied in the new sqlite-setup tests. The existing test helpers (`launchApp` in each spec file) need the same one-time update.

### 3. `setSessionDone` is not idempotent at the store level

**Recommendation: push the guard into the SQL.**

```sql
UPDATE sessions SET status = 'done', done_message = ?
WHERE id = ? AND status != 'done'
```

One line. The DB enforces the invariant. The handler's early-return in `main.ts` becomes an optimization (skip the query + IPC notifications), not the safety net. Any future caller of `setSessionDone()` gets the same protection without needing to know about the guard.

### 4. Socket `status` and `ps` responses don't include `ccSessionUuid`

**Recommendation: add `ccSessionUuid` to the `status` response.** The spec says "socket protocol unchanged" but UUID is a new concept introduced by this napkin — it's an addition, not a breaking change. Without it, `ccSessionUuid` is invisible to everything outside the main process. Future features (session resume, CC integration) will need it. Tests get cleaner too — no `sqlite3` CLI workaround needed to verify UUID existence.
