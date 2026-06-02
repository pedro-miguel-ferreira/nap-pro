// ── Dot style — pure function for role colors + status shapes ──
//
// Two dimensions in one dot:
//   COLOR = role (encodes the pipeline visually)
//   SHAPE = status (running/done/exited)
//
// Exited is the only status that overrides role color (all exited dots are gray).

export type DotShape = 'filled' | 'dashed-check' | 'hollow' | 'paused';

export interface DotStyle {
  color: string;
  shape: DotShape;
}

const ROLE_COLORS: Record<string, string> = {
  'test-arch': '#f59e0b',        // orange
  'fs-eng': '#22c55e',           // green
  'test-eng': '#6b7280',         // gray
  'architect': '#3b82f6',        // blue
  'guardian': '#a855f7',         // purple
  'eng-reviewer': '#ec4899',     // pink — fresh-eyes engineering review
  'product-reviewer': '#eab308', // amber — PM lens
  'designer': '#d946ef',         // magenta — Figma → design.md translator
  'ai-researcher': '#06b6d4',    // cyan — SOTA model research → research.md
};

const DEFAULT_COLOR = '#3b82f6';  // blue for unknown roles
const EXITED_COLOR = '#6b7280';   // gray overrides role color when exited

export interface DotInput {
  role: string;
  running: boolean;
  paused?: boolean;
  done: boolean;
  exited: boolean;
  archived?: boolean;
}

export function dotStyle(input: DotInput): DotStyle {
  // Archived: gray hollow (same visual as exited)
  if (input.archived) {
    return { color: EXITED_COLOR, shape: 'hollow' };
  }

  // Exited overrides role color — all exited dots are gray hollow
  if (input.exited && !input.done) {
    return { color: EXITED_COLOR, shape: 'hollow' };
  }

  const color = ROLE_COLORS[input.role] ?? DEFAULT_COLOR;

  // Paused: role color + pause-bar shape (renders ‖ in the dot)
  if (input.paused) {
    return { color, shape: 'paused' };
  }

  // Done = role color + dashed border + checkmark
  if (input.done) {
    return { color, shape: 'dashed-check' };
  }

  // Running or waiting = role color + filled
  return { color, shape: 'filled' };
}

export function roleColor(role: string): string {
  return ROLE_COLORS[role] ?? DEFAULT_COLOR;
}
