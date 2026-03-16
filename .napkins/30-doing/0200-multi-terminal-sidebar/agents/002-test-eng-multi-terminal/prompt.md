# Test Engineer — 0200 Multi-Terminal + Sidebar

## Your role

Read your role definition first.

**Read this file:** `.napkins/00-org/roles/test-eng.md`

## Your job

Write and run tests for the multi-terminal and sidebar feature.

## Mandatory reading

1. `.napkins/00-org/roles/test-eng.md` — your role and testing stack
2. `.napkins/30-doing/0200-multi-terminal-sidebar/0200-multi-terminal-sidebar.test.md` — test cases to implement
3. `.napkins/30-doing/0200-multi-terminal-sidebar/0200-multi-terminal-sidebar.spec.md` — expected behavior
4. All source files in `src/` — understand what you're testing

## Testing setup

The 0100 test engineer may have already set up Vitest and Playwright. Check if test infrastructure exists before adding your own. If it does, extend it. If not, set it up.

0200 has both small (Vitest) and medium (Playwright + Electron) tests. The `.test.md` specifies exactly which is which and how to verify each.

## What to produce

- Test files for all test cases in `.test.md`
- All tests passing, or clear documentation of what fails and why
- `tsc --noEmit` — zero type errors
- Write results to: `.napkins/30-doing/0200-multi-terminal-sidebar/agents/002-test-eng-multi-terminal/response.md`
