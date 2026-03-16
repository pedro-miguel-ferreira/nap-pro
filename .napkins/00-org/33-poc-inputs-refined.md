* nap v0.1 poc — refined inputs
  * adjustments from architect + PM discussion over 00-scratch/32-poc-inputs.md
  * everything not mentioned here stands as written in the original

* rendering
  * WebGL, not canvas
    * why WebGL wins
      * smooth scrolling on large scrollback (10k+ lines)
      * fast streaming output (build logs, Claude thinking)
      * GPU-offloaded — lower CPU when 10 terminals produce output simultaneously
    * why not canvas
      * stutters on fast output
      * eats CPU under load
  * no transparency
    * WebGL renderer doesn't support rgba backgrounds
    * can't have both — WebGL wins over vibrancy
    * drop vibrancy/translucent window entirely
  * no context juggling
    * GPU context limit is ~16
    * POC targets ≤10 terminals
    * mount WebGL addon on every terminal
    * leave it — no dispose/re-init, no "active + 2 recent" strategy

* terminal lifecycle
  * xterm.Terminal instance
    * never disposed
    * holds buffer + scrollback
    * lives for the entire session lifetime
  * on switch
    * detach DOM element from old terminal
    * reattach DOM element to new terminal
    * that's it — no re-rendering, no buffer replay
  * WebGL addon
    * stays attached to every terminal
    * no context limit pressure at this scale

* poke delivery
  * dumb stdin for POC
    * write to pty stdin immediately
    * no prompt detection
      * why skip: Claude thinks for >2s regularly, idle heuristic misfires
      * why it's ok: Claude Code handles unexpected input gracefully
  * queued messages
    * fixed delay between deliveries (500ms–1s)
    * sequential — don't fire next until delay elapsed
    * no echo detection, no confirmation
  * future direction
    * Claude Code hooks could provide proper delivery timing
    * not for POC

* arbitrary commands
  * `nap start` runs any command
    * not hardcoded to `claude`
    * `nap start "node server.js" --name my-server`
  * why
    * makes POC testable without Claude dependency
    * proving terminal/poke/nap mechanics is the point
    * Claude integration is layered on top, not baked in

* first terminal on launch
  * app opens → one terminal
    * runs user's default shell
    * cwd = directory the app was launched from
  * this is the "first terminal" in the integration test
    * where you run `nap start`, `nap poke`, etc.

* socket cleanup
  * on normal exit
    * process signal handlers remove ~/.nap/sock
    * SIGTERM, SIGINT, beforeExit
  * on hard crash
    * SIGKILL, OOM — handler doesn't run
    * stale socket stays on disk
    * acceptable edge case for POC
