You're the test architect on the NAP project. Read your role in `.napkins/00-org/roles/test-architect.md` before you start.

Your task: design test cases for the 1000 scroll lock feature. Three modes (off/follow/read) toggled by Cmd+G, with visual border indicators.

Read the napkin in `.napkins/30-doing/1000-scroll-lock/1000-scroll-lock.napkin.md`. Read the xterm.js research in `.napkins/30-doing/1000-scroll-lock/research-xterm-scroll-lock.md` — it explains exactly how viewport scrolling works internally and which APIs are available. Read the fullstack eng's response in `.napkins/30-doing/1000-scroll-lock/agents/001-fs-eng-scroll-lock/response.md`. Read the source in `src/renderer/scroll-lock.ts` and the changes in `Terminal.tsx`, `store.ts`, `index.tsx`.

Key testing insight: `terminal.buffer.active.viewportY` and `baseY` are readable via `page.evaluate()`. You can programmatically write pty output, scroll, toggle modes, and assert viewport position — all without visual inspection.

Write the test cases to `.napkins/30-doing/1000-scroll-lock/1000-scroll-lock.test.md`. Write a brief summary to `.napkins/30-doing/1000-scroll-lock/agents/002-test-arch-scroll-lock/response.md`.

When you're done, run `nap done` to signal completion.
