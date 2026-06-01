/**
 * Identifier validation for anything that lands in a filesystem path or shell
 * command. Centralized so every entry point uses the same rules.
 *
 * The accepted character set is intentionally narrow:
 *   - alphanumerics
 *   - hyphen, underscore, dot
 *   - 1-100 characters
 *   - no leading dot, no `..` segments
 *
 * That covers napkin slugs (e.g. "0100-feature"), agent names (e.g.
 * "001-test-arch"), role names (e.g. "fs-eng"), workflow names. Anything
 * outside this is rejected — particularly path separators, shell metacharacters,
 * and parent-dir traversal.
 */

const ALLOWED = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

export type IdentifierKind =
  | 'napkin-slug'
  | 'agent-name'
  | 'architect-name'
  | 'role-name'
  | 'workflow-name'
  | 'nepic-slug';

export interface ValidationResult {
  ok: boolean;
  /** Human-friendly reason on failure. */
  reason?: string;
}

export function validateIdentifier(value: string, kind: IdentifierKind): ValidationResult {
  if (typeof value !== 'string') {
    return { ok: false, reason: `${kind} must be a string` };
  }
  if (value.length === 0) {
    return { ok: false, reason: `${kind} cannot be empty` };
  }
  if (value.length > 100) {
    return { ok: false, reason: `${kind} cannot exceed 100 characters` };
  }
  if (value === '.' || value === '..') {
    return { ok: false, reason: `${kind} cannot be '.' or '..'` };
  }
  if (value.includes('..')) {
    return { ok: false, reason: `${kind} cannot contain '..'` };
  }
  if (value.includes('/') || value.includes('\\')) {
    return { ok: false, reason: `${kind} cannot contain path separators` };
  }
  if (!ALLOWED.test(value)) {
    return {
      ok: false,
      reason: `${kind} must be 1-100 chars of [a-zA-Z0-9._-], starting with alphanumeric`,
    };
  }
  return { ok: true };
}

/** Throw a clean error if invalid. Use at IPC / socket boundaries. */
export function assertValidIdentifier(value: string, kind: IdentifierKind): void {
  const r = validateIdentifier(value, kind);
  if (!r.ok) throw new Error(`invalid ${kind}: ${r.reason ?? value}`);
}
