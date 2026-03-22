# Response — v2-final.html

## What was built

Self-contained HTML mock at `mocks/v2-final.html` — the 40-napkin stress test.

## Data

* 2 architects: 002-nova (running, default), 001-architect (done)
* 40 napkins across 5 kanban columns:
  * DONE (8): 0010–0080 — foundation (bootstrap, pty, socket, cli, sidebar, lifecycle, parser, watcher)
  * REVIEW (5): 0100–0140 — design sprint, session continuity, scroll lock, git integration, token counter
  * DOING (7): 0200–0260 — sqlite, napkin browser, kanban overlay, agent comms v2, breadcrumb, hot reload, error boundary
  * TODO (10): 0300–0390 — history renderer, cmd-k filter, plugin system, nepic switcher, diff view, keyboard shortcuts, status bar, inline annotations, snapshot restore, log streaming
  * BACKLOG (10): 0400–0490 — multi-workspace, cloud sync, onboarding, themes, split terminal, agent templates, napkin versioning, review gates, perf monitoring, mobile companion
* 20 agents with terminal content (9 running, 2 napping, 9 done)
* 8 exited agents from 001-architect era (DONE napkins, no terminal)

## Napkin bullet depth

All kanban cards have 2-3 levels of nested bullets — rich enough to feel the density. DOING cards start expanded. BACKLOG cards have imagined bullets.

## Behaviors

All wired up from v2-busy-project.html patterns:
* Click sidebar card → focuses, switches to best agent terminal
* Cmd+E → extended view with full directory listing + [terminal] [history] [diff] entries
* Cmd+` → kanban quake console, 5 columns
* → on kanban card → kanban slides up → card focuses + blue flash → terminal switches
* Breadcrumb: S > napkin > agent — clickable segments
* DONE/TODO/BACKLOG napkins fall back to 002-nova terminal
* Running dots pulse
