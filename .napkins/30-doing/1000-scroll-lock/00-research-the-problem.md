# Claude Code's persistent terminal scroll-to-top bug

The v2.1.38 "fix" for the VS Code terminal scroll-to-top regression was real but narrow — **the underlying bug persists across all current versions** (through at least v2.1.76 as of March 2026). Multiple open GitHub issues confirm the scroll-to-top problem re-emerged, with users on v2.1.74 calling it a "massive annoying regression" that was supposed to have been resolved. The root cause is architectural: Claude Code uses **Ink (React for CLIs)**, which redraws the entire component area on every state change by moving the cursor far up the terminal buffer, causing the viewport to follow.

This is the single most reported UX issue in Claude Code's history, spanning over 40 GitHub issues, multiple Hacker News threads, blog posts, and community tools built specifically to fix it. Understanding why it happens — and why it specifically triggers when you scroll up first — requires examining how Ink, xterm.js, and VS Code's terminal interact.

---

## How Ink's rendering causes the viewport to jump

Claude Code is a React application rendered through **Ink**, which translates React component trees into ANSI escape sequences. On every re-render (triggered by streaming tokens, status updates, spinner animations — dozens of times per second), Ink executes this sequence:

1. Moves the cursor **UP** to the start of the component area via repeated `\033[A` (cursor-up) sequences
2. Erases all previously rendered lines with `\033[2K` (erase-line)
3. Writes the entirely new content from top to bottom

When output grows large — a common occurrence during streaming LLM responses — `eraseLines(this.height)` issues hundreds of sequential cursor-up movements. Terminal emulators track cursor position, and **VS Code's xterm.js-based terminal moves the viewport to follow the cursor**. This snaps the viewport to the top of the render area.

The specific behavior where **scrolling up first triggers the jump** has a precise explanation. When you're at the bottom, the terminal is in "auto-follow" mode — new output appends and the viewport stays anchored. But once you scroll up, the viewport detaches. On the next Ink re-render, the cursor-up sequences move the cursor position far up into the scrollback buffer, and the viewport follows it there, producing the snap-to-top. Measurements from GitHub issue #9935 show Claude Code generates **4,000–6,700 scroll events per second** in terminal multiplexers, roughly 40–600× higher than normal terminal applications.

Claude Code deliberately does **not** use the alternate screen buffer (`\033[?1049h`), which would completely solve the scroll issue but would break native terminal features Anthropic considers essential: Cmd+F search, text selection, copy/paste, and scrollback browsing. Other AI coding tools (Amp, Google Gemini CLI) tried alternate screen mode and faced immediate backlash.

---

## The v2.1.37 regression and why v2.1.38 didn't fully fix it

The v2.1.37 release (February 7, 2026) introduced a scroll-to-top regression as an undocumented side effect — the changelog only listed a fix for `/fast` availability. Three days later, **v2.1.38** (February 10, 2026) shipped with the explicit note: "Fixed VS Code terminal scroll-to-top regression introduced in 2.1.37."

That fix was narrowly targeted at whatever specific change in v2.1.37 caused the regression to worsen. It did not address the fundamental Ink rendering architecture. Within weeks, the same behavior returned in force:

- **Issue #25682** (v2.1.42, Feb 14, 2026): Scrolling up during processing causes "runaway scroll to top" — a small scroll gesture shoots the viewport hundreds of lines back
- **Issue #33814** (v2.1.74, Mar 13, 2026): "Forces scroll to top when outputting code — NOT just when scrolling." Labeled `regression` by maintainers
- **Issue #34503** (Mar 15, 2026): Terminal scrolls to top on every new output, session-specific
- **Issue #34794** (v2.1.76, Mar 16, 2026): Detailed root cause analysis pointing to Ink's `eraseLines(this.height)` as the culprit
- **Issue #34765**: Scroll position resets to top during active processing

All of these issues remain **open** as of March 18, 2026, and several are labeled as duplicates of each other, confirming Anthropic tracks this as a single ongoing problem.

---

## A year-long trail of scroll issues across 40+ GitHub issues

This is not a new bug. The scroll problem has been Claude Code's most persistent UX issue since April 2025:

| Period | Key issues | What happened |
|--------|-----------|---------------|
| Apr 2025 | #769, #826 | First reports: "stroboscope effect," console scrolling to top of history |
| Jul 2025 | #3648 (282 👍) | "Terminal scrolling uncontrollably — can't stop unless I kill the tab" |
| Oct 2025 | #9001, #10619, #10794 | v2.0.8 scroll regression locks viewport to ~20 lines; flickering crashes VS Code |
| Nov 2025 | #11497, #11578, #11801 | VS Code extension panel auto-scrolling during generation |
| Dec 2025 | Differential renderer ships | ~85% flicker reduction, but scroll-to-top persists |
| Feb 2026 | v2.1.37/v2.1.38 | Narrow regression introduced and patched |
| Mar 2026 | #33814, #34503, #34794 | Scroll-to-top returns; detailed root cause analysis published |

