import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, type PathLike } from 'node:fs';
import type * as Fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realPathOf } from './fence.js';
import { observeReach, WriteJournal } from './observe.js';
import { observation } from './types.js';

/*
 * Windows' JavaScript `realpathSync` leaves a substituted drive (`subst`), an 8.3 short name or a drive letter's case as the
 * caller spelled it; only `realpathSync.native` canonicalises them. Here the JavaScript form answers every path as given, and the
 * native form resolves it, so the two spellings of one workspace differ as they do there. The run host notes a native write
 * against `realPathOf` (the native resolution, `run-host/tools.ts`), so the observation must take its root the same way.
 */
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof Fs>();
  const asGiven = Object.assign((p: PathLike) => String(p), { native: fs.realpathSync.native });
  return { ...fs, realpathSync: asGiven, default: { ...fs, realpathSync: asGiven } };
});

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rotaris-observe-root-'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'src', 'a.ts'), 'export const total = 1;\n');
  writeFileSync(join(root, 'docs', 'notes.md'), '# notes\n');
});
afterEach(() => { rmSync(`${root}-alias`, { force: true }); rmSync(root, { recursive: true, force: true }); });

describe('observeReach takes its root in the spelling the native writes are noted in (OQ-245, fin36\'s review)', () => {
  it('a workspace whose two resolutions differ is walked, and a sibling\'s noted write is left out', async () => {
    // docs/defects/fixed/a-siblings-native-write-is-not-subtracted-from-an-observation-taken-through-a-symlinked-workspace.md:
    // resolved with the JavaScript `realpathSync`, the alias was walked as given and nothing was observed.
    const alias = `${root}-alias`;
    symlinkSync(root, alias, 'dir');
    const journal = new WriteJournal();
    const obs = await observeReach({ root: alias, reach: { base: '' }, journal, agent: 'refactorer' }, async () => {
      writeFileSync(join(root, 'src', 'a.ts'), 'export const sum = 1;\n');
      writeFileSync(join(root, 'docs', 'notes.md'), 'sibling\n');
      journal.note('sibling', [join(realPathOf(alias), 'docs', 'notes.md')]);
      return observation('ok');
    });
    expect(obs.observedPaths).toEqual(['src/a.ts']);
  });
});
