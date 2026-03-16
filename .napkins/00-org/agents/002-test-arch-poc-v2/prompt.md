# Test Architect — NAP v0.1 POC (v2)

## Your role

You are the test architect. Read your role definition — it has been updated with the testing strategy.

**Read this file first:** `.napkins/00-org/roles/test-architect.md`

## Context

A first pass of test cases already exists for all five features. They were written before we settled on the testing strategy (Playwright + Electron for integration, Vitest for pure logic). The existing test cases describe good flows but don't specify:
- Test size (small / medium / big)
- How to verify programmatically (what assertion proves it works)
- Whether it's a manual test or automatable

Your job is to rewrite all five `.test.md` files with this framing.

## Existing code

The app is partially built. Read the existing code to understand what's testable and how:
- `src/main/main.ts` — multi-pty management, IPC handlers
- `src/main/preload.ts` — IPC bridge
- `src/renderer/store.ts` — zustand store (terminal metadata)
- `src/renderer/terminal-registry.ts` — xterm instances outside React
- `src/renderer/components/Terminal.tsx` — terminal display, DOM reparenting
- `src/renderer/components/Sidebar.tsx` — agent cards

Understanding the actual code will help you write test cases with specific, concrete verification methods (e.g., "call `getTerminal(id).terminal.buffer.active.length` to verify scrollback survived switch").

## Mandatory reading

1. `.napkins/00-org/roles/test-architect.md` — your role (read first)
2. `.napkins/00-org/00-promise.md`
3. `.napkins/00-org/33-poc-inputs-refined.md` — full POC requirements
4. All existing source files listed above
5. All five features' napkins, specs, and journeys in:
   - `.napkins/30-doing/0100-electron-single-terminal/`
   - `.napkins/30-doing/0200-multi-terminal-sidebar/`
   - `.napkins/10-backlog/0300-socket-cli/`
   - `.napkins/10-backlog/0400-poke-nap-done/`
   - `.napkins/10-backlog/0500-integration-stress/`
6. The existing test cases (to understand what was already identified):
   - `.napkins/30-doing/0100-electron-single-terminal/0100-electron-single-terminal.test.md`
   - `.napkins/30-doing/0200-multi-terminal-sidebar/0200-multi-terminal-sidebar.test.md`
   - `.napkins/10-backlog/0300-socket-cli/0300-socket-cli.test.md`
   - `.napkins/10-backlog/0400-poke-nap-done/0400-poke-nap-done.test.md`
   - `.napkins/10-backlog/0500-integration-stress/0500-integration-stress.test.md`

## What to produce

Rewrite these five files in place:

1. `.napkins/30-doing/0100-electron-single-terminal/0100-electron-single-terminal.test.md`
2. `.napkins/30-doing/0200-multi-terminal-sidebar/0200-multi-terminal-sidebar.test.md`
3. `.napkins/10-backlog/0300-socket-cli/0300-socket-cli.test.md`
4. `.napkins/10-backlog/0400-poke-nap-done/0400-poke-nap-done.test.md`
5. `.napkins/10-backlog/0500-integration-stress/0500-integration-stress.test.md`

Each test case should include:
- The flow being tested
- Test size (small / medium / big)
- Concrete verification method — what programmatic assertion proves this works
- If no programmatic path exists, mark as "manual" with a note on why

Use napkin format — asterisks nested all the way down.

Aim for ~80% confidence from small + medium tests. Big tests and manual tests fill the remaining gaps.

## When done

Write a brief summary to:
`.napkins/00-org/agents/002-test-arch-poc-v2/response.md`
