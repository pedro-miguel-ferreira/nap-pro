* 01 — the home view
  * three columns
    * left gutter (60px): nepic switcher
      * P — previous era (the POC)
      * S — active era (highlighted with a white bar)
      * + — where the next era would be
        * not a button at the bottom
        * it's the next thing in the sequence
        * click it and a whole new version unfolds
    * middle: the sidebar
      * 40 napkins rendered as `*` bullet lines
      * the project as a scannable document
        * each line: name, agent dots, napkin phase
        * green dots pulse — agents actively working right now
        * you can read the entire project state without clicking anything
    * right: the terminal
      * Nova (acting architect) showing `nap ps`
        * 28 agents listed with status and parent
        * the single pane of glass
        * you read this first when you come back from a nap
  * two architects at the top
    * 002-nova — acting, running, managing everything
    * 001-architect — retired but still there
      * click into their terminal to read historical context
      * poke them to pull knowledge from their deeper history
  * the sidebar IS a napkin
    * asterisks, nesting, labels
    * same format as the documents it navigates
    * the tool speaks its own language


* 01a — architect extended (Cmd+E)
  * 002-nova's card expanded to show full directory
    * not a settings panel
    * a window into the actual filesystem
    * rendered as nested bullets
  * the architect's working files are visible
    * prompt.md — their role briefing
    * onboarding/ — what they read when they booted up
      * nova-handoff.md
      * project-state.md
      * architecture.md
    * scratch/ — living documents
      * sprint-plan.md
      * agent-assignments.md
  * each file has controls on hover
    * ⎘ copy the relative path
    * ↗ open in your editor
    * one click to go from sidebar to editing the actual document
  * this is the deepest zoom on the architect
    * collapsed: one line with a dot
    * focused: top-level directories
    * extended: every file, every path
    * same visual language at every level


* 02 — focused card with agents
  * 0100-design-sprint is focused
    * card expanded in place
    * no modal, no separate view
    * it just shows more right where it was
  * artifacts as `*` bullets
    * nap.md, spec.md, test.md
    * click any of them to open in your editor
    * the collaboration surface is one click away
  * agents as directories with status dots
    * 001-test-architect/ ● done (blue)
      * finished their work, called nap done
    * 002-fs-eng/ ● run (green, pulsing)
      * actively working right now
    * 003-test-eng/ ◌ nap (amber, hollow)
      * alive but waiting
      * napping until the engineer finishes
  * terminal switched to FS-100
    * breadcrumb: S > 0100-design-sprint > FS-100
      * spatial context — you know exactly where you are
      * click S to go back to architect
      * click the napkin name to refocus the card
    * the agent is mid-work
      * building the v2-final mock right now
      * you can see their thinking, their tool calls, their progress
      * you can type a message and they'll respond in seconds
        * because they have the full context
        * they were there the whole time
  * below the focused card
    * the rest of the 40 napkins still visible as one-liners
    * density holds at scale
    * you never lose the forest for the tree


* 03 — extended view with virtual entries
  * Cmd+E on the same card
    * directory unfolds one level deeper
  * full file names visible
    * 0100-design-sprint.nap.md
    * 0100-design-sprint.spec.md
    * the real paths, not abbreviations
  * each agent directory expands to show its contents
    * [terminal] — click to open the live session
      * italic, bracketed — signals "this is an action, not a file"
    * [history] — full conversation from JSONL
      * when context truncates, the beginning is gone from the live terminal
      * history preserves everything
    * [diff] — what did this agent change?
      * scoped git diff
      * the impact, not the conversation
    * prompt.md — what the architect asked them to do
    * response.md — what they delivered
  * three card states, one visual language
    * collapsed: one line — name, dots, status
    * focused: artifacts and agents
    * extended: every file, every virtual entry, every control
    * bullets all the way down
    * the same `*` at every zoom level


* 04 — kanban quake console (Cmd+`)
  * overlay slides down from the top
    * the terminal is still underneath, untouched
    * the board is a HUD, not a replacement
  * five columns
    * BACKLOG (10) — just ideas
    * TODO (10) — napkins exist, no agents yet
    * DOING (7) — agents actively working
    * REVIEW (5) — human reviewing the results
    * DONE (8) — shipped, foundation complete
  * 40 cards distributed across columns
    * all collapsed by default
    * you see the shape of the entire version at a glance
      * where the weight is, where the gaps are
      * 10 in BACKLOG, 7 in DOING with pulsing dots, 5 in REVIEW
      * the distribution IS the information
    * click a card name to expand it
      * napkin bullets appear — the actual IDEAS
        * 0230-agent-comms-v2
          * "poke/nap/done protocol v2"
          * "cross-agent file coordination"
          * "response.md as structured handoff"
        * nested bullets showing tension and tradeoffs
      * artifact badges: nap spec (filled = exists, dimmed = not yet)
        * you can see how far along the pipeline each feature is
      * agent dots — who's working on what
    * collapsed shows WHERE everything is
    * expanded shows WHAT something is
  * every card has →
    * click it to navigate
    * the board slides away
    * the sidebar scrolls to that card
    * blue flash — "you are here"
    * terminal switches to the best agent
    * one click from overview to deep work
  * the board is a reading surface
    * you scan your napkins as IDEAS, not status labels
    * the napkin format carries through
      * even here, it's bullets
