# Claude Code Session ID — Research Findings

## TL;DR

Session IDs are UUIDs. You can **pre-assign** them with `--session-id` and **resume** with `--resume <id>`. No env var exposes the session ID. The `~/.claude/sessions/{PID}.json` files map process IDs to session UUIDs, but this is only useful from inside a CC bash tool call (where `$PPID` = the claude process) — not from outside.

---

## Session ID format

Standard UUID v4: `4494b603-bfeb-417e-a98e-4704e206a0e9`

## Storage locations

| Path | Keyed by | Contents |
|------|----------|----------|
| `~/.claude/sessions/{PID}.json` | OS process ID | `{pid, sessionId, cwd, startedAt}` |
| `~/.claude/session-env/{UUID}/` | Session UUID | Per-session env data (usually empty) |
| `~/.claude/history.jsonl` | — | All user messages, each tagged with `sessionId` + `project` |
| `/tmp/claude-{UID}/{encoded-cwd}/{UUID}/` | Session UUID | Runtime temp data (task output, etc.) |

## How to get the session ID

### Method 1: Pre-assign at launch (best for NAP)

```bash
MY_UUID=$(uuidgen)
claude --session-id "$MY_UUID" -p "do stuff"
```

The session is created with exactly that UUID and can be resumed later. This is the cleanest path for NAP — generate UUID upfront, store it, pass it to `claude`.

### Method 2: From inside an interactive session (PPID lookup)

The shell spawned by Claude Code has `$PPID` pointing at the `claude` process. The PID-keyed session file maps directly to the UUID:

```bash
cat ~/.claude/sessions/$PPID.json | jq -r '.sessionId'
# → 4494b603-bfeb-417e-a98e-4704e206a0e9
```

Or without jq:
```bash
python3 -c "import json; print(json.load(open('$HOME/.claude/sessions/$PPID.json'))['sessionId'])"
```

This is the **most reliable from-inside method**. Works for any bash tool call within a CC session. Verified: `$PPID` reliably points to the `claude` process.

### Method 3: From print mode JSON output

```bash
claude -p "your prompt" --output-format json 2>/dev/null \
  | python3 -c "import sys,json; msgs=json.load(sys.stdin); print(next(m['session_id'] for m in msgs if m.get('type')=='system'))"
```

The first message in the JSON array is type `system`, subtype `init`, and contains `session_id`.

### What's NOT available

**No env var exposed.** Only these CC env vars exist inside a session:
- `CLAUDECODE=1`
- `CLAUDE_CODE_ENTRYPOINT=cli`

No `CLAUDE_SESSION_ID` or equivalent.

## How to resume a session

```bash
claude --resume <session-id>           # resumes if exact UUID match; opens filtered picker otherwise
claude --resume <search-term>          # opens picker filtered by term
claude --resume                        # opens interactive picker
claude -c                              # most recent session in this directory
```

**Note:** `--resume` does NOT fail on a non-existing UUID — it falls back to the interactive picker using the value as a search filter. This means you can't distinguish "resumed successfully" from "no such session" in a non-interactive (print mode) context without checking output. For programmatic use, verify the session file exists first:

```bash
# Guard: check session exists before resuming
if grep -rl "\"sessionId\":\"$UUID\"" ~/.claude/sessions/ > /dev/null 2>&1; then
  claude --resume "$UUID" -p "continue"
else
  echo "Session $UUID not found"
fi
```

Resume also works in print mode:
```bash
claude --resume <session-id> -p "continue the task"
```

## Related flags

| Flag | Purpose |
|------|---------|
| `--session-id <uuid>` | Pre-assign UUID (create or reuse) |
| `--resume <id>` / `-r` | Resume by ID or pick interactively |
| `--continue` / `-c` | Resume most recent in cwd |
| `--fork-session` | New ID, copy history (use with --resume or --continue) |
| `--no-session-persistence` | Don't save to disk (print mode only) |
| `-n, --name <name>` | Human-readable name, shown in picker |

## Listing and monitoring sessions (from outside)

No dedicated `claude sessions list` CLI command exists. For programmatic listing, scan session files:

```bash
for f in ~/.claude/sessions/*.json; do
  pid=$(basename "$f" .json)
  data=$(cat "$f")
  sid=$(echo "$data" | jq -r '.sessionId')
  cwd=$(echo "$data" | jq -r '.cwd')
  alive=$(ps -p "$pid" > /dev/null 2>&1 && echo "RUNNING" || echo "dead")
  echo "$pid  $sid  $cwd  $alive"
done
```

## Recommendations for NAP

**Strategy: pre-assign UUIDs.**

```
1. nap generates UUID
2. stores it in DB: { agent_id, session_id, cwd, status }
3. spawns: claude --session-id <uuid> -p "..." --output-format stream-json
4. to resume: claude --resume <uuid> -p "continue" --output-format stream-json
```

This avoids parsing output to discover the ID. The UUID is known before the session starts.

**Fallback: PPID lookup from inside.** If a session was started without `--session-id` (e.g., user-initiated), a hook or init script can still extract it via `~/.claude/sessions/$PPID.json`.

**Named sessions** (`--name`) are a nice-to-have for the interactive picker but not needed for programmatic control.

**Fork** (`--fork-session`) could be useful for agent retry/branching — fork from a known-good checkpoint without mutating the original session.

**Liveness check:** Session files are keyed by PID. Check `ps -p <pid>` to determine if a session is still running.
