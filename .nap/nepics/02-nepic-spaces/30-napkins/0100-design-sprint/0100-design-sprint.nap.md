* design sprint — standalone HTML mocks

* goal: answer layout questions before touching Electron
  * what does v2 feel like?
  * cheapest possible validation — hours, not weeks

* three-column layout
  * left gutter (~60px)
    * nepic switcher — vertical stack of icons/initials
    * mock 3 nepics: "P" (poc), "S" (spaces), "+" (create)
    * active nepic highlighted
  * middle column (~300px)
    * napkin browser — tree view
    * architect section pinned at top (status dot, name)
    * napkin cards, collapsible
      * collapsed: feature name + status badge
      * expanded: artifacts (nap.md, spec.md, test.md) + agents
        * agents with status dots (green/blue/gray)
        * clicking agent highlights it
    * Cmd+K filter bar at top
  * right panel (fills rest)
    * mock terminal — dark background, monospace text
    * show realistic claude output (tool calls, thinking, responses)
    * clicking agent in middle → terminal header changes to that agent's name

* mock data to include
  * 4-5 napkin features at various statuses
    * one with agents expanded (mix of running/done/exited)
    * one collapsed with just a status badge
    * one in draft (no agents yet)
  * architect running at top
  * realistic feature names from our milestones
    * 0100-design-sprint, 0200-sqlite-persistence, 0300-napkin-browser, etc.

* board view variant
  * same middle column space, toggled
  * columns: draft, backlog, todo, doing, review, done
  * compact cards — feature name + progress
  * key question: board replaces middle column (terminal stays)?
    * or board takes over the full width?
    * build both, compare

* design language (carry from v1)
  * dark theme: #1e1e1e bg, #252526 sidebar, #3c3c3c borders
  * status dots: green #22c55e, blue #3b82f6, gray #6b7280
  * font: Menlo, Monaco, monospace, 14px
  * active card: #37373d bg, #007acc left border

* deliverables
  * standalone HTML/CSS files — no build step, open in browser
  * one file per layout variant
  * interactive enough to click around — CSS :hover, collapsible sections
  * screenshot-ready for discussion

* what we learn
  * does the tree feel like a dashboard or noise?
  * is 300px enough for feature names + agents?
  * does the gutter feel spatial or wasted?
  * board view: companion or takeover?
