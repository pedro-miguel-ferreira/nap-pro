# 001-fs-eng-multi-terminal — Response

## What was built

Multi-terminal support with sidebar. The app now manages N terminals simultaneously with instant switching via DOM reparenting.

### Files changed

| File | What |
|------|------|
| `src/main/main.ts` | Multi-pty management. Single pty replaced with `Map<id, IPty>`. Per-terminal output buffering. Menu with Cmd+B (toggle sidebar) and Cmd+T (new terminal). |
| `src/main/preload.ts` | All IPC methods now take terminal ID. Added `create`, `kill`, `onToggleSidebar`, `onCreateTerminal`. |
| `src/types/electron-api.d.ts` | Updated to match new IPC signatures. |
| `src/renderer/terminal-registry.ts` | **New.** Terminal/FitAddon instances live in a `Map` outside React. Creates xterm instances, defers `open()` and WebGL loading until first display. |
| `src/renderer/store.ts` | **New.** Zustand store. Holds metadata only (`id, name, status, parentId, createdAt`). Actions: `createTerminal`, `removeTerminal`, `setActive`, `setStatus`, `toggleSidebar`. |
| `src/renderer/components/Sidebar.tsx` | **New.** 250px left panel with agent cards (name, status dot, parent name). "+" button to create terminals. |
| `src/renderer/components/Terminal.tsx` | Rewritten. Container div receives active terminal's DOM element via reparenting. ResizeObserver handles both window resize and sidebar toggle. |
| `src/renderer/index.tsx` | App layout (flex row: sidebar + terminal panel). Global IPC data routing. Creates first terminal on mount. |
| `package.json` | Added `zustand` dependency. |

### Architecture decisions

1. **Terminal instances outside React.** xterm.js `Terminal` and `FitAddon` live in a plain `Map` in `terminal-registry.ts`. The zustand store holds only serializable metadata. React re-renders never touch terminal objects (T-0200-07).

2. **Deferred `open()`.** Terminals are created without calling `terminal.open()` — xterm buffers writes internally. `open()` + WebGL addon loading happen on first display, directly into the visible container. This avoids offscreen WebGL initialization issues.

3. **DOM reparenting for switching.** On switch: clear container → if first display, `open(container)`; otherwise `appendChild(terminal.element)` → `fitAddon.fit()` → `pty.resize()`. Simple path per spec — WebGL dispose/re-init is the backup if context loss happens on reparent.

4. **ResizeObserver instead of window resize + sidebar toggle handlers.** A single `ResizeObserver` on the terminal container detects size changes from any source (window resize, sidebar toggle) and refits with 50ms debounce. Cleaner than separate event handlers.

5. **Renderer-driven pty creation.** Main process no longer spawns a pty in `createWindow`. The renderer sends `pty:create` → `pty:resize` → `pty:ready` for each terminal. Main buffers output between create and ready, then flushes.

6. **Menu accelerators for shortcuts.** Cmd+B and Cmd+T are registered as Electron menu accelerators, intercepted before reaching the terminal. Added standard Edit menu (copy/paste) and View menu (reload, devtools).

### Testing approach — proposal for architect

The test cases split into two layers, but the interesting insight is that the Electron-dependent tests don't need UI automation. Playwright's Electron support gives direct access to the renderer's JS context and main process. Tests can call store actions, read xterm buffers, inspect DOM state, and send IPC — all programmatically, no button clicking.

**Layer 1: Vitest + jsdom** (pure logic, no Electron needed)
- T-0200-06 (exit updates card status) — call `setStatus()`, assert store state
- T-0200-07 (terminal objects outside React) — create terminals, trigger re-renders, assert `Map` identity is stable
- T-0200-08 (first terminal stays at top) — create 5 terminals, assert ordering

**Layer 2: Playwright + Electron** (real app, driven by scripts not clicks)

These run in the real Electron process with real pty, real xterm.js, real WebGL, real DOM — but driven through `page.evaluate()` calling store/registry directly:

```typescript
// Launch real app
const app = await electron.launch({ args: ['./out/main/main.js'] });
const page = await app.firstWindow();

// T-0200-01: switching preserves scrollback
await page.evaluate(() => {
  // create terminals, switch, read buffer.active.length — no clicking
});

// T-0200-03: background output
await page.evaluate(() => {
  // read xterm buffer of hidden terminal, verify line count + content
});

// T-0200-05: sidebar toggle refit
await app.evaluate(({ BrowserWindow }) => {
  // send sidebar:toggle IPC directly, then check terminal cols in renderer
});
```

This gives integration coverage of the full stack (Electron main ↔ IPC ↔ pty ↔ xterm ↔ DOM ↔ WebGL) without coupling tests to UI layout. UI button tests can come later as a separate concern.

The key APIs that make this possible:
- `page.evaluate()` — run JS in the renderer (access store, registry, DOM)
- `app.evaluate()` — run JS in the main process (send IPC, inspect pty state)
- `page.waitForFunction()` — poll renderer state until assertion passes (handles async pty output)

### Build status

- `tsc --noEmit` — zero errors
- `electron-vite build` — success
