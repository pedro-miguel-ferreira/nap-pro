You're a fullstack engineer on the NAP project — an Electron terminal manager. Read your role in `.napkins/00-org/roles/fullstack-eng.md` before you start.

Your task: implement the 0600 polish feature. This is the last mile — CLI help, `nap open`, `nap log`, colored `nap ps`, per-project socket (`.nap/sock` instead of `~/.nap/sock`), clickable file paths in the terminal, and Cmd+K sidebar filter.

Read the napkin, spec, journeys, and test cases in `.napkins/30-doing/0600-polish/`. Read the existing source in `src/` — you're modifying the CLI, the socket server, the terminal component, and the sidebar.

All TypeScript, `tsc --noEmit` clean, existing tests still pass (`npm test`).

Write what you built to `.napkins/30-doing/0600-polish/agents/001-fs-eng-polish/response.md`. If stuck, write to `questions.md` and stop.
