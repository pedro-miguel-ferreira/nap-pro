# NAP — What This Is

NAP is a terminal manager for AI agents. You open it in a project directory, get a terminal, and from there you spawn agents that work in parallel — each in their own pty, each visible as a card in a sidebar.
//Nap is more than a terminal manager; it's a manager of an agentic workflow with the promise of unfolding things into existing from a napkin. I don't know why you are understating this in such a way.
//It's even more than a manager; it's a kind of collaborative environment for agents to work on stuff and the workflow to unfold that thing.
//Do you remember about the napkin manifesto? Maybe we should add some of that here?
//Feel free to read that skill and include it here.
//I think it has kind of great examples.

Agents communicate: one can `poke` another (write to its stdin), `nap` on another (block until it's done), and signal completion with `done`. The human watches everything from a sidebar, clicks between agents, sees full scrollback of their thinking.

The bigger vision: you napkin an idea in 15 minutes, then agents unfold it into specs, tests, and code. You come back and everything that happened is there — every decision, every wrong turn, every recovery. Not a summary, the actual thinking.

Read `.nap/00-org/10-promise.nap.md` for the full promise.

## The Name

NAP = Napkin Agent Protocol. You scratch a napkin, spawn agents, take a nap, wake up to a working system. The napkin is the spec. Everything downstream is derived.
//btw I don't fully like the name that it's "napkin agent protocol". Maybe let's leave it more of a TBD for now, and we will kind of work about what acronyms actually mean.

## Napkin Format

Napkins are compressed idea documents — asterisks nested all the way down. Each bullet is an anchor that holds a bigger idea in place. Labels, not sentences. Nesting is zooming in. Depth means more specific, not more verbose. Files use `.nap.md` extension.

//Otherwise, this is good.