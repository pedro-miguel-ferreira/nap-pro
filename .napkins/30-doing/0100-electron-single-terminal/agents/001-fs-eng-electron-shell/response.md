# 001-fs-eng-electron-shell — Response

## What was built

Electron app with a single fully interactive terminal. Dark window, xterm.js + WebGL, node-pty, IPC bridge with context isolation.

`npm install && npm start` launches it.

## File structure

```
package.json              — electron, xterm.js, node-pty, react 18, esbuild
src/main/main.js          — BrowserWindow + node-pty lifecycle + IPC handlers
src/main/preload.js       — contextBridge exposing pty IPC to renderer
src/renderer/index.html   — entry HTML, dark background, loads bundled JS/CSS
src/renderer/index.jsx    — React 18 entry, renders Terminal component
src/renderer/components/Terminal.jsx — xterm.js component (reusable for 0200)
```

## Architecture decisions

**IPC bridge design.** Preload exposes `window.electronAPI.pty` with five methods: `ready()`, `onData(cb)`, `onExit(cb)`, `write(data)`, `resize(cols, rows)`. Listener methods return cleanup functions for React effect teardown. This is the seam that tests T-0100-01 and T-0100-02 target — data passes as strings through Electron IPC, no binary encoding issues since node-pty's `onData` already emits strings.

**Output buffering.** Main process buffers pty output until the renderer sends `pty:ready`. Without this, the shell prompt and early output would be lost during renderer initialization. The renderer fires `ready()` after mounting xterm and registering its `onData` listener, then the buffer flushes.

**WebGL → canvas → DOM fallback chain.** WebGL addon is attempted first. If it throws (headless CI, broken GPU), canvas addon is loaded. If that also fails, xterm's built-in DOM renderer is used. WebGL context loss during use also triggers canvas fallback. This satisfies T-0100-07.

**Resize debounce.** Window resize events are debounced at 100ms per spec. After `fitAddon.fit()`, the new `cols`/`rows` are sent to the pty via IPC. This is the flow in T-0100-03.

**Process lifecycle.** Window close kills the pty in the `close` event (before window destruction), then `window-all-closed` quits the app. Pty exit keeps the window open, shows `[process exited with code N]`, and disables stdin so typing after exit is a no-op. Covers T-0100-04 and T-0100-05.

**esbuild for bundling.** Simplest path for JSX + xterm.js CSS. Single command, 30ms build, no config file. Outputs `dist/index.js` and `dist/index.css`. The HTML references them with relative paths from `src/renderer/`.

**No webpack/vite.** esbuild handles everything needed for the POC. The only reason a bundler is needed at all is JSX transform + CSS import for xterm.js.

## What to verify

1. **Run `npm start`** — dark window should appear with interactive shell prompt
2. **Type `ls`, `echo hello`** — output appears correctly
3. **Run `printf "\033[31mred\033[0m"`** — "red" should render in red (ANSI codes survive IPC)
4. **Resize the window** — terminal reflows, no artifacts
5. **Type `exit`** — window stays open, shows exit message, typing does nothing
6. **Close window with Cmd+W** — app quits, no orphan processes (`ps aux | grep $SHELL`)
7. **Run `seq 1 50000`** — terminal stays responsive, scrollback works

## Dependency note

The xterm.js addon version ranges in package.json (`@xterm/addon-webgl@^0.18.0`, `@xterm/addon-canvas@^0.7.0`, `@xterm/addon-fit@^0.10.0`) are best-effort estimates. If npm can't resolve them, install without version pins: `npm install @xterm/addon-webgl @xterm/addon-canvas @xterm/addon-fit`. The versions that installed successfully during this build are locked in `package-lock.json`.
