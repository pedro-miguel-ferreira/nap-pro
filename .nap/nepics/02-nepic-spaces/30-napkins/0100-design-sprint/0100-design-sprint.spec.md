## Why

We're about to rebuild the entire UI — from a flat sidebar to a three-column layout with a napkin browser. Every implementation milestone depends on getting this right. The cheapest way to validate: standalone HTML mocks you can open in a browser and click around.

## What

Three HTML files, each a self-contained layout variant. No build step, no dependencies. Open in browser, see the layout, click around.

### Variant A: tree view + terminal

Three columns. Left gutter with nepic icons. Middle column with napkin browser (tree view). Right panel with mock terminal output.

- Gutter: 3 mock nepics ("P", "S", "+"), active one highlighted
- Tree: architect at top (green dot, "running"), then 4-5 napkins
  - 0100-design-sprint: expanded, 3 agents (one running, one done, one exited)
  - 0200-sqlite-persistence: collapsed, status badge "todo"
  - 0300-napkin-browser: collapsed, status badge "backlog"
  - 0400-session-continuity: collapsed, status badge "draft"
- Clicking an agent in the tree should visually highlight it and change the terminal header
- Napkins are collapsible (click to expand/collapse)
- Cmd+K filter bar at top of middle column (visual only, doesn't need to actually filter)
- Terminal: dark background, monospace, realistic-looking claude output

### Variant B: board view + terminal

Same gutter and terminal. Middle column shows kanban board instead of tree.

- Columns: draft, backlog, todo, doing, review, done
- Compact cards with feature name + agent progress
- Same napkin data as variant A, just different view

### Variant C: board view full width

Board takes over the full width — no terminal visible. This answers: should the board be a companion view or a full-screen dashboard?

## Constraints

- Standalone HTML + CSS + minimal JS. No React, no build tools.
- Must look real — use the actual color scheme (#1e1e1e, #252526, #3c3c3c, status dot colors)
- Monospace font (Menlo, Monaco, monospace)
- Interactive: hover states, collapsible tree nodes, clickable agents
- Each variant is one HTML file — self-contained, no shared assets
- Window size: assume 1440x900 minimum

## What we're deciding

After reviewing these three files, we pick:
1. Tree view layout — does the middle column work at 300px? Does the gutter feel right?
2. Board view — companion (B) or takeover (C)?
3. Any spatial issues — too cramped? too much wasted space? wrong proportions?
