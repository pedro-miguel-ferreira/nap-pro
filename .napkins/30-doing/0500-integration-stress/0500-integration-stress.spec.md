* integration + stress test — min spec

* integration test
  * a shell script (or node script) that runs the full sequence
  * must run unattended from a nap terminal
  * each step asserts expected output
    * nap start returns { id, name }
    * nap ps returns correct session count and names
    * nap poke doesn't error
    * nap peek doesn't error
    * nap nap returns done-message within timeout
  * if any step fails: print which step, what was expected, what happened
  * exit 0 on success, exit 1 on failure

* stress test
  * separate script
  * spawns N terminals (default 10, configurable)
  * each runs a high-output command
  * rapid-switches between them in a loop
  * collects metrics
    * not automated benchmarking — just print numbers for human review
    * CPU: sample every 2s during test
    * memory: snapshot before and after
  * WebGL context lost
    * listen for webglcontextlost event on each terminal
    * if fired: log it, this is a failure signal

* addon-search
  * Cmd+F → search bar appears above terminal
  * escape → search bar closes
  * uses addon-search findNext/findPrevious
  * highlight matches in terminal
  * nice-to-have — skip if time is tight
