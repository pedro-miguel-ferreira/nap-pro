You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: design the test architecture for 0200-sqlite-setup — replacing the in-memory session store with SQLite persistence.

Read these:
- `.nap/nepics/02-nepic-spaces/30-napkins/0200-sqlite-setup/0200-sqlite-setup.nap.md`
- `.nap/nepics/02-nepic-spaces/30-napkins/0200-sqlite-setup/0200-sqlite-setup.spec.md`
- `.nap/nepics/02-nepic-spaces/10-docs/01-inputs.nap.md` — the mega napkin, for full system context

Read the existing code to understand the seams:
- `src/main/session-store.ts` — what's being replaced
- `src/main/main.ts` — how session-store is used
- `src/main/socket-server.ts` — socket handlers that call session-store
- `src/cli/nap.ts` — CLI commands that talk through the socket
- `tests/` — existing test patterns and helpers

Think about where this change creates seams:
- Session-store API boundary — does the new SQLite-backed store behave identically to the old in-memory one?
- CC session UUID generation and injection into the pty command
- Database lifecycle — creation, init, idempotent schema
- nap start end-to-end: CLI → socket → SQLite → pty with --session-id
- nap done / nap ps — do they still work when the backend is SQLite?
- Database file location — `.nap/nap.db` next to `.nap/sock`

Write your test architecture to `.nap/nepics/02-nepic-spaces/30-napkins/0200-sqlite-setup/0200-sqlite-setup.test.md`.

CRITICAL: when you are done, run `nap done` in your terminal. The architect is blocked waiting — without this, the pipeline stalls.
