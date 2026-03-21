# 0600 Polish — Test Cases

Test IDs: T-0600-01 through T-0600-22

---

## Per-Project Socket

### T-0600-01: Socket created in project directory on app launch

- **Flow**: App launches with `--cwd /tmp/test-project` → creates `.nap/` dir → socket lives at `.nap/sock`
- **Subsystems**: main.ts launch → socket-server.ts
- **Expected**: `.nap/sock` exists inside project dir, not `~/.nap/sock`
- **Breaks when**: Socket creation still uses hardcoded home path; `.nap/` dir creation fails on permissions
- **Size**: Medium
- **Verification**: `app.evaluate()` to check `fs.existsSync(path.join(cwd, '.nap', 'sock'))` returns true. CLI connecting to that socket gets a valid `ps` response.

### T-0600-02: CLI walks up directories to find socket

- **Flow**: App running with cwd `/tmp/a/b/c`. CLI runs from `/tmp/a/b/c/d/e` → walks up → finds `.nap/sock` at `/tmp/a/b/c/.nap/sock`
- **Subsystems**: CLI socket discovery → socket-server
- **Expected**: CLI connects successfully, `nap ps` returns data
- **Breaks when**: Walk-up logic stops too early, doesn't cross directory boundaries, or checks wrong path
- **Size**: Small (pure logic for the walk-up function) + Medium (integration with real socket)
- **Verification**: Small — unit test the walk-up function with mock fs. Medium — spawn CLI from nested dir, assert `nap ps` exits 0 with valid output.

### T-0600-03: CLI errors when no socket found

- **Flow**: CLI runs from `/tmp/orphan-dir` with no `.nap/sock` anywhere up the tree
- **Subsystems**: CLI socket discovery
- **Expected**: stderr contains "no nap project found", exit code non-zero
- **Breaks when**: Walk-up doesn't terminate at filesystem root, or falls back to `~/.nap/sock`
- **Size**: Small
- **Verification**: Unit test walk-up function returning null for rootless path. Medium — run CLI from isolated dir, assert stderr message and exit code.

### T-0600-04: Two projects run simultaneously without conflict

- **Flow**: Launch app A with cwd `/tmp/project-a`, launch app B with cwd `/tmp/project-b`. Run `nap start` in each. Run `nap ps` from each project dir.
- **Subsystems**: socket-server (two instances) → CLI socket discovery → session-store (isolated per app)
- **Expected**: Each `nap ps` shows only its own project's sessions. No cross-contamination.
- **Breaks when**: Socket path collision, session store shared globally, CLI finds wrong socket
- **Size**: Medium
- **Verification**: Start a named session in project-a (`--name alpha`), start in project-b (`--name beta`). `nap ps` from project-a shows `alpha` but not `beta`, and vice versa.

---

## CLI Help

### T-0600-05: `nap --help` prints all commands

- **Flow**: Run `nap --help` (no running app needed)
- **Subsystems**: CLI arg parser
- **Expected**: stdout lists all commands (start, ps, peek, kill, close, poke, nap, done, open, log) with one-line descriptions. Exit 0.
- **Breaks when**: New commands not added to help, arg parser doesn't recognize `--help`
- **Size**: Small
- **Verification**: Capture stdout, assert it contains each command name. Assert exit code 0.

### T-0600-06: `nap` with no args shows help

- **Flow**: Run `nap` with no arguments
- **Subsystems**: CLI arg parser
- **Expected**: Same output as `nap --help`
- **Breaks when**: No-arg case falls through to "unknown command" or tries to connect to socket
- **Size**: Small
- **Verification**: Compare stdout of `nap` vs `nap --help` — should be identical. Assert no socket connection attempted (no "nap is not running" error).

### T-0600-07: `nap <command> --help` prints command usage

- **Flow**: Run `nap start --help`
- **Subsystems**: CLI arg parser
- **Expected**: stdout shows usage for `start` command including flags (`--name`, `--cwd`). Exit 0.
- **Breaks when**: Per-command help not implemented, `--help` treated as a flag value
- **Size**: Small
- **Verification**: Assert stdout contains "start", "--name", "--cwd". Assert exit code 0.

---

## nap open

### T-0600-08: `nap open` spawns Electron detached

