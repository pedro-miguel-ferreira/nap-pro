# TypeScript Migration + electron-vite — Done

## What changed

All source files converted from JS/JSX to TS/TSX. Replaced esbuild with electron-vite for HMR dev workflow.

### Files created
- `tsconfig.json` — strict mode, ES2022, react-jsx, noEmit
- `src/types/electron-api.d.ts` — types for `window.electronAPI` (preload bridge)
- `src/main/main.ts` — from main.js, added dev/prod URL switching
- `src/main/preload.ts` — from preload.js
- `src/renderer/index.tsx` — from index.jsx
- `src/renderer/components/Terminal.tsx` — from Terminal.jsx
- `electron.vite.config.ts` — main/preload/renderer build config

### Files deleted
- `src/main/main.js`
- `src/main/preload.js`
- `src/renderer/index.jsx`
- `src/renderer/components/Terminal.jsx`

### Files modified
- `package.json` — electron-vite scripts, removed esbuild, added typescript + type packages
- `src/renderer/index.html` — Vite module script entry, updated CSP for dev server
- `.gitignore` — added `out/`

## Build pipeline

```
npm run dev    →  electron-vite dev server, HMR for renderer, auto-rebuild main/preload
npm run build  →  electron-vite build → out/main/ + out/preload/ + out/renderer/
npm start      →  build + electron .
```

- Dev: main.ts loads `ELECTRON_RENDERER_URL` (Vite dev server with HMR)
- Prod: main.ts loads `out/renderer/index.html`

## Decisions

- **No `any` types.** Only cast: `process.env` spread as `Record<string, string>` for node-pty.
- **`skipLibCheck: true`** — avoids DOM/Node type declaration conflicts (standard for Electron).
- **electron-vite over electronmon** — project will have many React components; HMR preserves state during iteration.

## Verification

- `tsc --noEmit` — zero errors
- `npm run build` — succeeds, output in `out/`
