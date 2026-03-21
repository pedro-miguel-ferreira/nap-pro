# Fullstack Engineer — 0200 Multi-Terminal + Sidebar

## Your role

You are a fullstack engineer. Read your role definition first.

**Read this file:** `.napkins/00-org/roles/fullstack-eng.md`

## Your job

Add multi-terminal support and a sidebar to the existing Electron app. Currently the app has a single terminal filling the whole window. You'll add a zustand store, a sidebar with agent cards, and terminal switching.

## Mandatory reading

Read all of these before writing any code:

1. `.napkins/00-org/00-promise.md`
2. `.napkins/30-doing/0200-multi-terminal-sidebar/0200-multi-terminal-sidebar.napkin.md`
3. `.napkins/30-doing/0200-multi-terminal-sidebar/0200-multi-terminal-sidebar.spec.md`
4. `.napkins/30-doing/0200-multi-terminal-sidebar/0200-multi-terminal-sidebar.journeys.md`
5. `.napkins/30-doing/0200-multi-terminal-sidebar/0200-multi-terminal-sidebar.test.md`

## Existing code to understand

Read all existing source files before writing anything:

- `src/main/main.ts` — main process, currently manages one pty
- `src/main/preload.ts` — IPC bridge
- `src/renderer/index.tsx` — React entry
- `src/renderer/components/Terminal.tsx` — xterm.js component (currently a single terminal)
- `src/types/electron-api.d.ts` — preload API types
- `package.json` — current deps (react 18, zustand not yet installed)
- `electron.vite.config.ts` — build config

## Key architecture decisions from the spec

- **Zustand store** for terminal metadata (id, name, status, parentId). Terminal/pty objects live in a Map outside React — React re-renders must not touch Terminal instances.
- **Terminal switching** = reparent xterm.element DOM node into a container div. After reparent: fitAddon.fit().
- **If WebGL breaks on reparent**: fallback is dispose WebGL addon, create new one, terminal.loadAddon(). Test the simple path (just reparent) first.
- **Background terminals**: pty.onData still calls xterm.write() when terminal is not in DOM. xterm buffers internally.
- **Sidebar**: ~250px, Cmd+B toggles, cards show name + status dot + parent name.
- **Main process** needs to manage multiple ptys now. IPC messages need a terminal ID to route correctly.

## What to produce

- Install zustand
- Zustand store for terminal state
- Sidebar component with agent cards
- Updated Terminal component that works with multiple terminals
- Updated main process IPC to handle multiple ptys
- Updated preload to include terminal ID in messages
- A way to create new terminals (for now: a button in the sidebar, or Cmd+T — this will be replaced by CLI `nap start` in 0300)
- Run `tsc --noEmit` — zero errors
- Run `npm run dev` — verify multi-terminal works

## Constraints

- All code is TypeScript. Zero type errors.
- Keep the Terminal component clean — it will be reused.
- Don't break the existing single-terminal experience (it becomes the "first terminal" that launches on app start).

## When done

Write a brief summary to:
`.napkins/30-doing/0200-multi-terminal-sidebar/agents/001-fs-eng-multi-terminal/response.md`

## When stuck

Write your question to:
`.napkins/30-doing/0200-multi-terminal-sidebar/agents/001-fs-eng-multi-terminal/questions.md`
