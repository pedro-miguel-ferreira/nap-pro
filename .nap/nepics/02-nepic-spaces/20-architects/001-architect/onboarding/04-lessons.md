# Lessons from v1

Things learned the hard way. Read these so you don't repeat them.

## Agent Prompt Voice

We started writing agent prompts like documents — formal headers, numbered "mandatory reading" lists, structured sections. The agents treated them as reference material and delegated the reading to subagents. The role definition, the most important part, was never internalized.

The fix: write like you're talking to a teammate.

This works: "You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md` before you start. Your task: add a unix socket server and CLI. Read the spec and test cases in `.nap/.../0300-socket-cli/`. Read the source in `src/`."

This doesn't: "## Your role\nRead your role definition first.\n**Read this file:** `.nap/00-org/40-roles/fullstack-eng.md`\n## Mandatory reading\n1. ...\n2. ..."

The difference is attitude, not formatting. The first talks to someone. The second describes a landscape. Agents act on the first and delegate the second.

Give agents autonomy. State what needs to exist when they're done. Don't dictate how to build it. They're teammates, not soldiers.

## Agents Forget `nap done`

Every agent must call `nap done` in their terminal when finished. Without it, the architect's `nap nap` never unblocks. Agents don't do this automatically — you must tell them in the prompt, and be emphatic about it. Even then, some forget. This was a recurring issue.

## Testing Strategy

**Playwright + Electron + `page.evaluate()` is the sweet spot.** You get the real app — real xterm, real WebGL, real pty, real IPC — driven programmatically. No clicking buttons, no CSS selectors, no fragile UI automation. Call store actions directly, read xterm buffers, measure timing, listen for events.

Real bugs caught by integration tests:
- node-pty SIGABRT on shutdown (V8 teardown racing with pty exit callbacks)
- `stopSocketServer()` deleting another instance's socket file
- Pty exit overwriting 'done' status with 'exited'
- Second Electron instance segfaulting on quit (window created before socket check)
- Test isolation failure when running tests inside a running NAP instance

Each of these would have shipped without tests.

**Test isolation:** When NAP is running and you run tests, the test's Electron instance conflicts on the socket. Every test must use a unique `NAP_SOCKET` path. There's a `launchApp()` helper in `tests/helpers.ts` that handles this.

## The Architect Doesn't Write Code

The moment the architect starts editing source files, they're doing the wrong job. Write specs, write prompts, launch agents, review output. If you burn context reading implementation details, you won't have it when you need to hold the system shape across features.

One exception: small config changes, file moves, directory structure. Things that aren't engineering work.

## Know When to Stop

Scroll lock took four iterations and a deep research dive into xterm.js internals. It works mostly, but edge cases with Claude Code's ink rendering remain. The lesson: recognize when you're in a rabbit hole that's eating diminishing returns. Ship what works, note what doesn't, move on. The 80% solution that ships beats the 100% solution that blocks everything else.

## The Filesystem is a UI

The directory structure — napkins, agents, board symlinks — is the editor's UI. The human reads and comments on napkins in VS Code, not in the app. Keep the filesystem clean and intentional. The editor is a first-class interface.
