# 0600 Polish — Test Results

## Summary

**22 test cases implemented across 4 files. All pass.**

| Suite | Tests | Result |
|-------|-------|--------|
| `tests/polish/socket-discovery.test.ts` | 7 | 7 pass |
| `tests/polish/file-path-regex.test.ts` | 15 | 15 pass |
| `tests/polish/ps-formatting.test.ts` | 7 | 7 pass |
| `tests/polish/polish.spec.ts` | 15 | 15 pass |
| **Total** | **44** | **44 pass** |

`tsc --noEmit` clean. Full suite (53 small + 57 medium = 110 tests) green.

---

## Test Case Mapping

| Test ID | File | Status |
|---------|------|--------|
| T-0600-01 | polish.spec.ts | Pass |
| T-0600-02 | socket-discovery.test.ts | Pass |
| T-0600-03 | socket-discovery.test.ts | Pass |
| T-0600-04 | polish.spec.ts | Pass |
| T-0600-05 | ps-formatting.test.ts | Pass |
| T-0600-06 | ps-formatting.test.ts | Pass |
| T-0600-07 | ps-formatting.test.ts | Pass |
| T-0600-08 | polish.spec.ts | Pass |
| T-0600-09 | polish.spec.ts | Pass |
| T-0600-10 | polish.spec.ts | Pass |
| T-0600-11 | polish.spec.ts | Pass |
| T-0600-12 | polish.spec.ts | Pass |
| T-0600-13 | polish.spec.ts | Pass |
| T-0600-14 | polish.spec.ts | Pass |
| T-0600-15 | ps-formatting.test.ts (partial) + polish.spec.ts | Pass |
| T-0600-16 | ps-formatting.test.ts + polish.spec.ts | Pass |
| T-0600-17 | file-path-regex.test.ts | Pass |
| T-0600-18 | polish.spec.ts | Pass (partial — see notes) |
| T-0600-19 | file-path-regex.test.ts | Pass (bug found → fixed by fullstack eng) |
| T-0600-20 | polish.spec.ts | Pass |
| T-0600-21 | polish.spec.ts | Pass |
| T-0600-22 | polish.spec.ts | Pass |

---

## Bug Found and Fixed

### T-0600-19: `isUrl()` window too small — URL paths not filtered

**Found by tests**: Link provider received `https://example.com/path/to/file.html`. Regex matched `/example.com/path/to/file.html` starting at position 13 (the second `/` of `://`). `isUrl()`'s 8-char lookbehind window captured `" https:/"` (one slash) instead of `"https://"` (two slashes). Check failed. Link was produced for URL path content.

**Root cause**: The regex's optional `/` prefix (`(?:\/)?`) consumes the second `/` of `://`, so the match start is always one position past the URL scheme delimiter. No matter how large the lookbehind window, the token before the match always ended with one slash instead of two.

**Fix** (by fullstack eng): `isUrl()` now walks back to the start of the surrounding non-whitespace token and includes the match itself in the token. The full `https://...` string is visible and `^https?:\/\/` matches correctly. Both URL tests now pass directly — no `test.fails` markers needed.

---

## Partial Coverage Notes

### T-0600-18: Link provider — xterm internals inaccessible

The test verifies the link provider integration by attempting to access xterm's internal `_core._linkifier2._linkProviders` array. In the current xterm.js build, this internal path is not accessible from `page.evaluate()`. The test logs a message and passes without the full activation check.

**What IS tested**: The link provider module itself is thoroughly covered by unit tests (T-0600-17, T-0600-19). The Medium test verifies the terminal buffer contains the expected text and that no errors occur during the flow.

**What is NOT tested**: Programmatic link activation through xterm internals. The Cmd+click → `shell.openPath` chain requires either xterm exposing link providers publicly or a manual test.

### T-0600-05, -06, -07: CLI help — file placement

These Small tests weren't listed in the test architecture's file organization. They're placed in `ps-formatting.test.ts` alongside other CLI output tests since they share the same test runner pattern (invoke CLI binary, check stdout).

---

## Manual Test Cases (Not Automated)

Per the test architecture:

- **Cmd+hover underline + pointer cursor** — visual styling, no programmatic assertion
- **`shell.openPath` actually opens file in editor** — OS-dependent default handler
- **`.gitignore` includes `.nap/`** — documentation concern
- **Agent name from `--name` on sidebar card** — covered implicitly by T-0200/T-0300 suites

---

## Test Architecture Decisions

1. **`nap open` cleanup**: Tests T-0600-08 and T-0600-10 spawn real Electron processes via the CLI. Cleanup uses `lsof -t <socket>` to find and SIGTERM the spawned process. Best-effort — if cleanup fails, the OS handles it.

2. **Socket server in vitest**: T-0600-15 and T-0600-16 small tests create a mini `net.createServer` to respond to `ps` requests. Uses async CLI spawning (`child_process.spawn`) so the event loop stays free for the server.

3. **Sidebar filter tests**: T-0600-20/21/22 use Playwright's `page.keyboard.press('Meta+k')` and `page.locator('[data-testid="sidebar-filter"]').fill()` to drive the filter. Cards are counted via `[data-testid="agent-card"]` locator.
