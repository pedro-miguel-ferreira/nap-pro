* journey 1 — poke an agent
  * terminal A (shell) is active
  * user started agent-b earlier: nap start "cat" --name agent-b
    * cat waits for stdin — perfect poke target
  * user types: nap poke agent-b "hello from A"
  * switch to agent-b (click card or nap peek agent-b)
    * "hello from A" appears as if typed
    * cat echoes it back
  * poke again: nap poke agent-b "second message"
    * appears after 500ms delay

* journey 2 — wait for an agent
  * user starts a worker: nap start "sleep 3 && nap done 'finished'" --name worker
  * user waits: nap nap worker
    * terminal blocks
    * cursor just sits there
  * 3 seconds pass
    * worker runs nap done
    * worker's dot turns blue
    * user's nap nap returns: "finished"
    * shell prompt reappears

* journey 3 — parent-child with done message
  * user runs a script that:
    * nap start "do-task && nap done 'result: 42'" --name task-1
    * nap nap task-1
    * receives "result: 42"
    * uses the result for next step
  * this is the core NAP loop
    * spawn → wait → receive → continue

* journey 4 — poke queue ordering
  * user rapid-fires:
    * nap poke agent-b "first"
    * nap poke agent-b "second"
    * nap poke agent-b "third"
  * all three return immediately (enqueued)
  * in agent-b's terminal:
    * "first" appears
    * 500ms pause
    * "second" appears
    * 500ms pause
    * "third" appears
  * order preserved, no overlap

* journey 5 — timeout
  * user starts: nap start "sleep 999" --name stuck
  * user waits: nap nap stuck --timeout 5
  * 5 seconds pass, stuck never calls nap done
  * nap nap prints: "timeout waiting for stuck"
  * exit code 1
  * stuck is still running (not killed)

* journey 6 — poke a dead agent
  * agent-x has exited (gray dot)
  * user types: nap poke agent-x "hello"
  * error: "agent-x is not running"
  * message is not enqueued
