You're a test engineer on the NAP project. Read your role in `.napkins/00-org/roles/test-eng.md` before you start.

Your task: write and run tests for the 1000 scroll lock feature. Read the test cases in `.napkins/30-doing/1000-scroll-lock/1000-scroll-lock.test.md`. Read the source in `src/renderer/scroll-lock.ts` and the related changes in `Terminal.tsx`, `store.ts`, `index.tsx`.

Vitest and Playwright are already set up. Existing tests in `tests/`. Extend what's there.

All TypeScript, `tsc --noEmit` clean. Run your tests and report results.

Write what happened to `.napkins/30-doing/1000-scroll-lock/agents/003-test-eng-scroll-lock/response.md`.

When you're done, you MUST run this command in your terminal to signal completion:

```
nap done
```

This is critical — the architect is waiting on you with `nap nap`. If you don't run `nap done`, they'll be blocked.
