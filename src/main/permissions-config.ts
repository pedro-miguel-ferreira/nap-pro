import * as fsPromises from 'fs/promises';
import * as path from 'path';

/**
 * `.nap/permissions.json` is the authoritative source for agent permissions —
 * defaultMode, deny, ask, allow, everything. The app seeds this file with
 * sensible defaults on first run, then leaves it alone. Edit it directly to
 * tighten or relax rules; agents pick up the new file on their next spawn.
 *
 * Schema mirrors CC's `permissions` block in settings.json:
 *   - defaultMode: 'bypassPermissions' | 'acceptEdits' | 'plan' | 'default'
 *   - deny: hard block (honored even under bypassPermissions)
 *   - ask:  prompt the human (interactive — useful for risky-but-sometimes-fine ops)
 *   - allow: explicit allow (mostly redundant under bypassPermissions)
 */
export interface PermissionsSettings {
  permissions: {
    defaultMode?: 'bypassPermissions' | 'acceptEdits' | 'plan' | 'default';
    deny?: string[];
    ask?: string[];
    allow?: string[];
  };
}

/**
 * Defaults written on first run only. Reflects the project's intent:
 *   - run agents on bypassPermissions so they don't prompt for routine work
 *   - never let an agent merge or close a PR (deny)
 *   - prompt before destructive folder/git operations (ask) so the human
 *     stays in the loop without blocking the agent outright
 */
export const DEFAULT_PERMISSIONS_SETTINGS: PermissionsSettings = {
  permissions: {
    defaultMode: 'bypassPermissions',
    deny: [
      'Bash(gh pr merge:*)',
      'Bash(gh pr close:*)',
    ],
    ask: [
      'Bash(rm -rf:*)',
      'Bash(rm -fr:*)',
      'Bash(rm -r:*)',
      'Bash(rm -R:*)',
      'Bash(rmdir:*)',
      'Bash(git clean:*)',
      'Bash(git reset --hard:*)',
    ],
  },
};

/**
 * Idempotently materialize `<projectCwd>/.nap/permissions.json`. If the file
 * already exists, leave its contents untouched — the user is the source of
 * truth from that point on. Returns the absolute path either way.
 */
export async function ensurePermissionsSettingsFile(projectCwd: string): Promise<string> {
  const napDir = path.join(projectCwd, '.nap');
  await fsPromises.mkdir(napDir, { recursive: true });
  const settingsPath = path.join(napDir, 'permissions.json');

  let exists = false;
  try {
    await fsPromises.access(settingsPath);
    exists = true;
  } catch {
    // missing — fall through and seed
  }

  if (!exists) {
    await fsPromises.writeFile(
      settingsPath,
      JSON.stringify(DEFAULT_PERMISSIONS_SETTINGS, null, 2) + '\n',
    );
  }

  return settingsPath;
}
