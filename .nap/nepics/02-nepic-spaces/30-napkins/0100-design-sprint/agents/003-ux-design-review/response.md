# UX Design Review — Response

Status: ongoing iteration (human requested continued collaboration, not closing agent)

## Core Finding

The napkin format (`*` bullets, nesting, labels over sentences) IS the UI language. Not cards, not panels, not chips. Bullets all the way down.

The sidebar is not a component library rendering data. It's a napkin rendering itself as an interactive surface.

## Layout: Validated

* gutter (60px) + sidebar (300px) + terminal (fills rest)
  * gutter = nepic switcher, timeline of architectural eras
    * `+` sits where the next nepic would appear, not at the bottom
    * clicking `+` = new era with fresh architect = pivot as cheap as having an idea
  * sidebar = collaboration map (not a file browser, not a dashboard)
    * answers: where is everything? who's working? where do I jump in?
  * terminal = primary workspace, where you talk to agents

## Card States: Validated

Three states, same visual language at every zoom level:

* collapsed — one line: `* name ●●◌  status`
  * scans the whole project in N lines
* focused — bullets expand: artifacts as `*`, agents as `●/◌`
  * artifact clicks open editor, agent clicks switch terminal
* extended (Cmd+E) — full directory snapshot with file controls
  * `⎘` copy path, `↗` open in editor
  * hover-reveal, not always visible

## Two Status Systems (orthogonal, don't collapse)

* napkin status (project phase): backlog → todo → doing → review → done
  * what the kanban shows
* agent status (runtime state): running ● / done ● / napping ◌ / exited ◌
  * what the dots show
  * agents can be active at ANY project status

## Kanban: Quake Console (Cmd+`)

* slides down from top as overlay, full width
* terminal stays underneath, untouched
* read-only for now; drag-to-reorder is future
* solves the width problem — kanban gets full width when needed, zero when not

## Architect: Pinned Header

* not a napkin — it's the control plane
* always at top of sidebar, separated from napkins
* its artifacts are richer and less predictable than napkin artifacts
* its terminal is the default view on launch

## Design Language: Confirmed

* `*` bullets for artifacts (napkin language)
* `●` filled dots for running (green) and done (blue)
* `◌` hollow dots for napping (amber) and exited (gray)
* running dots pulse subtly
* artifact text in #9cdcfe (file blue), agents in default text color
* active card: #37373d bg, #007acc left border

## Mock

Interactive HTML mock at:
`mocks/v2-cards-layout.html`

## What's Next (iterating with human)

* stress test with 8-10 napkins — does density hold?
* architect card presence — should it feel more like "the brain"?
* small refinements to spacing, labels, interactions
* human will inform architect about ongoing status
