You're a fullstack engineer building an HTML mock for NAP's v2 UI. This is the final stress test — 30 napkins, 2 architects, ~15 agents. One self-contained HTML file, no dependencies.

Save the file to: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-final.html`

## Context

Read these files first to understand what you're building and why:

1. `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/response.md` — the UX design review findings
2. `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-busy-project.html` — the previous mock (12 napkins). You are scaling this to 30. Study it carefully — match the exact CSS, HTML patterns, and JS behavior. This is your primary reference.

The v2-busy-project.html mock IS the spec. Your job is to scale it up with the data below, not redesign anything.

## What to Build

Same layout as v2-busy-project.html but with:
- 2 architects (001-architect done, 002-nova acting/running) at the top of the sidebar
- 30 napkins distributed across kanban columns
- ~15 agents with terminal content
- Everything wired up — kanban navigation, card states, terminal switching, breadcrumbs

## The Two Architects

At the top of the sidebar, before the separator:

```
* 002-nova ●                        acting
  * onboarding/
  * scratch/
  * prompt.md
* 001-architect ●                   done
  * onboarding/
  * scratch/
```

002-nova is focused by default. Both have terminal content.

**002-nova terminal** — shows a busy `nap ps` listing all ~15 agents, orchestration output. She's managing 5 features in DOING, reviewing 3 in REVIEW, etc.

**001-architect terminal** — shows historical output from early project days. Setting up the project, launching first agents for 0010-0050. Ends with creating the onboarding package for Nova and calling `nap done`.

## 30 Napkins

### DONE (5) — agents exited, work complete
- 0010-project-bootstrap
  * napkin: electron + vite + react scaffold; monorepo structure; dev tooling
- 0020-pty-terminal
  * napkin: xterm.js + node-pty; resize handling; scrollback buffer
- 0030-socket-server
  * napkin: unix socket IPC over ndjson; stale socket detection; multi-instance guard
- 0040-cli-commands
  * napkin: nap start/ps/peek/kill/close; NAP_SESSION_ID propagation; fuzzy name matching
- 0050-basic-sidebar
  * napkin: flat terminal list; status dots; click to switch; drag to reorder

Each has 1 exited agent dot in collapsed view. Focused view shows artifacts + one exited agent dir.

### REVIEW (3) — agents done, human reviewing
- 0100-design-sprint (3 agents: TA-100 done, FS-100 running, TE-100 napping)
  * napkin: three-column layout; cards as napkin bullets; kanban quake console; breadcrumb nav
- 0110-session-continuity (2 agents: FS-110 done, TE-110 done)
  * napkin: architect resume after restart; agent session recovery from JSONL; re-attach terminals
- 0120-scroll-lock (1 agent: FS-120 done)
  * napkin: follow mode vs read mode; dim blue border (follow), amber (read); auto-switch on scroll

### DOING (5) — agents actively working
- 0200-sqlite-persistence (2 agents: FS-200 running, TE-200 running)
  * napkin: better-sqlite3 for state; fs = content, db = status; survive restart; board symlink sync
- 0210-napkin-browser (2 agents: TA-210 done, FS-210 running)
  * napkin: tree view organized by features; card states collapsed/focused/extended; agent-as-directory
- 0220-kanban-overlay (1 agent: FS-220 running)
  * napkin: quake console (Cmd+`); expand cards to see napkin bullets; -> to navigate to main view
- 0230-agent-comms-v2 (2 agents: FS-230 running, TE-230 napping)
  * napkin: poke/nap/done protocol v2; cross-agent file coordination; response.md as handoff
- 0240-breadcrumb-nav (1 agent: FS-240 running)
  * napkin: S > napkin > agent path; click segments to navigate; spatial context in terminal header

### TODO (7) — napkin exists, no agents yet
- 0300-history-renderer: full conversation from JSONL; render tool calls/thinking/responses; searchable
- 0310-cmd-k-filter: fuzzy filter napkins + agents; keyboard-driven; highlight matches in tree
- 0320-plugin-system: custom agent roles via config; role = prompt + constraints; share across projects
- 0330-nepic-switcher: gutter icons for nepics; + creates new era; architect succession flow
- 0340-agent-diff-view: scoped git diff per agent; [diff] virtual entry; what did this agent change?
- 0350-keyboard-shortcuts: vim-style nav in sidebar; j/k to move; enter to focus; esc to collapse
- 0360-status-bar: bottom bar with project stats; agent count by status; current nepic; token usage

### BACKLOG (10) — just ideas, no napkin content yet
- 0400-multi-workspace
- 0410-cloud-sync
- 0420-onboarding-flow
- 0430-theme-customization
- 0440-split-terminal
- 0450-agent-templates
- 0460-napkin-versioning
- 0470-review-gates
- 0480-performance-monitoring
- 0490-mobile-companion

For backlog items, show "empty — napkin not started" in focused view. Still include them in kanban with 1-2 brief napkin bullets each (imagine what they WOULD say).

## Agents and Terminal Content

Create terminal content for these agents. Each should be 15-25 lines with realistic Claude Code output (tool calls, edits, test results) relevant to what they're working on:

| Agent | Napkin | Status | Feature |
|-------|--------|--------|---------|
| 002-nova | (architect) | running | Orchestrating everything |
| 001-architect | (architect) | done | Historical, early project |
| TA-100 | 0100 | done | Test architecture for design sprint |
| FS-100 | 0100 | running | Implementing UI components |
| TE-100 | 0100 | napping | Waiting for FS-100 |
| FS-110 | 0110 | done | Session persistence |
| TE-110 | 0110 | done | All session tests passing |
| FS-120 | 0120 | done | Scroll lock implementation |
| FS-200 | 0200 | running | SQLite database layer |
| TE-200 | 0200 | running | Persistence tests |
| TA-210 | 0210 | done | Test architecture for napkin browser |
| FS-210 | 0210 | running | Building tree component |
| FS-220 | 0220 | running | Kanban overlay implementation |
| FS-230 | 0230 | running | Agent communication protocol |
| TE-230 | 0230 | napping | Waiting for FS-230 |
| FS-240 | 0240 | running | Breadcrumb navigation |

For DONE napkins (0010-0050), DON'T create terminal content. Just show exited dots.

## Critical Behaviors

1. **Kanban → sidebar navigation**: Click `→` on kanban card → kanban slides up (0.25s) → 200ms delay → sidebar card focuses + scrolls into view + blue flash (1s fade) → terminal switches to best agent (running > napping > done)

2. **Cards without agents**: Focus the card but keep architect terminal

3. **DOING kanban cards start expanded** (class="expanded") so napkin bullets are visible immediately

4. **Each kanban column shows count**: `DOING (5)`, `BACKLOG (10)`, etc.

5. **Breadcrumb**: `S > napkin-name > agent-id`. Click S → architect. Click napkin → focus that card.

6. **002-nova terminal is the default view on load**

## Important

- The file WILL be large. That's expected. Make it complete.
- Match the CSS and JS patterns from v2-busy-project.html exactly.
- Every napkin must appear in BOTH the sidebar AND the kanban.
- Every agent with terminal content must be clickable and switch the terminal.
- Test it mentally: Can I open kanban, click → on a BACKLOG item, and land on it in the sidebar? Can I click between architects? Can I Cmd+E on a DOING napkin and see [terminal] [history] [diff] entries?

When done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/005-fs-eng-final-mock/response.md`, then run `nap done` in your terminal.

CRITICAL: you MUST call `nap done` when finished. The architect is waiting.
