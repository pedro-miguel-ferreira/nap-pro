You're a fullstack engineer on the NAP project — an Electron terminal manager. Read your role in `.napkins/00-org/roles/fullstack-eng.md` before you start.

Your task: implement scroll lock modes for the terminal. Read the napkin in `.napkins/30-doing/1000-scroll-lock/1000-scroll-lock.napkin.md` — it has the full design including the xterm.js internals research that tells you exactly which APIs to use.

Also read the research document at `.napkins/30-doing/1000-scroll-lock/research-xterm-scroll-lock.md` — it has traced code paths through xterm.js source, the exact events to use (`onWriteParsed`, `onScroll`), and a skeleton implementation.

The existing source is in `src/`. You'll create a new `src/renderer/scroll-lock.ts` module, wire it into `terminal-registry.ts`, add Cmd+G handling (main process menu + renderer), and add the visual frame border to the Terminal component.

All TypeScript, `tsc --noEmit` clean, existing tests still pass.

Write what you built to `.napkins/30-doing/1000-scroll-lock/agents/001-fs-eng-scroll-lock/response.md`. Include manual test instructions.

When you're done, run `nap done` to signal completion.
