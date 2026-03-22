You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: build two more standalone HTML mock files for the v2 UI design sprint.

Variant A (tree view + terminal) is already done. Read it for reference — match its style and quality exactly:
- `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/variant-a-tree.html`

Read the spec for what variants B and C should contain:
- `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/0100-design-sprint.spec.md`

Look at the v1 screenshot and v2 wireframe for visual reference:
- `.nap/nepics/02-nepic-spaces/20-architects/001-architect/onboarding/ui-mock/ui-v1-screenshot.png`
- `.nap/nepics/02-nepic-spaces/20-architects/001-architect/onboarding/ui-mock/ui-v2-wireframe-mock.png`

Output two HTML files to `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/`:
- `variant-b-board-companion.html` — board view in middle column + terminal on right
- `variant-c-board-full.html` — board view taking full width, no terminal

Each file must be fully self-contained (inline CSS + JS), openable in a browser with no build step. Match the design language from variant A exactly. Make them interactive — hover states, clickable cards. Use the same mock data (same napkin features, same statuses).

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/002-fs-eng-design-sprint-bc/response.md`, then run `nap done` in your terminal. The architect is blocked waiting — without this, the pipeline stalls.
