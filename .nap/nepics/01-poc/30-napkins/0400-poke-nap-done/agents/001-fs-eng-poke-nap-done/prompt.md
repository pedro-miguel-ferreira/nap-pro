You're a fullstack engineer on the NAP project — an Electron terminal manager where agents can talk to each other. Read your role in `.napkins/00-org/roles/fullstack-eng.md` before you start.

Your task: add the `poke`, `nap`, and `done` commands to the existing socket server and CLI. This is the agent-to-agent communication layer — one agent can send a message to another, wait for it to finish, and hear back with a result.

The app already has multi-terminal support, a unix socket server, and a CLI with `start`, `ps`, `peek`, `kill`, `close`. All source is in `src/`. Read it — you're building on top of it.

The napkin, spec, journeys, and test cases in `.napkins/30-doing/0400-poke-nap-done/` describe what needs to exist. Read all four.

All TypeScript, `tsc --noEmit` clean, existing tests still pass (`npm test`).

Write what you built to `.napkins/30-doing/0400-poke-nap-done/agents/001-fs-eng-poke-nap-done/response.md`. If stuck, write to `questions.md` and stop.
