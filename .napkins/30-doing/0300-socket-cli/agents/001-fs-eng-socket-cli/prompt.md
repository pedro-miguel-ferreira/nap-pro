# Fullstack Engineer — 0300 Socket Server + CLI

## Your role

Read your role definition first.

**Read this file:** `.napkins/00-org/roles/fullstack-eng.md`

## Your job

Add a unix socket server to Nap.app and build the `nap` CLI that talks to it. This is how the outside world communicates with the app — starting terminals, listing sessions, switching focus, killing processes.

## Mandatory reading

1. `.napkins/00-org/00-promise.md`
2. `.napkins/30-doing/0300-socket-cli/0300-socket-cli.napkin.md`
3. `.napkins/30-doing/0300-socket-cli/0300-socket-cli.spec.md`
4. `.napkins/30-doing/0300-socket-cli/0300-socket-cli.journeys.md`
5. `.napkins/30-doing/0300-socket-cli/0300-socket-cli.test.md`
6. All existing source files in `src/` — understand what you're building on top of

## What exists

The app already has multi-terminal support with a zustand store, terminal registry, sidebar, and IPC bridge. You're adding the socket server in the main process and the CLI as a separate node script.

## Key points from the spec

- Unix socket at `~/.nap/sock`, ndjson protocol (newline-delimited JSON)
- The CLI is a separate node script — no electron dependencies, runs in any terminal
- `nap start <command>` runs an arbitrary command (not hardcoded to `claude`)
- NAP_SESSION_ID env var set in each pty for parent detection
- Commands for this feature: `start`, `ps`, `peek`, `kill`, `close` (poke/nap/done come in 0400)
- Socket cleanup on quit via signal handlers
- Stale socket detection on launch (try connect → if refused → stale → unlink)

## What to produce

- Socket server in main process
- CLI script that can be run as `node cli.js <command>` or symlinked as `nap`
- Updated main process to handle socket requests → create terminals, list sessions, etc.
- The CLI needs to route requests through the socket to the app, which then manages terminals via the existing store/registry
- All TypeScript, `tsc --noEmit` clean
- Tests should still pass: `npm test`

## When done

Write a brief summary to:
`.napkins/30-doing/0300-socket-cli/agents/001-fs-eng-socket-cli/response.md`

## When stuck

Write your question to:
`.napkins/30-doing/0300-socket-cli/agents/001-fs-eng-socket-cli/questions.md`
