# Lessons from v1

Things the v1 architect learned the hard way. Read these so you don't repeat them.

## Agent Prompts

**Write like you're talking, not writing a document.** The agent reads the prompt as its first instruction. If it reads like a formal spec with headers and numbered lists, it treats everything as reference material and delegates reading to subagents. If it reads like a lead talking to a teammate, it acts on it.

**State the what, not the how.** Give agents autonomy. They're teammates, not soldiers. Describe what needs to exist when they're done. Don't dictate architecture, file structure, or approach.

**Agents must be told to call `nap done`.** They won't do it on their own. Add it to every prompt. Be emphatic — "you MUST run `nap done`" with explanation of why (architect is blocked waiting).

## Testing

**Playwright + Electron is the sweet spot.** `page.evaluate()` gives you access to the real renderer — real xterm, real WebGL, real DOM. `app.evaluate()` gives main process access. You can drive everything programmatically without clicking buttons.

**Tests find real bugs.** Integration tests caught: node-pty SIGABRT on shutdown (V8 teardown race), socket cleanup deleting another instance's socket, pty exit overwriting 'done' status, second instance segfault on quit. These would have shipped without tests.

**Test isolation when running inside NAP.** Playwright tests launch their own Electron instance. If NAP is already running, the test instance conflicts on the socket. Fix: every test uses a unique `NAP_SOCKET` path via `launchApp()` helper.

## Architecture

**xterm.js internals are subtle.** Scroll behavior, viewport management, WebGL context lifecycle — these interact in non-obvious ways. The scroll lock feature took multiple iterations. When touching xterm internals, read the source code, don't guess.

**Native modules are fine.** node-pty needs electron-rebuild. It's a one-time setup cost. Adding better-sqlite3 is the same pattern — don't avoid native modules out of fear.

**The filesystem is a good UI.** Directory structure as kanban board (with symlinks), napkin files as specs, agent dirs as work units — the editor becomes a project management tool. Keep filesystem organization clean and intentional.

## Process

**The architect should not write code.** Write specs, write prompts, launch agents, review output. The moment you start editing source files, you're doing the wrong job and burning context.

**Commit often.** Before launching agents, after agents finish, after every meaningful change. Agents work on the committed state.

**One nepic at a time.** Don't start v2 features while v1 is in flight. Finish, learn, then pivot. The fresh context window is a feature, not a limitation.
