* journey 1 — first-time setup
  * user clones nap, builds ~/nap-app
  * sets NAP_APP_PATH=~/nap-app in shell profile (or uses default)
  * cd ~/my-project
  * nap open
    * Nap.app launches, cwd = ~/my-project
    * .nap/ dir created in project
    * .nap/sock is live
    * first terminal is a shell in ~/my-project

* journey 2 — CLI help
  * user types `nap`
    * sees help with all commands listed
  * user types `nap start --help`
    * sees usage: nap start <command> [--name] [--cwd]
  * user types `nap --help`
    * same as `nap` with no args

* journey 3 — launch agents and read output
  * user runs `nap start "claude ..." --name fs-eng`
  * agent works for a while
  * user wants to check output without switching cards
  * `nap log fs-eng | tail -20`
    * sees last 20 lines of agent's terminal
  * `nap log fs-eng | grep "error"`
    * searches agent output for errors

* journey 4 — colored nap ps
  * user runs `nap ps`
    * sees table with colored dots
    * green dot next to running agents
    * blue dot next to done agents
    * gray dot next to exited ones
  * user runs `nap ps --json` in a script
    * gets raw JSON, no ANSI codes

* journey 5 — Cmd+click a file path
  * agent output shows `src/main/main.ts:42:17`
  * user holds Cmd, hovers over path
    * path underlines, cursor changes to pointer
  * user Cmd+clicks
    * file opens in default editor
  * agent output shows a URL `https://...`
    * that's handled by addon-web-links, opens in browser

* journey 6 — Cmd+K to find an agent
  * sidebar has 12 agents
  * user hits Cmd+K
    * input field appears at top of sidebar
  * types "test"
    * only agents with "test" in name shown
  * clicks one → terminal switches
  * hits escape → all cards visible again

* journey 7 — two projects simultaneously
  * terminal 1: cd ~/project-a && nap open
  * terminal 2: cd ~/project-b && nap open
  * two Nap.app windows, each with own .nap/sock
  * `nap ps` in project-a shows project-a's agents
  * `nap ps` in project-b shows project-b's agents
  * no conflict
