You're a test engineer on the NAP project. Read your role in `.napkins/00-org/roles/test-eng.md` before you start.

The fullstack engineer just built the 0600 polish feature — per-project socket, CLI help, `nap open`, `nap log`, colored `nap ps`, clickable file paths, and Cmd+K sidebar filter. Your job: write and run the tests.

Read the test cases in `.napkins/30-doing/0600-polish/0600-polish.test.md` — 22 test cases covering all six sub-features. Read the source in `src/` to understand the implementation. Pay special attention to `src/shared/constants.ts` (socket discovery), `src/cli/nap.ts` (rewritten CLI), and `src/renderer/file-link-provider.ts` (new module).

Vitest and Playwright are set up. Existing tests in `tests/`. Extend what's there.

All TypeScript, `tsc --noEmit` clean. Run your tests and report results.

Write what happened to `.napkins/30-doing/0600-polish/agents/003-test-eng-polish/response.md`.
