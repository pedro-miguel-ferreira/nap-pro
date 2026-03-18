* journey 1 — run the integration test
  * developer opens Nap.app in ~/test-project
  * from first terminal: ./test/integration.sh
  * script runs through all commands
  * output:
    ```
    [ok] nap start agent-a
    [ok] nap start agent-b
    [ok] nap ps shows 3 sessions
    [ok] nap poke agent-a
    [ok] nap peek agent-a
    [ok] nap nap agent-b (returned: finished sleeping)

    6/6 passed
    ```
  * developer sees green across the board
  * if something fails: clear message about what broke

* journey 2 — stress test
  * developer runs: ./test/stress.sh 10
  * 10 terminals spawn in sidebar
    * each running `top` or high-output command
  * script switches between them rapidly
  * after 30 seconds, prints:
    ```
    terminals: 10
    CPU peak: 45%
    memory: 380MB
    switch latency: all < 100ms
    WebGL context lost: 0
    ```
  * developer eyeballs the numbers
  * no hard pass/fail — this is a sanity check

* journey 3 — search in scrollback
  * agent has produced lots of output
  * user hits Cmd+F
    * search bar appears at top of terminal panel
  * types a keyword
    * matches highlighted in terminal
    * first match scrolled into view
  * Cmd+G or Enter → next match
  * Escape → search bar closes, highlights clear
