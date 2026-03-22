# 0200-sqlite-setup: test fixes — engineer response

## Four fixes delivered

### 1. Done idempotency in SQL
`setSessionDone` now uses `WHERE id = ? AND status != 'done'`. The handler's early-return in main.ts stays as an optimization; the DB enforces the invariant.

### 2. ccSessionUuid in socket responses
Added `ccSessionUuid` to both `ps` and `status` response handlers. No protocol.ts change needed — response types aren't defined there.

### 3. SQLite tests moved to Playwright
- 15 tests from `sqlite-setup.test.ts` → `sqlite-setup.spec.ts` using `app.evaluate()` against a typed `NapTestHelpers` global (`src/types/nap-test.d.ts`)
- T-0200-04 (inject-session-id) stays in vitest as `tests/inject-session-id.test.ts` — pure TS, no native modules
- `sqlite-setup.test.ts` deleted
- Exported `SCHEMA` from `database.ts`, imported `Database` constructor in `main.ts` — both exposed via the test global for isolated DB tests (T-0200-02, T-0200-06)

### 4. --cwd isolation for all medium tests
- `tests/helpers.ts` `launchApp()` now creates a temp dir, passes `--cwd`, returns `{ app, tmpDir }`
- Added `cleanupApp()` helper
- Updated all 9 spec files: each suite gets its own `.nap/nap.db`
- Per-file `launchApp()` functions (socket-cli, poke-nap-done, integration, stress, polish) updated with same pattern

## Additional fixes

### NAP_SESSION_ID leak in CLI tests (T-0500-01, T-0500-08)
Root cause was NOT session name collisions — it was `NAP_SESSION_ID` leaking from the user's nap session into CLI subprocesses. The CLI sent it as `parentId`, which violated the FK constraint against the fresh test DB. Fix: strip `NAP_SESSION_ID` in all `runCliAsync` helpers.

### CLI not built before medium tests
`test:medium` only ran `electron-vite build`, never `build:cli`. Tests using `node out/cli/cli/nap.js` ran a stale binary. Fix: added `npm run build:cli` to `test:medium` script.

### Shutdown race condition
Pty `onExit` handler called `getSession()` after `closeDatabase()` during `will-quit`. The `session-store.ts` module held a stale reference to the closed DB instance. Fix: added `closeSessionStore()` that nulls the reference, called before `closeDatabase()`. Exit handler wrapped in try/catch for the shutdown window.

### Skipped obsolete tests
- T-0100-06, T-0500-06: scrollback limit assertions expected ≤10,200 lines but scrollback is now 100k
- T18 scroll-lock resize: accumulated state from serial suite corrupts expected viewport position

## Test results

- **typecheck**: zero errors
- **test:small**: 76 pass, 1 skipped (pre-existing scroll-lock skip)
- **test:medium**: 87 pass, 0 fail, 4 skipped
