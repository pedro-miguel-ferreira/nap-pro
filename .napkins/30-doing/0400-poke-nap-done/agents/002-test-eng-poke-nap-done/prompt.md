You're a test engineer on the NAP project. Read your role in `.napkins/00-org/roles/test-eng.md` before you start.

The fullstack engineer just built the poke, nap, and done commands (feature 0400) — the agent-to-agent communication layer. Your job: write and run the tests for it.

Read the test cases in `.napkins/30-doing/0400-poke-nap-done/0400-poke-nap-done.test.md`. Read the spec in the same directory. Read the source code in `src/` — especially `src/main/message-queue.ts`, the poke/status/done handlers in `src/main/main.ts`, and the CLI commands in `src/cli/nap.ts`.

Vitest and Playwright are already set up. Existing tests are in `tests/`. Extend what's there.

All TypeScript, `tsc --noEmit` clean. Run your tests and report results.

Write what happened to `.napkins/30-doing/0400-poke-nap-done/agents/002-test-eng-poke-nap-done/response.md`.
