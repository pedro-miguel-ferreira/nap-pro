* integration + stress test
  * proves the whole thing works end-to-end
  * proves it doesn't melt at scale

* integration test
  * launch Nap.app in ~/test-project
  * from first terminal (shell)
    * nap start "echo hello world" --name agent-a
    * nap start "sleep 10 && nap done 'finished sleeping'" --name agent-b
    * nap ps → shows 3 sessions (shell + agent-a + agent-b)
    * nap poke agent-a "wake up"
    * nap peek agent-a → terminal switches
    * nap nap agent-b --timeout 15 → blocks, returns when agent-b runs nap done
  * this exercises every CLI command
  * this exercises poke delivery, nap blocking, done signaling
  * this exercises parent-child (shell → agent-a, shell → agent-b)

* stress test
  * spawn 10 terminals
    * each running `top` or `yes | head -n 10000` or similar high-output command
  * rapid switching
    * click through all 10 cards quickly
    * measure: is switch instant? any blank frames?
  * measurements
    * CPU usage (Activity Monitor or `top -pid`)
    * memory usage (should grow linearly with terminals, not explode)
    * switch latency (visual — stopwatch or screen recording)
  * 10 WebGL contexts
    * all 10 simultaneously
    * should be under GPU limit (~16)
    * watch for: WebGL context lost events

* addon-search
  * add here, low priority
  * Cmd+F in terminal panel → search overlay
  * uses @xterm/addon-search
  * nice-to-have for inspecting agent output

* what success looks like
  * integration test runs without manual intervention
    * all CLI commands return expected results
    * poke delivers, nap unblocks, done signals
  * stress test
    * 10 terminals run without crash
    * switching feels instant (< 100ms perceived)
    * no WebGL context lost
    * memory < 500MB for 10 terminals (ballpark)
