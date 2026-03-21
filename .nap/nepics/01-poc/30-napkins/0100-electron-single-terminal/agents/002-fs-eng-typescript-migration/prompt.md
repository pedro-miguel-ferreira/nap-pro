# Fullstack Engineer — TypeScript Migration

## Your role

You are a fullstack engineer. Read your role definition first.

**Read this file:** `.napkins/00-org/roles/fullstack-eng.md`

## Your job

Convert the existing working Electron app from JavaScript/JSX to TypeScript/TSX. The app works as-is — your job is to migrate it without breaking anything.

## What exists now

```
src/main/main.js          — Electron main process (BrowserWindow + node-pty + IPC)
src/main/preload.js       — contextBridge exposing pty IPC to renderer
src/renderer/index.jsx    — React 18 entry
src/renderer/components/Terminal.jsx — xterm.js terminal component
package.json              — has esbuild for bundling
```

Read all four source files before starting.

## What to do

1. Add `tsconfig.json` — strict mode, target ES2022, JSX react-jsx
2. Add type declarations for the preload API (`window.electronAPI`) — a `src/types/` file or similar
3. Rename all `.js`/`.jsx` files to `.ts`/`.tsx`
4. Add proper types throughout — no `any` unless truly unavoidable
5. Add `typescript` to devDependencies
6. Add a `typecheck` script to package.json: `"typecheck": "tsc --noEmit"`
7. Update the `build` script in package.json to handle `.tsx` entry point
8. Run `tsc --noEmit` — zero errors
9. Run `npm start` — verify the app still works

## Constraints

- Do NOT change any behavior. This is a pure migration.
- Do NOT restructure files or add abstractions.
- The app must still work with `npm start` after migration.
- esbuild handles TS/TSX natively — the build step barely changes (just update the entry point extension).

## When done

Write a brief summary to:
`.napkins/30-doing/0100-electron-single-terminal/agents/002-fs-eng-typescript-migration/response.md`
