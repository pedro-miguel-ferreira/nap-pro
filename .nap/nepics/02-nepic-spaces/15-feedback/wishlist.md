# Wishlist

Each bullet is a "what if." Not a todo. Not a spec. An idea with energy — something that made someone's eyes light up when they said it out loud. If you read this list and don't feel a pull to build at least one of these, we wrote them wrong.

* What if agents had names?
  * Not `001-fs-eng-sqlite` — a *name*
  * You spawn an architect and it's "Ari"
  * Your fullstack eng is "Kit"
  * The test engineer who keeps finding the gnarliest bugs is "Sage"
  * You look at the sidebar and it's a team, not a spreadsheet
  * "Sage found a race condition in the shutdown path" — everyone knows who you mean
  * The role is still there, the feature is still there
    * but now there's a character attached to the work
    * the scrollback of their thinking feels like reading a colleague's notes, not a log file

* What if every agent just... knew how the team works?
  * NAP as workspace, not terminal manager — like Slack, not tmux
  * `nap --help-workflow` — any agent runs it, gets: here's how we communicate, here's the workflow, here's your team
  * `nap poke --name Nova --message "Hey, it's fs-eng-0200, how do I signal that I'm blocked?"` — ask the architect like you'd DM a team lead
  * the role doc says WHO you work with, not just WHAT to do
  * every agent knows: poke, nap, done — the way you know Slack has channels and threads
  * bootstrapping question: how do you take a codebase and bring it into NAP?
    * fresh project? existing repo? mid-flight project with history?
    * what's the minimum setup to go from "code in a folder" to "agents collaborating"
    * scaffolding, onboarding, team structure — all from one command?

* What if spawning an agent was as easy as Claude Code's internal agents?
  * right now: create directory, write prompt.md, `nap start 'claude ... read prompt.md ...'`
    * three manual steps before an agent even exists
    * every agent that wants to launch a sub-agent has to know this dance
  * what if: `nap spawn --napkin 0100 --role fs-eng --name "sqlite-schema"`
    * creates the agent dir in the napkin's `agents/` folder
    * returns the path — caller writes prompt.md there
    * or: takes prompt inline — `nap spawn --prompt "do X, write Y"`
    * auto-wires parent-child via NAP_SESSION_ID
    * agent appears in sidebar immediately, green dot, ready to watch
  * the feel: launching a sub-agent should be as natural as Claude Code spawning an internal agent
    * but visible — full terminal, full session, human can click and talk
  * parent-child tracking already exists (NAP_SESSION_ID)
    * just needs the scaffolding to be automated
  * flat structure in `agents/` dir, parent-child tracked in metadata
    * no nested dirs — all agents are peers in the folder, relationships are data
