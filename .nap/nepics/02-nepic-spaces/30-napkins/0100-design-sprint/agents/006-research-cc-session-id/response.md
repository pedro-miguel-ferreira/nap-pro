# Claude Code Session ID — Research Findings

## TL;DR

Session IDs are UUIDs. You can **pre-assign** them with `--session-id`, **capture** them from `--output-format json`, and **resume** with `--resume <id>`. No env var is exposed inside a running session.

---

## Session ID format

Standard UUID: `1d2f5dc9-905b-468c-985f-84d9e5b02b32`

## How to get the session ID

### From print mode (`-p`) — the reliable path

```bash
claude -p "your prompt" --output-format json 2>/dev/null \
  | python3 -c "import sys,json; msgs=json.load(sys.stdin); print(next(m['session_id'] for m in msgs if m.get('type')=='system'))"
```

The first message in the JSON array is type `system`, subtype `init`, and contains `session_id`.

### Pre-assign a session ID

```bash
claude --session-id "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -p "do stuff"
```

Verified: the session is created with exactly that UUID, and can be resumed later. This is the cleanest path for NAP — generate UUID upfront, store it, pass it to `claude`.

### From inside an interactive session

**No env var exposed.** `CLAUDE_SESSION_ID` does not exist. Only these env vars are set:
- `CLAUDECODE=1`
- `CLAUDE_CODE_ENTRYPOINT=cli`

No CLI command to query current session ID from within the session.

## How to resume a session

```bash
claude --resume <session-id>           # by UUID
claude --resume <search-term>          # opens picker filtered by term
claude --resume                        # opens interactive picker
claude -c                              # most recent session in this directory
```

All work in both interactive and print mode:
```bash
claude --resume <session-id> -p "continue the task"
```

Verified: resumed session has full conversation history and context.

## Related flags

| Flag | Purpose |
|------|---------|
| `--session-id <uuid>` | Pre-assign UUID (create or reuse) |
| `--resume <id>` / `-r` | Resume by ID or pick interactively |
| `--continue` / `-c` | Resume most recent in cwd |
| `--fork-session` | New ID, copy history (use with --resume or --continue) |
| `--no-session-persistence` | Don't save to disk (print mode only) |
| `-n, --name <name>` | Human-readable name, shown in picker |

## Session storage

Sessions stored under `~/.claude/` (exact layout is implementation detail, not documented). Sessions are scoped to their working directory.

## Recommendations for NAP

**Strategy: pre-assign UUIDs.**

```
1. nap generates UUID
2. stores it in DB: { agent_id, session_id, cwd, status }
3. spawns: claude --session-id <uuid> -p "..." --output-format stream-json
4. to resume: claude --resume <uuid> -p "continue" --output-format stream-json
```

This avoids parsing output to discover the ID. The UUID is known before the session starts.

**Named sessions** (`--name`) are a nice-to-have for the interactive picker but not needed for programmatic control.

**Fork** (`--fork-session`) could be useful for agent retry/branching — fork from a known-good checkpoint without mutating the original session.
