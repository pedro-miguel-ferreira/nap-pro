* poke, nap, done
  * agent-to-agent communication — the whole point of NAP
  * proves: one agent can poke another, wait for it, and hear back

* nap poke <name> "message"
  * the problem
    * agent A wants to tell agent B something
    * B might be busy (mid-output, mid-thought)
    * can't just slam text into stdin mid-stream... or can we?
  * POC answer: yes, just write to stdin
    * no prompt detection
    * Claude Code handles unexpected input
    * good enough to prove the mechanic
  * message queue
    * each terminal has messageQueue[]
    * poke enqueues message
    * delivery loop
      * pop message from queue
      * write to pty stdin
      * wait fixed delay (500ms–1s)
      * pop next
    * sequential — never overlap messages
  * what the message looks like in the terminal
    * raw text written to stdin
    * the target process sees it as keyboard input

* nap nap <name> [--timeout <s>]
  * "go to sleep until this agent is done"
  * blocks the caller
    * CLI holds socket connection open
    * polls { type: "status", name } every 1s
    * when status = "done" or "exited" → return
  * timeout
    * default: 600s (10 min)
    * on timeout: exit with error, don't kill the target
  * return value
    * target's last done-message if any
    * empty string if target exited without nap done

* nap done [message]
  * "I'm finished, here's what I have"
  * reads NAP_SESSION_ID from env → knows who "I" am
  * sets own status to "done" (blue dot)
  * if has parent
    * poke parent with message
    * parent's nap nap unblocks on next poll
  * if no parent
    * just mark done, no poke

* the loop (happy path)
  * parent starts child: nap start "do work" --name worker
  * parent waits: nap nap worker
  * child works...
  * child finishes: nap done "result is 42"
  * parent unblocks, receives "result is 42"
  * parent continues with the result
