* nepic creation — (+) button, fresh space

* clicking (+) in the gutter
  * prompt for name (or auto-generate: NN-name)
  * scaffold `.nap/nepics/NN-name/`
    * 10-docs/, 15-feedback/, 20-architects/, 30-napkins/, 40-board/
    * 40-board/ subdirs: 10-draft/ through 60-done/
    * 20-architects/001-architect/ with prompt.md template
  * SQLite: insert nepic, set is_active (deactivate previous)
  * UI: switch to new nepic (sidebar clears, gutter highlights new icon)

* architect boot
  * spawn pty: `claude --session-id <uuid> --verbose "read prompt.md ..."`
  * session created in SQLite with nepic_id, role=architect
  * terminal appears pinned at top of sidebar

* onboarding package generation
  * skill/workflow concern — not app code
  * template prompt.md references: project context, previous nepic's lessons
  * TBD: autonomous or human-reviewed

* gutter rendering
  * each nepic gets an icon/initial in the gutter
  * active nepic has white bar indicator
  * (+) sits at the bottom of the nepic stack
