# 0400 — poke, nap, done: implementation response

## What was built

Three new commands added to the socket server and CLI: `poke`, `nap`, and `done`. These form the agent-to-agent communication layer — one agent can send a message to another, wait for it to finish, and receive a result.

### Files changed

- **`src/shared/protocol.ts`** — Added `PokeRequest`, `StatusRequest`, `DoneRequest` to the socket protocol union.
- **`src/main/session-store.ts`** — Extended `Session.status` to include `'done'`, added `doneMessage?: string` field.
- **`src/main/message-queue.ts`** — New file. Per-terminal message queue with sequential delivery and 500ms delay between messages. Exposes `enqueue(id, msg)`, `setWriter(fn)`, `clearQueue(id)`.
- **`src/main/main.ts`** — Three new socket handlers (`poke`, `status`, `done`), wired up message queue writer, added `clearQueue` on pty kill. Added `socket:status-changed` IPC event to renderer.
- **`src/cli/nap.ts`** — Three new CLI commands: `poke`, `nap` (polling loop), `done` (reads `NAP_SESSION_ID` from env).
- **`src/main/preload.ts`** — Exposed `onSocketStatusChanged` IPC bridge.
- **`src/types/electron-api.d.ts`** — Added `onSocketStatusChanged` to the API type.
- **`src/renderer/index.tsx`** — Listens for `socket:status-changed` and updates store.

### Design decisions

1. **Message queue lives in its own module** (`message-queue.ts`). It takes a writer function via `setWriter()` to decouple from pty internals. Delivery is sequential per-terminal: pop, write, wait 500ms, repeat. New messages enqueued mid-delivery just extend the queue.

2. **`nap nap` uses polling, not long-lived connections.** CLI sends `{ type: "status", name }` every 1s. First poll happens immediately (no wasted 1s on already-done terminals). On done/exited, prints doneMessage and exits 0. On timeout, exits 1 without killing the target.

3. **`nap done` is idempotent.** Second call is a no-op — status stays 'done', doneMessage stays from first call, parent is not poked again.

4. **`nap done` without `NAP_SESSION_ID` fails before connecting.** CLI checks env var first, prints "not running inside nap", exits 1.

5. **Poke to dead terminal rejected at the gate.** Status check happens before enqueue — if target is exited or done, error is returned immediately and nothing is enqueued.

6. **Done message stored on session record.** So `nap nap` can retrieve it even if the poll happens after the done transition.

### Edge cases handled per spec

- Poke to exited/done terminal → error, not enqueued
- `nap nap` on already-done terminal → returns immediately with doneMessage
- `nap done` called twice → second is no-op
- `nap done` with no `NAP_SESSION_ID` → error before socket connection
- Timeout → exit 1, target not killed
- Parent poke on done → only if parent is still running

### Verification

- `tsc --noEmit` — zero errors
- `npm run test:small` — all 22 existing tests pass
