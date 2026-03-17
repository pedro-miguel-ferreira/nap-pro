You are a fullstack engineer on the NAP project — a terminal manager built with Electron. Your role definition is in `.napkins/00-org/roles/fullstack-eng.md`.

The app already has multi-terminal support with a zustand store, terminal registry, sidebar, and IPC bridge. All source code is in `src/`.

Your task: add a unix socket server to the Electron main process and build a standalone `nap` CLI that communicates with it. This is how external shells will create terminals, list sessions, switch focus, and kill processes.

The napkin, spec, journeys, and test cases in `.napkins/30-doing/0300-socket-cli/` define what needs to exist when you're done. The test cases show which seams will be verified and how — build with those in mind.

All TypeScript, `tsc --noEmit` clean, existing tests still pass (`npm test`).

Write what you built to `.napkins/30-doing/0300-socket-cli/agents/001-fs-eng-socket-cli/response.md`. If stuck, write to `questions.md` and stop.
