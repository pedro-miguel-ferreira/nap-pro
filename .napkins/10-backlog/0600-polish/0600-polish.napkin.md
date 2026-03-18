* nap v0.1 polish — last 1% for daily use

* CLI ergonomics
  * `nap --help` / `nap <command> --help`
    * proper help text, not "unknown command"
  * `nap` with no args
    * app running → show quick status (session count, active)
    * app not running → show help
  * `nap open [path]`
    * launches Nap.app with cwd = path (default: `.`)
    * spawns electron from the stable ~/nap-app build
    * the missing piece — right now you have to know the electron path
  * `nap log <name>`
    * dumps agent's terminal scrollback to stdout
    * architect can read agent output without switching cards
    * `nap log fs-eng-0500 | tail -50`
  * `nap ps` colored output
    * green/gray/blue dots in terminal (ANSI colors matching sidebar)
    * table format for humans, --json for scripts

* per-project socket
  * `.nap/sock` in project directory, not `~/.nap/sock`
    * each project gets its own Nap.app instance
    * no conflict when running on multiple projects
  * CLI walks up from cwd to find `.nap/sock`
    * same pattern as git finding `.git/`
    * stops at filesystem root, errors if not found
  * app creates `.nap/` dir on launch
  * `.gitignore` should include `.nap/`

* clickable file paths
  * custom xterm link provider via `registerLinkProvider`
  * regex matches common path patterns
    * relative: `src/main/main.ts`, `./tests/foo.spec.ts`
    * absolute: `/Users/.../file.ts`
    * with line numbers: `file.ts:42:17`, `file.ts:42`
  * Cmd+hover → underline + pointer cursor
  * Cmd+click → `open <path>` (macOS default handler)
    * no stat, no fs check — if path doesn't exist, open fails silently
  * always relative to terminal's cwd

* sidebar Cmd+K filter
  * Cmd+K → input overlay on sidebar
  * fuzzy filter agent cards by name
  * escape or empty → show all
  * with 10+ agents this becomes essential

* sidebar cards show agent name from `nap start --name`
  * verify this already works end-to-end
  * card should show the --name value, not "shell" or auto-generated
