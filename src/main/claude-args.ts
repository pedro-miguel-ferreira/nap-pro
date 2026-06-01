/**
 * Build the argv for spawning `claude` directly (no shell, no interpolation).
 * Replaces the old `bash -c "claude ... '${prompt}'"` pattern, which was
 * vulnerable to shell injection via the model id and required brittle quote
 * escaping for the prompt.
 *
 * Validates inputs defensively — even though the spawn is now arg-array based
 * (no shell), garbage values still produce verbose claude errors at runtime.
 * Better to reject early.
 */

const MODEL_ID = /^[a-zA-Z0-9._-]+$/;
// Accept any reasonable id (CC uses UUIDs but tests use synthetic shorter ids).
// The real defense is execve — args are never shell-interpreted regardless.
const SESSION_ID = /^[a-zA-Z0-9._-]+$/;

/**
 * Process-wide permissions config applied to every spawned `claude` invocation.
 * Set once at app startup via `setPermissionsSettingsPath`. Tests leave it null
 * and assert no permission flags are emitted.
 */
let _permissionsSettingsPath: string | null = null;

export function setPermissionsSettingsPath(p: string | null): void {
  _permissionsSettingsPath = p;
}

export function getPermissionsSettingsPath(): string | null {
  return _permissionsSettingsPath;
}

export interface ClaudeSpawnArgs {
  sessionId: string;
  /** Claude model id (e.g. claude-opus-4-7); null/undefined uses CC default. */
  model?: string | null;
  /** Initial prompt text. Passed as a positional arg, no shell interpretation. */
  prompt?: string | null;
  /** When true, builds `--resume <sessionId>` instead of `--session-id <sessionId>`. */
  resume?: boolean;
  /** When true, omits --verbose. Default false (we want verbose for transcripts). */
  quiet?: boolean;
}

export function buildClaudeArgs(opts: ClaudeSpawnArgs): string[] {
  if (!SESSION_ID.test(opts.sessionId)) {
    throw new Error(`invalid session id: ${opts.sessionId}`);
  }
  if (opts.model != null && !MODEL_ID.test(opts.model)) {
    throw new Error(`invalid model id: ${opts.model}`);
  }

  const out: string[] = [];
  if (!opts.quiet) out.push('--verbose');
  if (opts.resume) {
    out.push('--resume', opts.sessionId);
  } else {
    out.push('--session-id', opts.sessionId);
  }
  if (opts.model) {
    out.push('--model', opts.model);
  }
  // Point CC at the project's permissions file. The file itself dictates
  // defaultMode + deny/ask/allow — keeping the CLI free of permission flags
  // means edits to .nap/permissions.json are always authoritative without
  // a CLI override fighting them.
  if (_permissionsSettingsPath) {
    out.push('--settings', _permissionsSettingsPath);
  }
  if (opts.prompt && opts.prompt.length > 0) {
    out.push(opts.prompt);
  }
  return out;
}