- **Flow**: Run `nap open` from `/tmp/test-project` with `NAP_APP_PATH` set
- **Subsystems**: CLI → child_process.spawn → Electron app
- **Expected**: Electron process spawned and detached. CLI exits immediately (doesn't block). `.nap/sock` becomes live within a few seconds.
- **Breaks when**: Spawn not detached (CLI hangs), wrong electron path, cwd not passed
- **Size**: Medium
- **Verification**: Assert CLI exits within 1s. Poll for `.nap/sock` existence. Connect and run `nap ps` successfully.

### T-0600-09: `nap open` when already running

- **Flow**: App already running in project (`.nap/sock` is live). Run `nap open` again.
- **Subsystems**: CLI → socket alive check
- **Expected**: stderr says "nap is already running in this project". No second app spawned. Exit non-zero.
- **Breaks when**: No alive check before spawn, or alive check uses wrong socket path
- **Size**: Medium
- **Verification**: Assert stderr message. Assert only one Electron process for this project.

### T-0600-10: `nap open <path>` resolves to absolute

- **Flow**: From `/tmp`, run `nap open ./test-project`
- **Subsystems**: CLI path resolution → spawn
- **Expected**: App launches with cwd `/tmp/test-project` (absolute). Socket at `/tmp/test-project/.nap/sock`.
- **Breaks when**: Relative path passed as-is to Electron, path not resolved
- **Size**: Medium
- **Verification**: After app starts, `nap ps` from `/tmp/test-project` works. Check socket location.

---

## nap log

### T-0600-11: `nap log <name>` dumps scrollback

- **Flow**: Start session `--name logger` running `echo hello && echo world`. Wait for exit. Run `nap log logger`.
- **Subsystems**: CLI → socket → main.ts handler → xterm buffer read → response → CLI stdout
- **Expected**: stdout contains "hello" and "world" from terminal scrollback
- **Breaks when**: Buffer read returns empty (terminal not opened), lines not serialized correctly, handler not registered
- **Size**: Medium
- **Verification**: Capture `nap log logger` stdout, assert it contains "hello" and "world".

### T-0600-12: `nap log` works with piping

- **Flow**: Start session that outputs 100 numbered lines. Run `nap log <name> | tail -5`.
- **Subsystems**: CLI stdout → pipe
- **Expected**: Only last 5 lines printed. CLI doesn't hang or buffer incorrectly.
- **Breaks when**: Output not line-buffered, CLI doesn't flush stdout, output doesn't end with newline
- **Size**: Medium
- **Verification**: Assert pipe output is exactly 5 lines. Assert exit code 0.

### T-0600-13: `nap log` for nonexistent session

- **Flow**: Run `nap log ghost`
- **Subsystems**: CLI → socket → name-resolver
- **Expected**: Error with "not found" (and fuzzy suggestion if close match exists). Non-zero exit.
- **Breaks when**: Handler crashes instead of returning error, name resolver not wired to log handler
- **Size**: Medium
- **Verification**: Assert stderr contains "not found". Assert exit code non-zero.

---

## nap ps — Colored Output

### T-0600-14: `nap ps` shows ANSI-colored status dots

- **Flow**: Start three sessions. Let one exit naturally, mark one done. Run `nap ps` (not `--json`).
- **Subsystems**: CLI → socket → ps handler → CLI formatting
- **Expected**: Running session has green dot (`\033[32m`), exited has gray (`\033[90m`), done has blue (`\033[34m`).
- **Breaks when**: Color codes wrong, colors not applied per status, terminal doesn't support ANSI
- **Size**: Medium
- **Verification**: Capture raw stdout bytes, assert ANSI escape sequences present for each status color.

### T-0600-15: `nap ps --json` has no ANSI codes

- **Flow**: Same setup as T-0600-14. Run `nap ps --json`.
- **Subsystems**: CLI formatting
- **Expected**: Valid JSON output. No ANSI escape sequences anywhere. Status field is plain string.
- **Breaks when**: JSON mode still includes color codes, JSON serialization includes formatting
- **Size**: Small (can test the formatting function directly) + Medium
- **Verification**: Parse output as JSON (should not throw). Assert no `\033[` sequences in output string.

### T-0600-16: `nap ps` table columns aligned

- **Flow**: Start sessions with varying name lengths. Run `nap ps`.
- **Subsystems**: CLI table formatting
- **Expected**: Columns are aligned (name column width accommodates longest name).
- **Breaks when**: No padding logic, hardcoded column widths
- **Size**: Small
- **Verification**: Split output lines, verify column positions are consistent across rows.

---

## Clickable File Paths

### T-0600-17: File path regex matches common patterns

- **Flow**: Feed terminal text containing `src/main/main.ts`, `./tests/foo.ts`, `/Users/me/file.ts`, `file.ts:42:17`, `file.ts:42`
- **Subsystems**: Link provider regex
- **Expected**: All patterns detected as links
- **Breaks when**: Regex too strict (misses dotfiles, deeply nested), too loose (matches URLs, prose)
- **Size**: Small
- **Verification**: Unit test the regex against a battery of positive matches (paths) and negative matches (URLs like `https://example.com`, plain words, version strings like `v1.2.3`).

### T-0600-18: Link provider registered and Cmd+click opens file

- **Flow**: Terminal outputs `src/main/main.ts:42`. User Cmd+clicks.
- **Subsystems**: terminal-registry → xterm registerLinkProvider → Electron shell.openPath
- **Expected**: Link provider is registered on terminal instance. Activation calls open with resolved absolute path.
- **Breaks when**: Provider not registered, path resolution wrong (relative to app dir instead of terminal cwd), open call fails
- **Size**: Medium
- **Verification**: `page.evaluate()` to check link provider registered on terminal. Programmatically trigger link activation callback, assert `shell.openPath` was called with correct resolved path (mock or spy on shell.openPath via preload).

### T-0600-19: URLs not captured by file path provider

- **Flow**: Terminal outputs `https://example.com/path/to/thing`
- **Subsystems**: Link provider regex
- **Expected**: Not matched by file path provider. Left to addon-web-links.
- **Breaks when**: Regex matches URL paths as file paths
- **Size**: Small
- **Verification**: Unit test regex returns no match for URL strings.

---

## Cmd+K Sidebar Filter

### T-0600-20: Cmd+K opens filter input, typing filters cards

- **Flow**: Create 5 terminals with names: `fs-eng`, `test-arch`, `fs-eng-2`, `reviewer`, `test-runner`. Press Cmd+K. Type "test".
- **Subsystems**: Sidebar component → filter state → card rendering
- **Expected**: Filter input visible. Only `test-arch` and `test-runner` cards visible.
- **Breaks when**: Cmd+K not wired, filter doesn't update card list, substring match is case-sensitive when it shouldn't be
- **Size**: Medium
- **Verification**: `page.evaluate()` to dispatch Cmd+K keydown. Assert filter input element exists in DOM. Set input value to "test", dispatch input event. Query sidebar card elements, assert only 2 visible with correct names.

### T-0600-21: Escape clears filter, shows all cards

- **Flow**: Continue from T-0600-20. Press Escape.
- **Subsystems**: Sidebar component → filter state
- **Expected**: Filter input hidden or cleared. All 5 cards visible.
- **Breaks when**: Escape not handled, filter state not reset
- **Size**: Medium
- **Verification**: Dispatch Escape keydown. Assert filter input hidden/empty. Assert 5 cards visible.

### T-0600-22: Filtered cards remain clickable

- **Flow**: Filter to show 2 cards. Click one.
- **Subsystems**: Sidebar filter → card click handler → store.setActive
- **Expected**: Terminal switches to clicked card. Active terminal ID updates.
- **Breaks when**: Filter breaks click handlers, filtered cards not interactive
- **Size**: Medium
- **Verification**: `page.evaluate()` to filter, then click a card. Assert `store.getState().activeTerminalId` matches clicked card's terminal ID.

---

## Test File Organization

```
tests/
  polish/
    socket-discovery.test.ts      # T-0600-02, T-0600-03 (small, unit)
    file-path-regex.test.ts       # T-0600-17, T-0600-19 (small, unit)
    ps-formatting.test.ts         # T-0600-15 partial, T-0600-16 (small, unit)
    polish.spec.ts                # T-0600-01, T-0600-04, T-0600-08–16, T-0600-18, T-0600-20–22 (medium, Electron)
```

## Not Tested (Manual / Out of Scope)

- **Cmd+hover underline + pointer cursor** — visual styling, no programmatic assertion. Manual.
- **`shell.openPath` actually opens file in editor** — OS-dependent default handler. Manual.
- **`.gitignore` includes `.nap/`** — documentation concern, not runtime behavior.
- **Agent name from `--name` on sidebar card** — already covered implicitly by T-0200 and T-0300 test suites (session name propagation). Verify manually if regression suspected.
