You're a test engineer on the NAP project. Read your role in `.napkins/00-org/roles/test-eng.md` — that's how you operate.

The fullstack engineer just built the unix socket server and CLI (feature 0300). Your job: write and run the tests for it.

Read the test cases in `.napkins/30-doing/0300-socket-cli/0300-socket-cli.test.md` — each one tells you what to test, the test size, and how to verify it. Read the spec in the same directory for context on expected behavior. Read the source code in `src/` to understand what you're testing.

The project already has Vitest and Playwright set up. Existing tests are in `tests/`. Extend what's there — don't duplicate infrastructure.

All TypeScript, `tsc --noEmit` clean. Run your tests and report results.

Write what happened to `.napkins/30-doing/0300-socket-cli/agents/002-test-eng-socket-cli/response.md`. If something is untestable, say why.
