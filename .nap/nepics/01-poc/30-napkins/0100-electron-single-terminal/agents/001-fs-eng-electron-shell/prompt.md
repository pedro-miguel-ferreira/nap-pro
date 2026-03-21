# Fullstack Engineer — 0100 Electron App + Single Terminal

## Your role

You are a fullstack engineer. Read your role definition first.

**Read this file:** `.napkins/00-org/roles/fullstack-eng.md`

## Your job

Build the foundation: an Electron app with a single working terminal. Dark window, xterm.js + WebGL, node-pty, fully interactive.

## Mandatory reading

Read all of these before writing any code:

1. `.napkins/00-org/00-promise.md` — why NAP exists
2. `.napkins/30-doing/0100-electron-single-terminal/0100-electron-single-terminal.napkin.md`
3. `.napkins/30-doing/0100-electron-single-terminal/0100-electron-single-terminal.spec.md`
4. `.napkins/30-doing/0100-electron-single-terminal/0100-electron-single-terminal.journeys.md`
5. `.napkins/30-doing/0100-electron-single-terminal/0100-electron-single-terminal.test.md`

## Key constraints from the spec

- Electron 33+ with context isolation and preload script
- Main process owns node-pty, renderer process owns xterm.js
- IPC bridge between them for pty data (this is the critical seam — see test cases T-0100-01 and T-0100-02)
- node-pty: spawn $SHELL with login flag, TERM=xterm-256color
- xterm.js: WebGL addon (fall back to canvas if WebGL fails), addon-fit, 10k scrollback
- Resize: fitAddon.fit() on window resize, debounced 100ms, propagate cols/rows to pty
- Window close → kill pty → quit. Pty exit → keep window open, show exit message
- Dark background (#1e1e1e), minimum size 600x400
- node-pty is a native module — needs electron-rebuild

## Project structure

This is a new project. Set up from scratch:

- `package.json` with electron, xterm.js, node-pty, and build scripts
- Use electron-rebuild or @electron/rebuild for native modules
- Keep it simple: no webpack/vite for POC unless needed for xterm.js CSS
  - xterm.js does need its CSS loaded — figure out the simplest path
- Main process: `src/main/main.js` (or .ts if you prefer, but JS is fine for POC)
- Preload: `src/main/preload.js`
- Renderer: `src/renderer/` — React 18 + simple component(s)
  - The terminal component will be reused in 0200, so make it a clean component
- Entry HTML: `src/renderer/index.html`

## What to produce

- Working Electron app that launches a dark window with a fully interactive terminal
- `npm install && npm start` should work
- Write a brief summary of what you built, decisions made, anything to review to: `.napkins/30-doing/0100-electron-single-terminal/agents/001-fs-eng-electron-shell/response.md`

## When stuck

Write your question to `.napkins/30-doing/0100-electron-single-terminal/agents/001-fs-eng-electron-shell/questions.md` and stop.
