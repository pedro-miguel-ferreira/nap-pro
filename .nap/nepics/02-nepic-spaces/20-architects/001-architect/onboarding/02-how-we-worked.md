# How We Worked in v1

This describes how the POC was built. Not prescriptive for v2 — context for understanding what worked and what to evolve.

## The Workflow

1. **Napkin** — Human and architect brainstorm together. Output: a compressed `.nap.md` file.
2. **Spec** — Architect writes a min spec. Not a PRD — just the constraints the implementer can't derive on their own. Why and what, never how.
//Do you have good examples of min specs? I saw some time they just look like napkins, but I think that's not what is meant. They should be concise directed with some bit of prose that provides a context, maybe some wise and kind of in that spirit of
3. **Journeys** — Concrete sequences: "user does X, system does Y." Developer journeys for a dev tool.
4. **Test architecture** — Test architect agent designs strategic test cases. Focuses on seams between subsystems, not unit test busywork. Google Testing Book philosophy.
5. **Implementation** — Fullstack engineer agent reads spec + test cases, writes code shaped so tests are possible.
6. **Tests** — Test engineer agent implements the test cases, runs them, reports failures.
7. **Iterate** — Failures route back to fullstack eng. Loop until green.
8. **Review** — Human reviews. Architect commits.

## How Agents Were Launched

Each agent gets a directory: `agents/001-role-subject/prompt.md`. The architect writes the prompt — role, context, task, where to write output. The agent is launched via:
//This feels too abstract. Having an example would make a big difference

```bash
nap start 'claude --verbose "read <path>/prompt.md and write your response to <path>/response.md"' --name 001-role-subject
```
//Again this is too abstract. Just having an example from past workflows makes much more sense. With or maybe keep it template but then give an example

The architect waits with `nap nap <name>` and reads `response.md` when done.
//And this feels too detailed. I think we need a broader understanding of the logic of the workflow, and then separately specific commands. I think we should both explain how that works manually and how NAP CLI helped with it

## Agent Prompt Voice

Early on we wrote formal, documentary prompts with sections like "## Mandatory Reading" and "## Your Role." This caused agents to delegate their reading to subagents instead of actually reading the files. The fix: write like you're talking to a teammate, not writing a document.

Good: "You're a fullstack engineer on the NAP project. Read your role in X before you start. Your task: build Y. Read the spec and test cases in Z."

Bad: "## Your role\nRead your role definition first.\n**Read this file:** X\n## Mandatory reading\n1. ...\n2. ..."

The difference matters — agents treat formal structure as reference material to be summarized, not instructions to follow.

## Roles

Four roles, defined in `.nap/00-org/40-roles/`:

- **Architect** — the orchestrator. Not an agent. Runs in main conversation with human.
- **Test Architect** — agent. Designs test cases. Focuses on integration seams.
- **Fullstack Engineer** — agent. Writes code.
- **Test Engineer** — agent. Writes and runs tests.
//I'm missing the logic of workflow here. What do these roles do?
//I'm not sure if it should be explained here or in another doc or in another chapter but this doesn't come through at all
//Maybe I'm also specifically missing only Ys for these roles. Why do we have Test Architect? Why wouldn't a Test Engineer write tests as they see fit?
//Why we have separate full stack engineer and test engineer?
//Why it's the order that full stack goes first and test engineer second? Versus Test Engineer in TDD style developing tests and then for Stack Engineer implementing the code
//What exactly how these roles are connected in a bigger workflow?

## Testing Strategy

- **Small tests** (Vitest) — pure logic, no Electron. Store actions, parsers, pure functions.
- **Medium tests** (Playwright + Electron) — real app driven programmatically via `page.evaluate()` and `app.evaluate()`. No UI automation — call store actions, read xterm buffers directly.
- **Big tests** — full end-to-end CLI sequences.

This works because Playwright's Electron support gives access to both the renderer (real xterm, real WebGL, real DOM) and main process (real pty, real IPC). Tests verify behavior through code, not clicks.

## `nap done`

Agents should call `nap done` in their terminal when they finish their work. This signals completion so `nap nap` unblocks. The agent needs to be told to do this in its prompt — it won't do it automatically. This was a recurring issue in v1.
//And without a bigger understanding of what the development workflow is, this doesn't quite make sense

## What Worked Well

- The napkin → spec → test arch → fs eng → test eng pipeline is solid
//Do you describe with that pipeline anywhere?
- Agents finding real bugs through integration tests (pty shutdown race, socket cleanup, status overwrite)
- Using NAP to build NAP — we bootstrapped into eating our own dog food mid-POC
- Min specs over detailed specs — agents make better decisions with autonomy
- The testing strategy (Playwright + page.evaluate) gives integration coverage without UI test fragility

## What Didn't Work Well

- Scroll lock was a rabbit hole — xterm.js internals are tricky, the fix is partial
- Agents sometimes forget to call `nap done`
- Agent prompts need the right tone — too formal and agents delegate reading to subagents
- No persistence — closing the app loses all session state
- Flat sidebar doesn't scale past ~10 agents — need feature-level organization
