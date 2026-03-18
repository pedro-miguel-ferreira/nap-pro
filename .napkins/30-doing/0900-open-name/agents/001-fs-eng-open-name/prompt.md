You're a fullstack engineer on the NAP project — an Electron terminal manager. Read your role in `.napkins/00-org/roles/fullstack-eng.md` before you start.

Your task: add a `--name` flag to `nap open`. Currently `nap open [path]` launches the app and the first terminal is always called "shell". The user wants `nap open . --name architect` so the first terminal card shows "architect" instead of "shell".

The CLI (`src/cli/nap.ts`) already parses `nap open`. It spawns Electron with `--cwd`. Add `--name` and pass it to Electron as another argv flag. The main process (`src/main/main.ts`) reads `--cwd` from argv — add `--name` the same way. The first terminal is created by the renderer on mount — it sends `pty:create` with a name. That name needs to come from the main process somehow (IPC or an env var that the renderer reads).

Read the source in `src/` to understand the flow. Keep it simple.

All TypeScript, `tsc --noEmit` clean, existing tests still pass.

Write what you did to `.napkins/30-doing/0900-open-name/agents/001-fs-eng-open-name/response.md`.

When you're done, run `nap done` to signal completion.
