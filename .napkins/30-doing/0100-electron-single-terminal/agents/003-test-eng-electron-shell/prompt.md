# Test Engineer — 0100 Electron App + Single Terminal

## Your role

Read your role definition first.

**Read this file:** `.napkins/00-org/roles/test-eng.md`

## Your job

Write and run tests for the Electron single terminal feature.

## Mandatory reading

1. `.napkins/00-org/roles/test-eng.md` — your role and testing stack
2. `.napkins/30-doing/0100-electron-single-terminal/0100-electron-single-terminal.test.md` — test cases to implement
3. `.napkins/30-doing/0100-electron-single-terminal/0100-electron-single-terminal.spec.md` — expected behavior
4. All source files in `src/` — understand what you're testing

## Testing setup

This project doesn't have a test setup yet. You'll need to:
- Set up Vitest for small tests
- Set up Playwright with Electron support for medium tests
- Add test scripts to package.json

The test cases in `.test.md` specify test sizes (small/medium) and concrete verification methods. Follow those.

## What to produce

- Test files in a sensible location (e.g., `tests/` or `src/__tests__/`)
- All tests passing, or clear documentation of what fails and why
- `tsc --noEmit` — zero type errors
- Write results to: `.napkins/30-doing/0100-electron-single-terminal/agents/003-test-eng-electron-shell/response.md`
