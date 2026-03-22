You're a test engineer on the NAP project. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Your task: implement and run the test cases designed in the test architecture for 0200-sqlite-setup.

Read these:
1. `.nap/nepics/02-nepic-spaces/30-napkins/0200-sqlite-setup/0200-sqlite-setup.test.md` — the 10 test cases you must implement
2. `.nap/nepics/02-nepic-spaces/30-napkins/0200-sqlite-setup/0200-sqlite-setup.spec.md` — the spec
3. `.nap/nepics/02-nepic-spaces/30-napkins/0200-sqlite-setup/agents/002-fs-eng-sqlite/response.md` — what the engineer built

Read the code you're testing:
- `src/main/database.ts` — database init, schema
- `src/main/session-store.ts` — SQLite-backed session store
- `src/main/inject-session-id.ts` — command string injection
- `src/main/main.ts` — startup flow, pty spawning

Read existing test patterns:
- `tests/helpers.ts` — Playwright helpers (launchApp, etc.)
- `tests/setup.ts` — vitest mock setup
- Any existing `.test.ts` and `.spec.ts` files for patterns

Implement:
- Small tests (T-0200-01 through T-0200-06) as vitest tests in `tests/sqlite-setup.test.ts`
  - Use `:memory:` SQLite for speed where possible
  - Use tmp dirs for file-based tests (T-0200-06)
- Medium tests (T-0200-07 through T-0200-10) as Playwright tests in `tests/sqlite-setup.spec.ts`
  - Use existing `launchApp()` helper pattern
  - Real Electron app, real socket, real pty

Run them:
- `npm run test:small` — all tests pass (including existing ones)
- `npm run test:medium` — all tests pass (including existing ones)

Report: which tests pass, which fail, with specifics on failures.

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0200-sqlite-setup/agents/003-test-eng-sqlite/response.md`, then run `nap done` in your terminal. The architect is blocked waiting — without this, the pipeline stalls.
