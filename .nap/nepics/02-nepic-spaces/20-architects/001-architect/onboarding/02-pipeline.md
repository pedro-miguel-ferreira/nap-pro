# The Pipeline

## Why Not One Agent?

The obvious approach: give one AI agent a napkin and say "build it." This fails for three reasons:

**Context window.** A single agent can't hold the whole system — the napkin, the spec, the test strategy, the codebase, the test results, the iteration history. By the time it's fixing its third bug, it's forgotten why the system is shaped the way it is.

**Quality can't be tested in.** If the same agent writes code and tests, the tests reflect the agent's assumptions about its own code. It tests what it built, not what should have been built. The bugs that ship are the ones the author can't see.

**Thinking about what to test is not the same as writing code.** Test strategy is a design act — which seams matter, which integration points catch real bugs, what flows exercise the system. This is a different kind of thinking than "implement this function."

## The Roles

Four roles. Each exists because of a specific tension. Full role definitions are in `.nap/00-org/40-roles/`.

### Architect

**Why:** Ten agents working on the same codebase need someone who holds the whole shape. The human can't manage ten terminals directly. The architect reads napkins, decomposes them into specs, launches agents, reviews their output, routes failures, and catches when feature B conflicts with feature A's design. The architect talks to the human in conversation — brainstorming, discussing tradeoffs, making decisions together.

The architect doesn't write code. The moment you start editing source files, you're doing the wrong job and burning context you need for the long game.

### Test Architect

**Why:** Test STRATEGY is a design act, not a coding act. "Which seams between subsystems will catch real bugs?" is a fundamentally different question from "write a test for this function." The test architect reads the spec and journeys, understands the system shape, and designs test cases that guard the integration points — where module A hands off to module B.

Inspired by the Google Testing Book: you can't test quality into code. Quality comes from building with the right constraints. The test architect identifies those constraints and describes what to verify.

The test architect produces a `.test.md` file — not test code. Strategic test cases with: what flow is being tested, what subsystems are involved, what the expected behavior is, and where it's likely to break.

### Fullstack Engineer

**Why:** Someone needs to write the code, and they need to write it in a way that makes testing possible. The fullstack engineer reads the spec AND the test cases, then builds with proper APIs, module boundaries, and injectable dependencies so the tests described in `.test.md` can actually be implemented.

This is the key insight: the engineer sees the test cases before writing code. They don't just implement the spec — they shape the code so quality can be verified.

### Test Engineer

**Why:** The person who wrote the code is biased toward their own design. A separate test engineer implements the test cases designed by the test architect, runs them against the code, and reports what breaks. They're not inventing tests — they're implementing the test architect's strategy against code they didn't write.

When tests fail, the failure goes back to the fullstack engineer with specifics: the flow, the step that broke, the actual output, why it matters.

## The Flow

```
napkin → spec → test architecture → implementation → tests → iterate until green
```

Here's how this actually played out for feature 0300 (socket server + CLI) in v1:

**1. Napkin.** The architect and human brainstormed the unix socket server and CLI. The napkin captured: ndjson protocol over unix socket, CLI commands (start, ps, peek, kill, close), NAP_SESSION_ID env var for parent detection, socket cleanup on quit.

**2. Spec.** The architect wrote a min spec — not a document with sections, just the constraints: "socket path is `~/.nap/sock`, protocol is ndjson, CLI is a separate node script with no electron dependencies, `nap start` command string is passed to shell via `pty.spawn(shell, ['-c', command])`." Only things the engineer couldn't derive from the napkin + codebase.

**3. Test architecture.** The test architect agent read the spec and designed 9 test cases: socket round-trip latency, ndjson parser with split/concatenated chunks, stale socket detection, NAP_SESSION_ID propagation, name resolution with fuzzy matching. Each test case specified: what flow, which subsystems, how to verify programmatically, what's likely to break.

**4. Implementation.** The fullstack engineer agent read the spec and test cases, then built: a shared ndjson parser (testable in isolation as a small vitest test), a name resolver as a pure function (same), socket server with stale detection, CLI with all commands. The code was shaped so the test cases could be implemented — pure functions for the things that needed unit testing, proper IPC for the integration tests.

**5. Tests.** The test engineer agent implemented 22 tests: 14 small (vitest — ndjson parser, name resolver, CLI error paths) and 9 medium (playwright + electron — real socket, real pty, real IPC). **It found two real bugs:**
- `stopSocketServer()` was unconditionally deleting the socket file — instance B would wipe instance A's socket on quit
- The app created the window before checking for another instance, causing a segfault on quit when a second instance was detected

Both bugs were fixed. Neither would have been caught without integration tests.

## How Agents Are Managed

### Without NAP (the painful way)

You'd open five terminal tabs. In each one, you'd run `claude --verbose "read this prompt and write to that file"`. You'd manually switch between tabs to check progress. You'd forget which tab is which. You'd have no idea which agents are done, which are stuck, which are waiting. When one finishes, you'd have to manually go find its output file and read it.

### With NAP

Each agent gets a directory inside the napkin:

```
30-napkins/0300-socket-cli/agents/
  001-fs-eng-socket-cli/
    prompt.md          ← architect writes this
    response.md        ← agent writes this when done
```

The architect launches the agent:

```bash
nap start 'claude --verbose "read .nap/.../001-fs-eng-socket-cli/prompt.md and write your response to .nap/.../001-fs-eng-socket-cli/response.md"' --name 001-fs-eng-socket-cli
```

The agent appears as a card in the sidebar with a green dot. The architect can click it to watch it think. When done, the card turns blue (if the agent called `nap done`) or gray (if it just exited).

The architect waits:

```bash
nap nap 001-fs-eng-socket-cli --timeout 300
```

This blocks until the agent signals completion. Then the architect reads `response.md` and decides: commit, iterate, or move to the next agent.

**Important:** Agents must be explicitly told to call `nap done` in their prompt. They won't do it automatically. Without `nap done`, the architect's `nap nap` never unblocks.

## Min Specs

A min spec is the architect's opinionated take on why something exists and what constraints must be respected. It is not a PRD. It has no template, no required sections, no boilerplate.

The test: if the engineer would make the right call on their own from the napkin + codebase, don't spec it. Only write down what would go wrong if they guessed.

The best min specs state the tension first:

```
* socket
  * path: ~/.nap/sock (hardcoded for POC)
  * protocol: ndjson (newline-delimited JSON)
    * one JSON object per line
    * each request has a unique id (incrementing integer from CLI)
    * responses echo the id back
  * no auth, no encryption — local socket, single user

* CLI is a separate package/entrypoint
  * not electron code — pure node
  * must work when run via `node cli.js` or as a symlinked binary `nap`
  * no electron dependencies

* nap start
  * command is a string, passed to shell via pty.spawn(shell, ['-c', command])
    * not parsed, not validated — shell handles it
```

If you find yourself writing a section header, you're writing a PRD, not a min spec.
