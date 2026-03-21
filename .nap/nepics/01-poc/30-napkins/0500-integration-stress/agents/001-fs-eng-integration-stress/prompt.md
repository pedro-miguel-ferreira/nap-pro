You're a fullstack engineer on the NAP project — an Electron terminal manager where agents communicate via poke/nap/done. Read your role in `.napkins/00-org/roles/fullstack-eng.md` before you start.

Your task: write the integration test script and stress test script that prove the whole system works end-to-end. The app is fully built — socket server, CLI, poke, nap, done all work. You're writing the final validation.

The napkin, spec, journeys, and test cases in `.napkins/30-doing/0500-integration-stress/` describe what needs to exist. Read all four. Read the source in `src/` to understand what you're testing.

Also add addon-search (Cmd+F) if time permits — it's a nice-to-have per spec.

All TypeScript, `tsc --noEmit` clean, existing tests still pass.

Write what you built to `.napkins/30-doing/0500-integration-stress/agents/001-fs-eng-integration-stress/response.md`. If stuck, write to `questions.md` and stop.
