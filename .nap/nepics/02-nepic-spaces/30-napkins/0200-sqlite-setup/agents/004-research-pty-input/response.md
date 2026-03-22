# Research: Programmatic Input to PTY Sessions

## Executive Summary

**Two issues stacked on top of each other:**

1. **`\n` is wrong** — Ink maps `\r` → `key.return = true` (submit), but `\n` → `key.name = 'enter'` which has NO boolean in Ink's Key type. `\n` literally does nothing.
2. **Autocomplete swallows `\r`** — Even with `\r`, Claude Code's autocomplete dropdown intercepts Enter before the submit handler gets it. Confirmed in [claude-code#15553](https://github.com/anthropics/claude-code/issues/15553).

**The fix:** send text, wait, send Escape to dismiss autocomplete, wait, send Enter.

```
pty.write(text)  →  300ms  →  pty.write("\x1b")  →  100ms  →  pty.write("\r")
```

---

## Finding 1: PTY Architecture — pty.write() IS Keyboard Input

**node-pty's `write()` writes to the PTY master fd.** At the kernel level, this is indistinguishable from physical keyboard input. The child process cannot tell the difference.

Data flow:
```
pty.write(data)
  → CustomWriteStream → fs.write(masterFd, buffer)
  → kernel PTY line discipline
  → PTY slave fd (child process stdin)
```

This is exactly how tmux `send-keys` and screen `stuff` work — they write raw bytes to the master fd. There is no magic "real keyboard" flag.

**Confirmed from node-pty source** (`pty.cc` line 314+): PTY is created via `forkpty()` / `posix_openpt()`, returns master fd. All writes go to master. All reads come from master.

## Finding 2: Raw Mode Changes Everything

node-pty initializes the PTY with **cooked mode** (canonical) termios:

```c
// pty.cc default termios
c_iflag = ICRNL | IXON | IXANY | IMAXBEL | BRKINT
c_lflag = ICANON | ISIG | IEXTEN | ECHO | ECHOE | ECHOK | ECHOKE | ECHOCTL
```

But Claude Code (via Ink) calls `process.stdin.setRawMode(true)` on the slave side, which changes termios to:

```
c_iflag: ICRNL OFF → no CR-to-LF conversion
c_lflag: ICANON OFF → no line buffering, char-by-char delivery
         ECHO OFF → no echo
         ISIG OFF → no Ctrl-C signal generation
```

### The `\r` vs `\n` Problem

| Scenario | `\r` (0x0D) | `\n` (0x0A) |
|----------|-------------|-------------|
| **Cooked mode** (ICRNL on) | Converted to `\n`, triggers line submit | Triggers line submit directly |
| **Raw mode** (ICRNL off) | Passes through as `\r` — **this is Enter** | Passes through as `\n` — **NOT Enter** |

**The physical Enter key always sends `\r` (0x0D).** In cooked mode, the line discipline converts it to `\n` via ICRNL. In raw mode, no conversion happens — the app receives `\r` directly.

**tmux confirms this:** tmux's `send-keys Enter` sends `\015` (octal) = 0x0D = `\r`.

## Finding 3: Ink's parseKeypress — `\r` ≠ `\n`

Ink does NOT use Node's `readline.emitKeypressEvents`. It has its own parser:

```typescript
// Ink's parse-keypress.ts
if (s === '\r' || s === '\x1b\r') {
    key.name = 'return';    // → maps to key.return = true in useInput
} else if (s === '\n') {
    key.name = 'enter';     // → NO corresponding boolean in Key type
}
```

Then in `useInput`, the Key object:
```typescript
return: keypress.name === 'return',  // true ONLY for \r
```

**`\n` sets `key.name = 'enter'` but Ink's Key type has no `enter` boolean.** It falls through — the submit handler never fires. This is why `\n` "appears" but does nothing.

## Finding 4: Autocomplete Swallows Enter

Even with `\r`, Claude Code's autocomplete dropdown intercepts Enter before the submit handler. Confirmed in [GitHub issue #15553](https://github.com/anthropics/claude-code/issues/15553).

When text is injected:
1. Text arrives in the input field
2. Autocomplete opens (it watches input changes)
3. `\r` arrives → autocomplete's Enter handler fires first → selects autocomplete item
4. Submit handler never sees the Enter

