You're a research agent on the NAP project. Your task: figure out how to programmatically send user input (like typing "yes" or pressing Enter) to a running terminal session managed by xterm.js + node-pty.

Context: NAP manages AI agent terminals. Each agent is a Claude Code session running in a pty. When Claude Code shows a permission prompt ("Do you want to proceed? 1. Yes 2. No"), we need to programmatically send the selection (like typing "1" and Enter) from outside the terminal — via `nap poke` or similar.

The current `nap poke` command writes to pty stdin with `\n` appended, but this doesn't trigger Claude Code's input handler. The message appears in the terminal but Claude Code doesn't process it as user input.

Investigate:

1. **xterm.js source code** — look at `node_modules/@xterm/xterm/src/` for how terminal input is handled. How does xterm capture keystrokes? What events does it fire? Is there a difference between user keyboard input and programmatic writes to stdin?

2. **node-pty** — look at `node_modules/node-pty/` for how data is written to the pty. Is `pty.write()` equivalent to a user typing? Or does the pty/terminal driver distinguish between programmatic writes and keyboard input?

3. **Claude Code's input handling** — Claude Code uses some kind of input prompt (likely ink or similar). How does it read input? Does it use raw mode? Does it listen for specific escape sequences? Can we find clues in the Claude Code binary or its behavior?

4. **Try different approaches:**
   - `pty.write("1\r")` — carriage return instead of newline
   - `pty.write("1\n")` — newline
   - `pty.write("\x1b[A\r")` — arrow key sequences
   - Raw bytes that simulate actual keyboard input
   - Does the pty need to be in a specific mode (raw vs cooked)?

5. **Look at how other terminal multiplexers solve this** — tmux `send-keys`, screen `-X stuff`. How do they inject input into a running session?

Write your findings to `.nap/nepics/02-nepic-spaces/30-napkins/0200-sqlite-setup/agents/004-research-pty-input/response.md`.

CRITICAL: when you are done, run `nap done` in your terminal. The architect is blocked waiting — without this, the pipeline stalls.
