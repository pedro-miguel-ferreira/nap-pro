# nap-pro

Multi-agent orchestrator for Claude Code. A richer app on top of NAP:
hierarchical agent tree, pause/resume, live diffs, activity stream, per-napkin
git worktrees, role + workflow editors, per-agent model selection, a command
palette, agent-to-agent Q&A, an optional permission guardian, and end-of-flow
cost panels.

## Quick start

```bash
git clone git@github.com:pedro-miguel-ferreira/nap-pro.git ~/src/nap-pro
cd ~/src/nap-pro
npm install
npm run build
npm run build:cli
npm link            # exposes `nap-pro` on $PATH

# Bootstrap a project
mkdir ~/my-project && cd ~/my-project
git init && git commit --allow-empty -m init
nap-pro init --template raft-viz   # or: --list-templates / no template
nap-pro open                       # launches the app (walks up to find .nap/)

# Or with hot-reload for development
cd ~/src/nap-pro && NAP_CWD=~/my-project npm run dev
```

## What it does

You and an AI architect brainstorm ideas into **napkins** — compressed bullet
docs. Agents unfold each napkin into specs, tests, and code. Every agent is a
full Claude Code session in its own terminal. You can watch any agent think,
pause it mid-thought without losing tokens, see what files it changed, follow
its event timeline, ask one agent to consult another, gate dangerous tool calls
through a guardian, and run a multi-stage workflow that wires several agents
together — each potentially on a different model — across an isolated git
worktree.

## Features

### Agent tree
Agents live in a hierarchical tree by `parentId`. When agent X spawns agent Y
(via `nap-pro create agent` from inside X's terminal — `NAP_SESSION_ID` is
auto-detected), Y nests under X with a chevron and a child count. Click the
chevron to collapse. State persists in `ui-state.json`.

### Command palette (Cmd+P)
Fuzzy-search across agents, napkins, and actions (Roles editor, Workflows
editor, Runs dashboard, etc.) and jump straight to them. Arrow keys to move,
Enter to select, Esc to dismiss.

### Sidebar toolbar
Four buttons at the top of the sidebar:
- **Roles** — list / create / edit / delete role `.md` files under
  `.nap/00-org/40-roles/`.
- **Workflows** — define and edit multi-stage pipelines (saved as JSON under
  `.nap/workflows/`).
- **From spec** — run a workflow from an existing spec doc: creates a new napkin
  and lets a scope agent populate it.
- **Dashboard** — the workflow run dashboard (live per-run, per-stage state).

### Agent right-click menu
Right-click any agent in the tree:

| Item | What it does |
|------|--------------|
| **Peek** (⏎) | Focus this agent's terminal |
| **Start** | Spawn a dormant agent (created but never started — e.g. the post-init architect or un-launched workflow stubs) |
| **Pause** / **Resume** | `SIGSTOP` / `SIGCONT` — lossless freeze, no tokens spent while paused |
| **Stop** | Kill the agent |
| **Replay with…** | Re-run this agent's prompt under a different model/role (not available for architects or never-started agents) |
| **Activity** | This agent's event timeline |
| **Files** | Live diff panel for this agent |
| **Timeline** | Timeline panel |
| **Global activity** | Rolled-up subtree timeline (parents only) |
| **Reveal in Finder** | Open the agent's home dir in Finder |
| **View response.md** | Open the agent's `response.md` (once started) |
| **Cost** | Token + USD for this agent |
| **Total cost** | Rolled-up subtree cost (parents only) |
| **Open dir** | Open the agent's home dir |
| **Copy session ID** | Copy the agent's CC session id |

### Napkin right-click menu
Right-click any napkin card:

| Item | What it does |
|------|--------------|
| **Run workflow…** | Pick a workflow to run on this napkin |
| **Add stage…** | Append a stage to the napkin's flow |
| **Re-run "<name>" (docs changed)** | Appears only when reference docs changed since the last run — re-runs that workflow |
| **Create worktree** | Create the per-napkin git worktree (shows "Worktree exists" once present) |
| **Open worktree** / **Copy worktree path** | Open / copy the worktree path (when one exists) |
| **Reveal napkin files** | Open the napkin's dir |
| **View napkin / spec / stories** | Open `<slug>.nap.md` / `.spec.md` / `.stories.md` |
| **Remove worktree** | Destructive — deletes the working tree; the `nap-pro/<slug>` branch is preserved. Offers a force option if the tree is dirty |

### Live diff
Per-agent baseline SHA captured at first start. The Files panel shows everything
changed since baseline + working-tree dirty state, color-coded by status
(A/M/D/R/?). Double-click any file → diff viewer with classic +/− coloring.
Worktree-aware: with a per-napkin worktree, the diff is scoped to that worktree.

