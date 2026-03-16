# Workflow

## Stages

A feature moves through directories. Moving it IS the status change.

```
10-backlog/   napkin exists, not yet picked up
20-todo/      architect is writing spec + journeys
30-doing/     agents are working
40-done/      shipped, tests green
```

`mv .napkins/10-backlog/0100-feature .napkins/20-todo/` — that's your standup.

## The Happy Path

### 1. Napkin -> Spec (architect, in conversation with human)

Architect reads the napkin. Writes:
- `NNNN-feature.spec.md` — technical spec, decomposed from napkin bullets
- `NNNN-feature.journeys.md` — concrete developer/user journeys ("user does X, system does Y")

### 2. Spec -> Test Architecture (test-architect agent)

Test architect reads spec + journeys. Writes:
- `NNNN-feature.test.md` — strategic test cases focused on integration seams

Launched by architect. Gets its own context window, explores the codebase freely.

### 3. Code (fullstack-eng agent)

Reads spec + test.md. Writes code shaped so the tests are possible — proper APIs, modules, boundaries at the right places.

### 4. Tests (test-eng agent)

Reads test.md + the code. Writes actual test code. Runs it. Reports failures.

### 5. Iterate

Test eng reports failures -> fullstack eng fixes -> test eng re-runs. Loop until green.

## How Agents Communicate

Through files. Not conversation.

```
agents/
  001-fs-eng-electron-shell/
    prompt.md       <- architect writes, agent reads
    response.md     <- agent writes, architect reads
    questions.md    <- agent writes questions, architect answers
```

## Launching an Agent

Open a new terminal tab and run:

```bash
claude --verbose "read <full-path>/prompt.md and write your response to <full-path>/response.md"
```

Interactive session. Full thinking visible in scrollback. `--verbose` shows reasoning.

## The prompt.md Contract

Every prompt.md is self-contained. It includes:
- Role definition (or path to role file)
- Mandatory reading list (exact file paths)
- What to produce
- Where to write output
- What to do when stuck (write to questions.md, stop)

If you handed this prompt to a stranger with access to the repo, they could do the job.

## Questions Flow

Agent is stuck -> writes to `questions.md` -> stops.
Architect reads questions -> updates spec or answers in questions.md -> re-launches agent.

## Failure Flow

Test eng reports failure -> architect decides:
- Code bug? Route to fullstack eng.
- Spec problem? Update spec, re-run from step 3.
- Test wrong? Update test.md, re-run test eng.
