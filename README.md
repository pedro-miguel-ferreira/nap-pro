# nap-pro

Multi-agent orchestrator for Claude Code. Fork of [NAP](https://github.com/…/nap)
with a richer app: hierarchical agent tree, pause/resume, live diffs, activity
stream, per-napkin git worktrees, role + workflow editors, per-agent model
selection, and end-of-flow cost panels.

## Quick start

```bash
git clone <repo> ~/src/nap-pro && cd ~/src/nap-pro
npm install
npm run build
npm run build:cli
npm link            # exposes `nap-pro` on $PATH

# Bootstrap a project
mkdir ~/my-project && cd ~/my-project
git init && git commit --allow-empty -m init
nap-pro init --template raft-viz   # or: --list-templates
nap-pro open                       # launches the app

# Or with hot-reload for development
cd ~/src/nap-pro && NAP_CWD=~/my-project npm run dev
```

## What it does

You and an AI architect brainstorm ideas into napkins — compressed bullet docs.
Agents unfold each napkin into specs, tests, and code. Every agent is a full
Claude Code session in its own terminal. You can watch any agent think, pause
it mid-thought without losing tokens, see what files it changed, follow its
event timeline, and run a multi-stage workflow that wires several agents
together — each potentially on a different model — across an isolated git
worktree.

## Features

### Agent tree
Agents live in a hierarchical tree by `parentId`. When agent X spawns agent Y
(via `nap-pro create agent` from inside X's terminal — `NAP_SESSION_ID` is
auto-detected), Y nests under X with a chevron and a child count. Click the
chevron to collapse. State persists in `ui-state.json`.

### Right-click context menu
Right-click any agent for: **Peek** (focus terminal), **Pause** / **Resume**
(SIGSTOP / SIGCONT — lossless freeze; no tokens spent while paused),
**Stop**, **Activity** (event timeline for this agent), **Files** (live diff
panel), **Cost** (token + USD), **Open dir**, **Copy session ID**. Parent-only
items: **Global activity** and **Total cost** (rolled up across the subtree).

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

### Role + Workflow editors
- **Roles** button (top of sidebar) — list/create/edit/delete role `.md` files
  under `.nap/00-org/40-roles/`.
- **Workflows** button — define multi-stage pipelines: each stage has a name,
  role, **per-stage model dropdown** (Opus 4.7 / Sonnet 4.6 / Haiku 4.5 / default),
  prompt source (template / custom / architect-decides), and optional parallel
  group. Saved as JSON under `.nap/workflows/`.
- **Run a workflow** — right-click a napkin → **Run workflow…** → pick from the
  list. The runner auto-creates the worktree (if enabled), spawns each stage's
  agent under the architect, awaits `nap-pro done`, then advances. Parallel
  groups spawn concurrently.

### Cost panel
At the end of every workflow, a panel auto-opens with per-stage tokens (input
/ output / cache write / cache read), per-model attribution, USD cost, message
count, and duration. Or right-click any agent → **Cost** for ad-hoc inspection.
Reads CC's session log at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`.

## CLI

```
nap-pro init [--template <name>] [--guardian]   Create a new project
nap-pro open                                    Launch the app
nap-pro dev                                     Launch with hot-reload
nap-pro setup --guardian|--skills|--import      Add capabilities

nap-pro create napkin <slug>                                  Create a napkin
nap-pro create agent <name> --napkin <s> --role <r> [--model <id>]
nap-pro create architect <name> [--model <id>] [--parent <id>]
nap-pro create nepic <slug> --name <name>

nap-pro start <name> [prompt]                   Start a pre-created agent
nap-pro pause <name>                            SIGSTOP an agent's pty
nap-pro resume <name>                           SIGCONT a paused agent
nap-pro stop <name>                             Kill an agent
nap-pro ps                                      List agents (tree)
nap-pro set-status <slug> <phase>               Set napkin phase
nap-pro status [--napkin|--agent|--nepic]       Inspect any entity
nap-pro done                                    Mark current session done
nap-pro nap <name>                              Wait for agent to complete
nap-pro poke <name> <message>                   Send input to agent terminal
nap-pro key <name> <key>                        Send raw keypress
nap-pro peek <name>                             Focus terminal in UI
nap-pro log <name>                              Dump terminal scrollback

nap-pro worktree create <slug>                  Create per-napkin worktree
nap-pro worktree remove <slug> [--force]        Remove worktree
nap-pro worktree list                           List managed worktrees
nap-pro worktree path <slug>                    Print the worktree path

nap-pro doctor                                  Diagnose project health
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
- **Marker files** — source of truth, no database.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Cmd+B | Toggle sidebar |
| Cmd+K | Filter napkins |
| Cmd+E | Toggle focused/extended view |
| Cmd+D | Toggle debug panel |
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
- **PTY** — `node-pty` per agent. Pause/resume via `process.kill(-pgid, 'SIGSTOP'/'SIGCONT')`. Cross-platform note: POSIX-only.
- **State model** — a single `NapModel` owns napkins/agents. `model.onChange` listeners drive snapshot pushes to the renderer, lifecycle event emission, baseline capture, and workflow runner orchestration. Marker files on disk are the persistence layer.
- **Socket** — Unix socket at `<project>/.nap/sock` for CLI ↔ app communication. Same protocol the existing `nap-pro create/start/pause/...` commands ride on.
- **Cost** — read-only over CC's `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`.
- **Worktrees** — `git worktree add/remove/list --porcelain` via `execFile`.

## Differences from upstream NAP

| | NAP | nap-pro |
|---|---|---|
| Agent layout | Flat list under each napkin | Hierarchical tree, collapsible |
| Right-click | Not surfaced | Full context menu (peek/pause/stop/activity/files/cost/open-dir/copy-id) |
| Pause | Stop and restart | SIGSTOP / SIGCONT — no token loss |
| File changes | None | Live diff panel, per-agent baseline, color-coded statuses, double-click → diff |
| Activity | Sidebar terminals only | Structured event stream, persisted, subtree rollup |
| Worktrees | No | Per-napkin, opt-in (auto on workflow run) |
| Roles | Edit `.md` files manually | UI editor with create / edit / delete |
| Workflows | Each stage launched manually | UI-defined pipelines, sequential + parallel, runner auto-spawns each stage |
| Per-agent model | One model project-wide | Dropdown per workflow stage |
| Cost | Manual | Auto-opens at end of workflow + on-demand panel |
