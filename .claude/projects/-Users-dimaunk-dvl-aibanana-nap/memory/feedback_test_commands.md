---
name: Use npm run test:medium for Electron tests
description: Always use npm run test:medium for Playwright/Electron tests, not raw npx playwright commands
type: feedback
---

Use `npm run test:medium` for Electron/Playwright tests, never raw `npx playwright test` commands.

**Why:** The raw command requires multiple approvals from the user and is hard to pre-approve. The npm script is already set up correctly.

**How to apply:** Always use `npm run test:small` and `npm run test:medium` for running tests. If you need to filter tests, use env vars or Playwright config, not raw CLI commands.
