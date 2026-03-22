## Done

Wrote `0200-sqlite-setup.test.md` — 10 test cases across two sizes.

### Small (6 tests, vitest)
- T-0200-01: Interface parity — the critical seam
- T-0200-02: Idempotent schema init
- T-0200-03: UUID generation and storage
- T-0200-04: --session-id command injection (pure function, table-driven)
- T-0200-05: Status transitions persist
- T-0200-06: Database file creation

### Medium (4 tests, Playwright + Electron)
- T-0200-07: nap start → UUID → --session-id in pty (end-to-end)
- T-0200-08: nap ps reads from SQLite
- T-0200-09: nap done persists through pty exit
- T-0200-10: Database at .nap/nap.db next to .nap/sock

### Key judgment calls
- No renderer tests — spec says main process only
- No tests for nepics/napkins/ui_state tables — they're scaffolding, no data flows through them in 0200
- Existing tests are the regression suite — if any break, the store interface contract is violated
- --session-id injection is isolated as a pure function test — the integration test (T-0200-07) verifies the full flow
