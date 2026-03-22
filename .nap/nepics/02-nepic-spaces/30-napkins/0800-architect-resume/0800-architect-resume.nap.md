* architect resume — pick up mid-thought after restart

* on app launch, after UI state restored (0700)
  * find architect session for active nepic
  * read cc_session_uuid from SQLite
  * spawn: `claude --resume <uuid>` in architect terminal
  * architect has full conversation history — seamless

* agent "was running" states
  * sessions with status=running but no pty → orphaned
  * UI shows distinct visual: orphaned dot style
    * dotted border, dimmed text
    * "was running when you left"
  * human can click → option to resume manually
    * `claude --resume <uuid>` in that agent's terminal

* auto-resume scope
  * architect: auto-resume (v2)
  * agents: manual resume (v2)
  * auto-resume all agents: fast-follow napkin