**The workaround:** dismiss autocomplete with Escape before sending Enter.

Working sequence observed with tmux `send-keys`:
```
send text  →  wait 300ms  →  send Escape  →  wait 100ms  →  send Enter
```

## Finding 5: xterm.js Input vs Output — Two Different Paths

Critical architectural distinction in xterm.js (confirmed from source at `/Users/dimaunk/dvl/aibanana/xterm.js`):

| Method | Direction | What it does |
|--------|-----------|--------------|
| `terminal.write(data)` | **Output** (PTY → screen) | Parses ANSI sequences, renders to screen. Does NOT send to PTY. |
| `terminal.input(data)` | **Input** (screen → PTY) | Fires `onData` event. Application sends to PTY. Nothing rendered. |
| `terminal.onData` event | **Input** (keyboard → PTY) | Fires when user types. Application sends to PTY. |

When a user presses "1" then Enter in xterm.js:
1. `_keyDown` → `evaluateKeyboardEvent()` → produces `"1"` → fires `onData("1")`
2. `_keyDown` → `evaluateKeyboardEvent()` → produces `"\r"` → fires `onData("\r")`
3. Application wiring: `terminal.onData(data => pty.write(data))`

**Bytes sent to PTY: `"1"` then `"\r"`** — NOT `"1\n"`.

NAP's terminal wiring is correct. The problem is in the poke delivery path.

## Finding 6: Ink's Full stdin Pipeline

Confirmed: pty.write() data DOES reach Ink's useInput handler. The pipeline:

```
pty.write(bytes)
  → kernel PTY line discipline (master → slave)
  → process.stdin (tty.ReadStream on slave fd, isTTY=true)
  → Ink's handleReadable() → stdin.read()
  → inputParser → parseKeypress()
  → useInput callback fires
```

The bytes arrive. The issue is purely at the application layer (autocomplete interception).

## The Fix

### In message-queue.ts — three-step delivery

Replace the current single write:
```typescript
// BEFORE (broken)
writeFn(id, msg + '\n');
```

With a three-step sequence:
```typescript
// AFTER (working)
writeFn(id, msg);                    // 1. send text
// wait 300ms
writeFn(id, '\x1b');                 // 2. dismiss autocomplete
// wait 100ms
writeFn(id, '\r');                   // 3. submit
```

The message queue already has a delay mechanism (`DELIVERY_DELAY_MS`). This needs to be adapted to support multi-step delivery for a single poke.

### For permission prompts (single keypress)

Permission prompts ("1. Yes  2. No") may process single keypresses immediately without needing Enter. Test if just sending `"1"` works for these — no Escape or Enter needed.

### Test matrix

| Input | Expected |
|-------|----------|
| `text` → 300ms → `\x1b` → 100ms → `\r` | **Should work** — matches tmux workaround |
| `text\r` (single write) | Autocomplete swallows Enter |
| `text\n` | `\n` not recognized as Enter by Ink |
| `text\r\n` | Two unrecognized actions, no submit |
| `"1"` alone (permission prompt) | May auto-select without Enter |

## Key Source Files Referenced

| File | What |
|------|------|
| `xterm.js/src/browser/Terminal.ts:1001-1083` | Keyboard event → escape sequence conversion |
| `xterm.js/src/common/services/CoreService.ts:58-78` | `triggerDataEvent()` — fires onData to PTY |
| `xterm.js/src/common/input/WriteBuffer.ts` | `.write()` path — output parsing, not input |
| `node-pty/src/unix/pty.cc:314-349` | Termios defaults (ICRNL, ICANON, ECHO) |
| `node-pty/src/unixTerminal.ts:106-112` | Master fd used for read/write streams |
| `nap/src/main/message-queue.ts:40` | Current poke write — `msg + '\n'` |
| `nap/src/main/main.ts:88-90` | `writeToPty()` — pty.process.write() |
| Ink `src/components/App.tsx` | handleReadable, raw mode setup |
| Ink `src/parse-keypress.ts` | `\r` → 'return' vs `\n` → 'enter' distinction |
| Ink `src/hooks/use-input.ts` | useInput hook, Key type (has `return`, no `enter`) |
| [claude-code#15553](https://github.com/anthropics/claude-code/issues/15553) | Autocomplete intercepts Enter — Escape workaround |
