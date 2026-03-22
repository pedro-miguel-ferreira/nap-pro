## Why

The flat sidebar doesn't show project structure. The three-column layout is the core v2 UI shift — from terminal names to napkin bullets with nested agents.

## What

Replace Sidebar.tsx with a three-column layout: Gutter + NapkinBrowser + Terminal. Hardcoded mock data. Match the design sprint mocks exactly.

## Constraints

* Must match `v2-final.html` from design sprint — same colors, spacing, interactions
* Gutter: 60px fixed, dark background, vertical icon stack
* NapkinBrowser: ~300px, collapsible (Cmd+B still works)
* Terminal: fills remaining space, unchanged behavior
* Three card states:
  * Collapsed: `* name ●● status` — one line
  * Focused: click to expand — artifacts as `*`, agents as dirs with dots
  * Extended: Cmd+E — full filesystem snapshot, file controls on hover (⎘, ↗)
* Architect pinned at top, separated from napkins
* Breadcrumb in terminal header: `S > napkin-name > agent-name`
* Click agent → switch terminal (existing DOM reparent mechanism)
* Click artifact → shell.openPath (existing mechanism)
* Cmd+K filter in browser
* Mock data: 5-8 napkins, 2-3 agents each, various statuses
* All existing terminal features preserved — scroll lock, file links, resize
* All existing tests must pass

## What to read

**Design reference (read in this order):**
1. Screenshots first — clean picture of what the UI should look like: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/01.png` through `04.png`
2. Voiceover — mandatory, has designer commentary explaining each screenshot: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/voiceover.nap.md`
3. HTML mocks — reference for exact colors, spacing, CSS values: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-final.html`

**Code:**
* `src/renderer/components/Sidebar.tsx` — what you're replacing
* `src/renderer/components/Terminal.tsx` — add breadcrumb header
* `src/renderer/store.ts` — extend with browser state
* `src/renderer/index.tsx` — layout container
