* three-column layout with mock data

* replace flat sidebar with three columns
  * left gutter (~60px): nepic switcher
    * mock icons: P, S, +
  * middle column (~300px): napkin browser
    * architect pinned at top
    * napkin list as `*` bullets
    * three card states: collapsed, focused, extended (Cmd+E)
  * right panel (fills rest): terminal — unchanged

* mock data, no real filesystem or SQLite
  * hardcoded napkins, agents, statuses
  * interactive: click to expand, click agent to switch terminal
  * Cmd+K filter
  * breadcrumb in terminal header

* input: design sprint HTML mocks
  * `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-final.html`
  * screenshots in `agents/003-ux-design-review/screenshots/`
  * match exactly — colors, spacing, typography, interactions

* refactor existing components
  * Sidebar.tsx → Gutter.tsx + NapkinBrowser.tsx
  * Terminal.tsx → add breadcrumb header
  * index.tsx → three-column flex layout
  * store.ts → add napkin browser state (expanded cards, view mode)
