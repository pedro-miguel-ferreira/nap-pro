You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: replace the in-memory session store with SQLite-backed persistence using better-sqlite3.

Read these in order:
1. `.nap/00-org/10-promise.nap.md` — what NAP is
2. `.nap/nepics/02-nepic-spaces/30-napkins/0200-sqlite-setup/0200-sqlite-setup.nap.md` — the napkin
3. `.nap/nepics/02-nepic-spaces/30-napkins/0200-sqlite-setup/0200-sqlite-setup.spec.md` — the spec with schema
4. `.nap/nepics/02-nepic-spaces/30-napkins/0200-sqlite-setup/0200-sqlite-setup.test.md` — test architecture (shape your code so these tests are possible)

Read the existing code:
- `src/main/session-store.ts` — what you're replacing
- `src/main/main.ts` — where session-store is used
- `src/main/socket-server.ts` — socket setup
- `src/shared/constants.ts` — socket path discovery (use same pattern for db path)

What to build:
1. Install better-sqlite3 and its types. Run electron-rebuild.
2. Create `src/main/database.ts` — init function, schema creation, db instance management
3. Rewrite `src/main/session-store.ts` — same interface, SQLite backend instead of Map
4. Add CC session UUID generation in session creation (crypto.randomUUID)
5. Create a pure function for --session-id injection into command strings
6. Update `src/main/main.ts` — init database on startup (before socket server), pass --session-id when spawning ptys
7. Run `npm run typecheck` — zero errors
8. Run `npm run test:small` — all existing tests pass

Key constraints:
- Session-store interface stays the same — callers don't change
- Socket protocol unchanged
- Renderer code untouched
- All existing tests must pass
- Database at `.nap/nap.db` using same project root discovery as socket

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0200-sqlite-setup/agents/002-fs-eng-sqlite/response.md`, then run `nap done` in your terminal. The architect is blocked waiting — without this, the pipeline stalls.