The problem spans **every platform** (macOS, Windows, Linux), **every terminal** (VS Code integrated terminal, iTerm2, Windows Terminal, Warp), and **every terminal multiplexer** (tmux, screen). It is most severe in VS Code's integrated terminal due to xterm.js-specific viewport behavior.

---

## xterm.js has its own history of scroll position bugs

VS Code's terminal is powered by xterm.js, which has a documented history of scroll position reset bugs that compound Claude Code's rendering issues:

**Alternate screen buffer contamination** was a major xterm.js bug where switching to/from the alternate screen buffer (used by vim, less, git log) caused the internal scroll position (`ydisp`) to not be restored properly. The stale position from the alt buffer "contaminated" the normal buffer. This was definitively fixed in **xterm.js PR #5390** (August 2025), which added `syncScrollPosition()` calls during buffer switches.

**Hide/show scroll reset** is a recurring class of xterm.js bugs (VS Code issues #45134, #134692, #143284, #189718) where toggling the terminal panel visibility resets the scrollbar to top. These have been fixed and re-broken multiple times between 2018 and 2025.

**VS Code 1.92 scroll regression** (#224750, August 2024) broke scrolling entirely after exiting fullscreen CLI apps, requiring a fix in xterm.js PR #5127.

The key insight is that xterm.js has **no built-in mechanism to prevent viewport from following cursor movements when the user has scrolled away**. Issue xtermjs/xterm.js#216 explicitly requested this behavior ("if the user is scrolling up and a program adds output, the viewport should not scroll"), but it was only partially addressed.

---

## VS Code settings provide minimal relief

Users have tried every combination of VS Code terminal settings with consistently disappointing results:

- **`terminal.integrated.scrollback`**: Reducing from the default 1000 to 500 delays the onset but doesn't prevent the issue. The render area height still grows within sessions.
- **`terminal.integrated.gpuAcceleration: "off"`**: "Minimal improvement" per multiple issue reporters.
- **`terminal.integrated.smoothScrolling: false`**: No measurable effect on the scroll-to-top behavior.
- **`terminal.integrated.mouseWheelScrollSensitivity`**: Adjusting scroll speed doesn't address the viewport jumping mechanism.

VS Code's integrated terminal has **no scroll lock or scroll position pinning feature**. There is no user-facing setting to prevent the viewport from following cursor movements.

---

## Workarounds that actually work

The community has developed several effective workarounds, ranging from terminal choice to dedicated proxy tools:

**claude-chill** is the most popular solution — a Rust-based PTY proxy that sits between the terminal and Claude Code, intercepting synchronized output blocks and rendering only diffs. Install via `cargo install --git https://github.com/davidbeesley/claude-chill`. It effectively eliminates both flickering and scroll jumping. One caveat: it breaks Ghostty's native scrollback handling.

**Ghostty terminal** supports DEC mode 2026 (synchronized output), which batches all output between sync markers and renders atomically. An Anthropic engineer explicitly recommends Ghostty for zero-flicker Claude Code usage. Anthropic contributed the synchronized output patch to xterm.js (PR #5453, merged) and tmux (PR #4744, accepted).

**bukowski** (github.com/vmitro/bukowski) is a 650-line xterm.js wrapper built by an HN user specifically to solve Claude Code scroll issues by managing a virtual viewport.

**tmux** helps significantly on macOS — multiple users report zero scroll issues — though it eventually breaks down with very large scroll buffers.

**Using iTerm2 or Terminal.app instead of VS Code's integrated terminal** prevents VS Code-specific crashes and reduces severity, though flickering and scroll issues can still occur.

**Behavioral workarounds** include: using `/clear` frequently to reset scrollback, stopping generation before scrolling to review output, keeping sessions short, and restarting Claude Code sessions before significant scrollback accumulates.

---

## Conclusion

The scroll-to-top bug is not a simple regression that can be patched — it is an **architectural consequence** of building a React/Ink terminal UI that performs full-screen redraws via cursor manipulation escape sequences. Anthropic's differential renderer (shipped late 2025) reduced visible flickering by ~85%, but the fundamental mechanism — Ink issuing hundreds of cursor-up movements per re-render — still causes viewport jumping when the user has scrolled away from the bottom.

The v2.1.38 fix addressed only the specific exacerbation introduced in v2.1.37, not the underlying problem. As of March 2026 (v2.1.76), **six open issues** document the ongoing scroll-to-top behavior across macOS and Windows. Issue #34794 provides the most detailed root cause analysis, suggesting three potential fixes: alternate screen buffer (rejected by Anthropic for UX reasons), incremental rendering (partially shipped via differential renderer), and suppressing cursor movement when the user has scrolled away (not yet implemented).

For users experiencing this today, **claude-chill is the most effective immediate solution**. Switching to Ghostty terminal eliminates flickering entirely. Within VS Code specifically, no combination of settings resolves the issue — the limitation is in xterm.js's viewport-follows-cursor behavior combined with Ink's rendering strategy.