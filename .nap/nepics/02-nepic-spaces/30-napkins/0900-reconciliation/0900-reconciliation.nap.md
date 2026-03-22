* reconciliation — filesystem walk vs SQLite on launch

* runs once, every startup, before rendering
  * walk `30-napkins/` → list napkin dirs
  * walk each `agents/` → list agent dirs
  * match against SQLite by key (napkin_slug + agent_dir_name)

* three outcomes
  * match → reconnect with stored metadata (status, UUID, timestamps)
  * dir exists, no SQLite entry → new, create with default status
  * SQLite entry, no dir → orphaned, hide from UI, don't delete row

* why "don't delete"
  * branch switch: dirs disappear, come back later
  * SQLite rows hibernate when dir absent, wake up when it returns
  * UUIDs, statuses, timestamps survive the round-trip

* orphaned agents
  * visually distinct in sidebar (dotted border, dimmed)
  * not "new" — clearly disconnected from a previous session
  * still has prompt.md/response.md on disk (if dir exists)

* performance
  * 40 napkins × 3 agents = ~120 readdir + SQLite lookups
  * milliseconds — not a concern
