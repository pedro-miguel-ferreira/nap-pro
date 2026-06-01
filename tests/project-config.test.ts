import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  readProjectConfig,
  writeProjectConfig,
  getProjectConfigPath,
} from '../src/main/project-config';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-projcfg-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readProjectConfig', () => {
  it('returns an empty config when the file is missing', async () => {
    const cfg = await readProjectConfig(tmpDir);
    expect(cfg).toEqual({});
  });

  it('returns an empty config when the file is malformed', async () => {
    await fsPromises.mkdir(path.join(tmpDir, '.nap'), { recursive: true });
    await fsPromises.writeFile(path.join(tmpDir, '.nap', 'config.json'), 'not json');
    const cfg = await readProjectConfig(tmpDir);
    expect(cfg).toEqual({});
  });

  it('reads recognized fields and drops unknown/wrong-type ones', async () => {
    await fsPromises.mkdir(path.join(tmpDir, '.nap'), { recursive: true });
    await fsPromises.writeFile(
      path.join(tmpDir, '.nap', 'config.json'),
      JSON.stringify({
        prTitlePrefix: '[Apps]',
        worktreeBaseDir: '~/coda-worktrees',
        defaultWorkflow: 'feature-from-spec',
        extraJunk: 'ignored',
        prTitlePrefix2: 42, // wrong type
      }),
    );
    const cfg = await readProjectConfig(tmpDir);
    expect(cfg).toEqual({
      prTitlePrefix: '[Apps]',
      worktreeBaseDir: '~/coda-worktrees',
      defaultWorkflow: 'feature-from-spec',
    });
  });
});

describe('writeProjectConfig', () => {
  it('creates .nap/ if missing and round-trips', async () => {
    expect(fs.existsSync(path.join(tmpDir, '.nap'))).toBe(false);
    await writeProjectConfig(tmpDir, { prTitlePrefix: '[X]' });
    expect(fs.existsSync(getProjectConfigPath(tmpDir))).toBe(true);

    const back = await readProjectConfig(tmpDir);
    expect(back).toEqual({ prTitlePrefix: '[X]' });
  });

  it('sanitizes writes — only recognized fields land on disk', async () => {
    await writeProjectConfig(tmpDir, {
      prTitlePrefix: '[Y]',
      // @ts-expect-error — intentionally passing junk to verify sanitize()
      bogus: 'gone',
    });
    const raw = JSON.parse(
      await fsPromises.readFile(getProjectConfigPath(tmpDir), 'utf-8'),
    );
    expect(raw).toEqual({ prTitlePrefix: '[Y]' });
  });
});
