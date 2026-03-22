You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: build three standalone HTML mock files for the v2 UI design sprint.

Read the napkin and spec:
- `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/0100-design-sprint.nap.md`
- `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/0100-design-sprint.spec.md`

Look at the v1 screenshot and v2 wireframe for visual reference:
- `.nap/nepics/02-nepic-spaces/20-architects/001-architect/onboarding/ui-mock/ui-v1-screenshot.png`
- `.nap/nepics/02-nepic-spaces/20-architects/001-architect/onboarding/ui-mock/ui-v2-wireframe-mock.png`

Read the v1 source for the actual design language in use — colors, fonts, spacing:
- `src/renderer/components/Sidebar.tsx`
- `src/renderer/components/Terminal.tsx`
- `src/renderer/index.tsx`

Output three HTML files to `design-sprint/` in the project root:
- `variant-a-tree.html` — three-column layout with tree view + terminal
- `variant-b-board-companion.html` — board view in middle column + terminal
- `variant-c-board-full.html` — board view taking full width, no terminal

Each file must be fully self-contained (inline CSS + JS), openable in a browser with no build step. Make them interactive — collapsible tree nodes, hover states, clickable agents that change the terminal header. Use the real color scheme from v1. Make them look like a real app, not a wireframe.

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/001-fs-eng-design-sprint/response.md`, then run `nap done` in your terminal. The architect is blocked waiting — without this, the pipeline stalls.
