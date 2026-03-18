# 002-test-arch — Cmd+W Close Terminal

## Summary

Designed 12 test cases in `0700-cmd-w-close.test.md`. 10 small (store/registry, Vitest), 2 medium (Playwright + Electron).

## Key seams identified

1. **Guard ordering in `closeActiveTerminal()`** — count-before-status is load-bearing. T-0700-02 specifically tests the last-terminal-exited edge case where wrong guard order would delete the only terminal.
2. **`pty:close` vs `pty:kill`** — the whole reason this IPC channel exists. T-0700-08 verifies both kill AND removeSession happen, preventing ghost sessions in `nap ps`.
3. **Active terminal switch after close** — always falls back to `remaining[0]`. T-0700-05 and T-0700-10 verify this across single and rapid sequential closes.
4. **Registry disposal** — xterm instance must be disposed and removed from registry, not just from store. T-0700-03 and T-0700-07 check both sides.

## Test distribution

- **Small (Vitest)**: T-0700-01 through T-0700-07, T-0700-10, T-0700-11 — guard conditions, state transitions, disposal. These follow the pattern in `store-registry.test.ts`.
- **Medium (Playwright)**: T-0700-08, T-0700-09 — IPC bridge verification requires real Electron. Follow the pattern in `terminal.spec.ts`.
- **Manual**: T-0700-12 — listener cleanup, code-review checkpoint.

## What I chose NOT to test

- Visual card removal from sidebar (UI test territory, fragile)
- Happy path where shell exits naturally (already covered by T-0100-04)
- `removeTerminal` and `disposeTerminalOnly` (existing tests cover these, and they share the same switch logic)
