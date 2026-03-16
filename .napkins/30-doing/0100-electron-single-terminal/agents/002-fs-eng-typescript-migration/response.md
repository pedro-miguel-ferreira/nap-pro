# TypeScript Migration — Done

## What changed

All source files converted from JS/JSX to TS/TSX. Zero behavior changes.

### Files created
- `tsconfig.json` — strict mode, ES2022, react-jsx, noEmit
- `src/types/electron-api.d.ts` — types for `window.electronAPI` (preload bridge)
- `src/main/main.ts` — from main.js
- `src/main/preload.ts` — from preload.js
- `src/renderer/index.tsx` — from index.jsx
- `src/renderer/components/Terminal.tsx` — from Terminal.jsx

### Files deleted
- `src/main/main.js`
- `src/main/preload.js`
- `src/renderer/index.jsx`
- `src/renderer/components/Terminal.jsx`

### Files modified
- `package.json` — added `typescript`, `@types/node`, `@types/react`, `@types/react-dom` to devDependencies; added `typecheck` script; updated `build` script; changed `"main"` to `dist/main.js`
- `.gitignore` — no changes needed (`dist/` was already ignored)

## Build pipeline

All compiled output goes to `dist/`:

```
npm run build  →  esbuild compiles src/main/main.ts    → dist/main.js    (CJS, node)
                  esbuild compiles src/main/preload.ts  → dist/preload.js (CJS, node)
                  esbuild bundles  src/renderer/index.tsx → dist/index.js  (browser)
```

- `"main": "dist/main.js"` — Electron entry point
- preload: `path.join(__dirname, 'preload.js')` — works because both are in `dist/`
- HTML: `path.join(__dirname, '..', 'src', 'renderer', 'index.html')` — reaches back to src for the static HTML

## Decisions

- **No `any` types.** The only cast is `process.env` spread into node-pty's env option as `Record<string, string>` — node-pty expects string values, `process.env` values are `string | undefined`.
- **`skipLibCheck: true`** in tsconfig — avoids false positives from conflicting DOM/Node type declarations (common in Electron projects).

## Verification

- `tsc --noEmit` — zero errors
- `npm run build` — succeeds, all output in `dist/`
