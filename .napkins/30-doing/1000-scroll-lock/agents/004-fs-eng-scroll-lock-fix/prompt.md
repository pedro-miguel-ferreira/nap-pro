You're a fullstack engineer on the NAP project. Read your role in `.napkins/00-org/roles/fullstack-eng.md` before you start.

Two bugs to fix in the scroll lock feature (1000).

**Bug 1: Frame border doesn't show when toggling Cmd+G.**
The scroll lock mode toggles internally but the visual border on the terminal container doesn't appear. Debug the chain: Cmd+G → `scroll-lock:toggle` IPC → renderer handler → `store.setScrollLockMode()` → Terminal.tsx reads `scrollLockModes[activeTerminalId]` → applies border CSS. Something in this chain is broken. Read `src/renderer/components/Terminal.tsx`, `src/renderer/store.ts`, and `src/renderer/index.tsx` to find it.

Also: very fast double Cmd+G doesn't register — the 500ms window for double-press might be too short or the timing logic has a bug.

**Bug 2: Read lock blocks mouse/trackpad scrolling.**
The current `onScroll` handler in `src/renderer/scroll-lock.ts` restores `pinnedLine` on ALL scroll events, including user mouse/trackpad scrolls. This makes it impossible to scroll while in read lock.

The fix is in the research document: `.napkins/30-doing/1000-scroll-lock/research-xterm-scroll-lock.md` — search for "Distinguishing User Scroll from Write Scroll" and the "Revised Skeleton". The approach uses `queueMicrotask` to tell user scrolls apart from write-triggered scrolls. In read lock, user mouse scroll should update `lockedY` (so you can scroll freely), while write-triggered scroll gets undone (viewport snaps back to where the user scrolled to).

Read the research document's revised skeleton carefully — it has the exact implementation with the `writeJustParsed` flag and `queueMicrotask` pattern.

All TypeScript, `tsc --noEmit` clean, existing tests still pass.

Write what you fixed to `.napkins/30-doing/1000-scroll-lock/agents/004-fs-eng-scroll-lock-fix/response.md`. Include manual test instructions.

When you're done, you MUST run this command in your terminal to signal completion:

```
nap done
```

This is critical — the architect is waiting on you with `nap nap`. If you don't run `nap done`, they'll be blocked.
