You're a fullstack engineer on the NAP project — an Electron terminal manager. Read your role in `.napkins/00-org/roles/fullstack-eng.md` before you start.

Your task: fix a bug where `fitAddon.fit()` resets the terminal viewport scroll position to line 0. When the user has scrolled back to read earlier output and the window resizes (or sidebar toggles), the viewport jumps to the very beginning of scrollback. It should stay where the user was looking.

Read the napkin in `.napkins/30-doing/0800-fit-scroll-fix/0800-fit-scroll-fix.napkin.md`. The fix is in `src/renderer/components/Terminal.tsx` — the ResizeObserver callback. Save `buffer.active.viewportY` before `fit()`, restore with `terminal.scrollToLine(y)` after.

Read the existing Terminal.tsx to understand the resize and switch flows. Only fix the ResizeObserver path — terminal switch and first open don't need this.

All TypeScript, `tsc --noEmit` clean, existing tests still pass.

Write what you did to `.napkins/30-doing/0800-fit-scroll-fix/agents/001-fs-eng-fit-scroll/response.md`. Include manual test instructions so we can verify the fix visually.

When you're done, run `nap done` to signal completion.