### Activity stream
Per-agent event log: started, paused, resumed, exited, archived, done,
permission-requested, permission-allowed, permission-denied. Right-click an
agent → **Activity** for its own stream; right-click a parent → **Global
activity** for the rolled-up subtree timeline. Live updates via IPC; auto-scroll
toggle, type-filter chips with running counts. Persisted to NDJSON in each
agent's home dir.

### Per-napkin git worktree
Each napkin can opt into its own worktree at `<project>-worktrees/<slug>` on
branch `nap-pro/<slug>`. All agents in that napkin spawn with the worktree as
their cwd, so their work is isolated and concurrent napkin flows don't collide.
Right-click a napkin → **Create worktree** (or use the workflow runner's
auto-create on launch).

### Workflows
Define multi-stage pipelines in the **Workflows** editor: each stage has a name,
role, **per-stage model dropdown** (Opus 4.7 / Sonnet 4.6 / Haiku 4.5 / default),
prompt source (template / custom / architect-decides), and an optional parallel
group. Run one via a napkin's **Run workflow…**: the runner auto-creates the
worktree (if enabled), spawns each stage's agent under the architect, awaits
`nap-pro done`, then advances. Parallel groups spawn concurrently. The
**Dashboard** shows live per-stage state across runs.

### Cost panel
At the end of every workflow, a panel auto-opens with per-stage tokens (input
/ output / cache write / cache read), per-model attribution, USD cost, message
count, and duration. Or right-click any agent → **Cost** for ad-hoc inspection.
Reads CC's session log at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`.

## How agents talk to each other (and to you)

Agents drive each other through the CLI over the project's Unix socket. From
inside any agent's terminal, `NAP_SESSION_ID` is auto-detected, so an agent
refers to others by name.

### Poke — send input to a terminal
```
nap-pro poke <name> <message> [--esc]
```
Types `<message>` into the target agent's terminal (as if you'd typed it).
`--esc` sends an Escape first (e.g. to interrupt a prompt the agent is composing).
Fire-and-forget — it does not wait for a reply.

### Ask — structured agent-to-agent Q&A
```
nap-pro ask <name> <question> [--wait <secs>]
```
Records a consultation under the napkin's `consultations/` dir as a pair of
files — `<ts>-<from>-to-<to>.q.md` (question) and `…​.a.md` (answer) — and
enqueues a message into the target's terminal pointing at both paths. The target
reads the question, writes its answer to the `.a.md` file, then keeps idling.

The asker blocks until the answer file is written (default `--wait 300`s; pass
`--wait 0` to return immediately and poll the `.a.md` yourself). On timeout it
exits non-zero but leaves the question file in place, so the target can still
answer later.

### Key — raw keypress
```
nap-pro key <name> <key>            # named key, e.g. enter, esc, up
nap-pro key <name> --seq <sequence> # raw escape sequence
```
For driving a TUI prompt that needs a specific keystroke rather than text.

### Wait / inspect
```
nap-pro nap <name> [--timeout <s>]  # block until the agent is done/exited
nap-pro peek <name>                 # focus its terminal in the UI
nap-pro log <name> [--tail <n>]     # dump its terminal scrollback
nap-pro done                        # the current agent marks itself done
```

### Permission guardian (optional)
Initialize with `nap-pro init --guardian` (or `nap-pro setup --guardian`) to
register a Claude Code `PermissionRequest` hook plus a guardian agent. When a
gated tool call fires, the hook routes it through:
```
nap-pro hook permission-request         # CC hook handler (wired automatically)
nap-pro permission-response --list      # show pending requests
nap-pro permission-response --agent <id> --decision allow
nap-pro permission-response --agent <id> --decision deny --message "why" [--interrupt]
```
`allow` lets the call through; `deny` blocks it and (with `--message`) tells the
agent why; `--interrupt` additionally stops the agent (requires `--message`).
Requests and their outcomes show up in the activity stream as
`permission-requested` / `-allowed` / `-denied`.

## CLI reference

```
nap-pro init [--template <name>] [--list-templates] [--guardian] [--add-skills]
nap-pro setup --guardian | --skills | --import   Add capabilities to a project
nap-pro open                                     Launch the app
nap-pro dev                                      Launch with hot-reload
nap-pro doctor                                   Diagnose project health

nap-pro create napkin <slug>
nap-pro create agent <name> --napkin <s> --role <r> [--model <id>]
nap-pro create architect <name> [--model <id>] [--parent <id>]
nap-pro create nepic <slug> --name <name>

nap-pro start <name> [prompt]                    Start a pre-created agent
nap-pro ps [--json]                              List agents (tree)
nap-pro set-status <slug> <phase>                Set napkin phase
nap-pro status [--napkin|--agent|--nepic]        Inspect any entity
nap-pro done                                     Mark current session done
nap-pro nap <name> [--timeout <s>]               Wait for an agent to complete

nap-pro poke <name> <message> [--esc]            Send input to a terminal
nap-pro ask <name> <question> [--wait <s>]       Agent-to-agent Q&A (consultations/)
nap-pro key <name> <key> [--seq <seq>]           Send raw keypress
nap-pro peek <name>                              Focus terminal in UI
nap-pro log <name> [--tail <n>]                  Dump terminal scrollback
nap-pro pause | resume | stop <name>             Lifecycle control

nap-pro worktree create <slug>
nap-pro worktree remove <slug> [--force]
nap-pro worktree list
nap-pro worktree path <slug>

nap-pro import-agents <nepic-dir>                Import existing agent dirs as archived
nap-pro hook permission-request                  CC PermissionRequest hook handler
nap-pro permission-response [--list] --agent <id> --decision allow|deny [--message <m>] [--interrupt]
```

