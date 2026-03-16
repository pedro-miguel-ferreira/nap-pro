* journey 1 — start an agent from the first terminal
  * app is running, user is in the first terminal (shell)
  * user types: nap start "echo hello && sleep 5 && echo done" --name test-1
  * CLI connects to socket, sends request
  * app creates new pty, new card appears in sidebar
    * card: "test-1", green dot
  * CLI prints: { id: "abc123", name: "test-1" }
  * user clicks "test-1" card → sees "hello" output, then waiting, then "done"
  * process exits → dot turns gray

* journey 2 — list sessions
  * user has 3 terminals running
  * types: nap ps
  * sees table:
    ```
    NAME      STATUS   PARENT   CWD              UPTIME
    shell     running  -        ~/my-project     5m
    test-1    exited   shell    ~/my-project     2m
    test-2    running  shell    ~/my-project     30s
    ```

* journey 3 — peek at an agent
  * user is looking at shell terminal
  * types: nap peek test-2
  * terminal panel switches to test-2
  * sidebar highlights test-2 card
  * if sidebar was collapsed, it opens

* journey 4 — kill and close
  * user types: nap kill test-2
    * test-2's process is killed
    * dot turns gray
    * card stays — user can still click and scroll back
  * user types: nap close test-1
    * test-1's card disappears from sidebar
    * if test-1 was active, switch to another terminal

* journey 5 — parent-child relationship
  * user runs: nap start "nap start 'echo nested' --name child" --name parent
  * parent terminal runs, invokes nap start inside itself
  * child's parentId = parent's id (via NAP_SESSION_ID)
  * nap ps shows parent column:
    ```
    NAME     STATUS   PARENT
    shell    running  -
    parent   running  shell
    child    running  parent
    ```
  * child's card in sidebar shows "parent" as parent name

* journey 6 — app not running
  * user opens a regular terminal (not inside Nap.app)
  * types: nap ps
  * output: "nap is not running"
  * exit code: 1
