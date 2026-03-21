## Test Architect — 0600 Polish

22 test cases across 6 feature areas. Written to `0600-polish.test.md`.

### Breakdown

| Area | Tests | Sizes |
|---|---|---|
| Per-project socket | T-0600-01 to 04 | 1 small, 3 medium |
| CLI help | T-0600-05 to 07 | 3 small |
| nap open | T-0600-08 to 10 | 3 medium |
| nap log | T-0600-11 to 13 | 3 medium |
| nap ps colors | T-0600-14 to 16 | 1 small, 2 medium |
| Clickable file paths | T-0600-17 to 19 | 2 small, 1 medium |
| Cmd+K filter | T-0600-20 to 22 | 3 medium |

### Key seams identified

1. **Socket discovery walk-up** — new logic, pure function, easy to unit test. Most likely source of bugs (edge cases: symlinks, mount points, root dir).
2. **Per-project socket isolation** — the biggest architectural change. Two-app test (T-0600-04) is the most important medium test. If sessions leak between projects, everything breaks.
3. **Log handler → xterm buffer read** — new IPC path from socket through main to renderer buffer. The xterm buffer may not exist if terminal was never displayed (lazy open). This seam will break.
4. **File path regex** — classic regex territory: must match real paths, must not match URLs. Unit-testable and high-value.
5. **Cmd+K filter → card click** — filter could break event handlers. T-0600-22 guards this.

### Deferred to manual

- Cmd+hover visual styling (underline, cursor)
- shell.openPath actually opening the right editor
- .gitignore content

### File organization

4 test files: 3 small (unit, Vitest) + 1 medium (Electron, Playwright). Follows existing pattern in `tests/`.