## Project structure

```
.nap/
  00-org/                     Workflow, roles, structure
    40-roles/                 Role .md files (edit via UI)
  workflows/                  Workflow JSON definitions
  nepics/
    01-v1/
      10-docs/                Mega napkin, milestones
      20-architects/          Architect + guardian agents
      30-napkins/             Feature napkins with agents
        0100-feature/
          .napkin.nap.json    Marker (status, worktree_path)
          <slug>.nap.md        Napkin / .spec.md / .stories.md
          consultations/      ask Q&A files (<ts>-<from>-to-<to>.q.md / .a.md)
          agents/
            001-test-arch/
              .agent.nap.json Marker (parent, model, baseline)
              prompt.md
              response.md
              activity.ndjson Per-agent event log
  ui-state.json
  sock                        Runtime socket (gitignored)
```

## Key concepts

- **Napkin** — a compressed bullet doc. One feature, load-bearing bullets.
- **Nepic** — a version/era. Each nepic has its own architect, napkins, agents.
- **Agent** — a full Claude Code session. Marker file `.agent.nap.json` carries identity, lifecycle flags, parent id, baseline SHA, and model.
- **Workflow** — a JSON definition of stages (role, model, prompt source, parallel group).
- **Worktree** — per-napkin git checkout at `<project>-worktrees/<slug>`. Branch `nap-pro/<slug>`.
- **Consultation** — an `ask` Q&A exchange persisted as `.q.md` / `.a.md` files under the napkin.
- **Marker files** — source of truth, no database.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Cmd+B | Toggle sidebar |
| Cmd+K | Filter napkins |
| Cmd+E | Toggle focused/extended view |
| Cmd+D | Toggle debug panel |
| Cmd+P | Command palette |
| Cmd+G | Toggle terminal follow mode |
| Cmd+\` | Toggle kanban overlay |
| Esc | Close any open panel/modal |

## Development

```bash
npm run dev          # electron-vite dev with HMR
npm run test:small   # vitest (fast, no Electron)
npm run test:medium  # playwright (real Electron)
npm run typecheck    # tsc --noEmit
npm run build        # production build
npm run build:cli    # CLI build
```

## Architecture

- **Electron + electron-vite** — main process orchestrates state, renderer is React.
- **PTY** — `node-pty` per agent. Pause/resume via `process.kill(-pgid, 'SIGSTOP'/'SIGCONT')`. POSIX-only.
- **State model** — a single `NapModel` owns napkins/agents. `model.onChange` listeners drive snapshot pushes to the renderer, lifecycle event emission, baseline capture, and workflow runner orchestration. Marker files on disk are the persistence layer.
- **Socket** — Unix socket at `<project>/.nap/sock` for CLI ↔ app communication. Every `nap-pro` command (create / start / poke / ask / permission-response / …) rides this protocol.
- **Cost** — read-only over CC's `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`.
- **Worktrees** — `git worktree add/remove/list --porcelain` via `execFile`.

## Relationship to upstream NAP

`nap-pro` is a fork of [NAP](https://github.com/diunko/nap), kept as the
`upstream` remote. Notable additions over upstream:

| | NAP | nap-pro |
|---|---|---|
| Agent layout | Flat list under each napkin | Hierarchical tree, collapsible |
| Right-click | Not surfaced | Full agent + napkin context menus |
| Pause | Stop and restart | SIGSTOP / SIGCONT — no token loss |
| File changes | None | Live diff panel, per-agent baseline, double-click → diff |
| Activity | Sidebar terminals only | Structured event stream, persisted, subtree rollup |
| Worktrees | No | Per-napkin, opt-in (auto on workflow run) |
| Roles | Edit `.md` files manually | UI editor with create / edit / delete |
| Workflows | Each stage launched manually | UI-defined pipelines, sequential + parallel, runner auto-spawns each stage, run dashboard |
| Per-agent model | One model project-wide | Dropdown per workflow stage; Replay-with override |
| Agent comms | poke only | poke + structured `ask` Q&A (consultations) |
| Permissions | None | Optional guardian + PermissionRequest hook |
| Navigation | Sidebar only | Cmd+P command palette |
| Cost | Manual | Auto-opens at end of workflow + on-demand panel |
```
