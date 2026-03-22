You're a research agent on the NAP project. Your task: figure out how to get the Claude Code session UUID from inside a running session, or from outside it.

Context: NAP manages AI agents that are full Claude Code sessions running in terminals. We need to store the session UUID in our database so we can resume sessions later with `claude --resume <session-id>`.

Questions to answer:
1. Where does Claude Code store its session data? (~/.claude/ somewhere?)
2. Is there an env var, CLI flag, or file that exposes the current session ID?
3. Can you get the session ID from `claude --resume` output or from the filesystem?
4. Is there a `claude` CLI command that lists sessions or shows the current one?
5. What does the session ID look like? (UUID, hash, other format?)

Try running:
- `claude --help` and look for session-related flags
- `ls ~/.claude/` and explore the directory structure
- `env | grep -i claude` from inside this session
- Any other investigation you can think of

Write your findings to `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/006-research-cc-session-id/response.md`.

CRITICAL: when you are done, run `nap done` in your terminal. The architect is blocked waiting — without this, the pipeline stalls.
