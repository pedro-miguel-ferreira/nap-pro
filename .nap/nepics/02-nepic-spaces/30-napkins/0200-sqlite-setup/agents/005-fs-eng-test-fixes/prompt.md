You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: four fixes from the test engineer's findings on 0200-sqlite-setup.

Read the test engineer's response for full context:
- `.nap/nepics/02-nepic-spaces/30-napkins/0200-sqlite-setup/agents/003-test-eng-sqlite/response.md`

The four fixes:

### 1. Done idempotency in SQL
In `src/main/session-store.ts`, push the done guard into the SQL query:
```sql
UPDATE sessions SET status = 'done', done_message = ? WHERE id = ? AND status != 'done'
```
The handler in `main.ts` can keep its early-return as an optimization, but the DB enforces the invariant.

### 2. Add `ccSessionUuid` to socket responses
In the socket `status` and `ps` response handlers, include `ccSessionUuid` in the returned session data. This is an addition, not a breaking change. Update `src/shared/protocol.ts` if needed to add the field to the response type.

### 3. Move SQLite tests from vitest to Playwright
`tests/sqlite-setup.test.ts` imports better-sqlite3 which is compiled for Electron's ABI. Move the 20 tests from `tests/sqlite-setup.test.ts` into `tests/sqlite-setup.spec.ts` (the Playwright file). Adapt them to use `app.evaluate()` to call session-store functions inside the real Electron process. Delete `tests/sqlite-setup.test.ts` when done. The inject-session-id tests (T-0200-04) are pure TS — those can stay in a vitest file (e.g., `tests/inject-session-id.test.ts`).

### 4. DB isolation for all medium tests
Update all Playwright test files to use unique temp directories via `--cwd <tmpDir>`. Each test suite should:
- Create a temp dir in `beforeAll`
- Pass it as `--cwd` to `launchApp()`
- Clean up in `afterAll`
This gives each suite its own `.nap/nap.db`, preventing session name collisions. Check `tests/helpers.ts` and all `.spec.ts` files.

After all four fixes:
- Run `npm run typecheck` — zero errors
- Run `npm run test:small` — all pass
- Run `npm run test:medium` — all pass (including previously failing T-0500-01, T-0500-08)

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0200-sqlite-setup/agents/005-fs-eng-test-fixes/response.md`, then run `nap done` in your terminal. The architect is blocked waiting — without this, the pipeline stalls.
