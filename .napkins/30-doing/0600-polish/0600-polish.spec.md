* nap v0.1 polish — min spec

* per-project socket
  * socket lives at `.nap/sock` inside the project directory
    * app creates `.nap/` dir on launch if it doesn't exist
    * add `.nap/` to `.gitignore`
  * CLI finds socket by walking up from cwd
    * check cwd for `.nap/sock`, then parent, then parent's parent...
    * stop at filesystem root
    * if not found: "no nap project found (run `nap open` in a project directory)"
  * app launch creates socket relative to its cwd, not ~

* CLI help
  * `nap --help` — list all commands with one-line descriptions
  * `nap <command> --help` — usage for that command
  * `nap` with no args — same as `nap --help`
  * use a lightweight arg parser (commander, yargs-parser, or hand-rolled)
    * keep it dependency-light

* nap open
  * `nap open [path]` — launches Nap.app
    * path defaults to `.`
    * resolves to absolute path
    * needs to know where the electron app build lives
      * env var `NAP_APP_PATH` — path to the nap-app directory
      * or default to `~/nap-app` if not set
    * spawns: `electron <NAP_APP_PATH> --cwd <resolved-path>`
      * the app reads --cwd (or the cwd of the spawned process)
    * detaches from terminal (child_process.spawn with detached + unref)
    * if .nap/sock already exists and is live → "nap is already running in this project"

* nap log
  * `nap log <name>` — dumps terminal scrollback to stdout
  * new socket command: { type: "log", name }
  * app reads xterm buffer, returns as string array (lines)
  * CLI prints lines to stdout
  * useful for architect reading agent output without switching cards

* nap ps colored output
  * status dots in ANSI color
    * running: green (\\033[32m●\\033[0m)
    * exited: gray (\\033[90m●\\033[0m)
    * done: blue (\\033[34m●\\033[0m)
  * table columns aligned
  * `nap ps --json` — raw JSON, no colors, no table

* clickable file paths in terminal
  * xterm.js `registerLinkProvider` with custom provider
  * regex matches file-like patterns
    * relative: `src/main.ts`, `./tests/foo.ts`
    * absolute: `/Users/.../file.ts`
    * with line:col: `file.ts:42:17`, `file.ts:42`
    * avoid false positives on URLs (those are for addon-web-links)
  * Cmd+hover → underline + pointer cursor
  * Cmd+click → `shell.openPath(resolvedPath)` or `open <path>`
    * no stat, no fs check — if path doesn't exist, open fails silently
    * resolve relative paths against terminal's cwd

* Cmd+K sidebar filter
  * Cmd+K → input field appears at top of sidebar
  * filters cards by name (substring match, case-insensitive)
  * escape or empty input → show all cards
  * filtered cards still clickable
