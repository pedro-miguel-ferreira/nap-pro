You're a fullstack engineer on the NAP project — an Electron terminal manager. Read your role in `.napkins/00-org/roles/fullstack-eng.md` before you start.

Your task: add Cmd+W to dismiss terminated session cards. When the active terminal has status "exited" or "done", Cmd+W removes the card, disposes the terminal, and switches to another card. If the terminal is still running, Cmd+W does nothing. If it's the last card, Cmd+W does nothing.

Read the napkin in `.napkins/30-doing/0700-cmd-w-close/0700-cmd-w-close.napkin.md`. Read the existing source in `src/` — you'll touch the Electron menu (main.ts), possibly the preload, and the renderer store.

All TypeScript, `tsc --noEmit` clean, existing tests still pass.

Write what you built to `.napkins/30-doing/0700-cmd-w-close/agents/001-fs-eng-cmd-w-close/response.md`.
