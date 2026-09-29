import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILD_ID_ASSET, THIRD_PARTY_LICENSES_ASSET, buildIdentifier, thirdPartyLicensesPath } from './about.js';
import { NOTICES_FILE } from '../../../../tools/notices/notices.mjs';
import { BUILD_ID_FILE } from '../../../../tools/build-id/build-id.mjs';

/**
 * The About page's two bundled assets (REQ-SHELL-140, REQ-SHELL-142), read from `process.resourcesPath` the way a
 * packaged build reads them. The licence bundle's name is REQ-STARTUP-141's, case included: until 2026-09-27 the
 * reader looked for `third-party-licenses.txt`, which a case-insensitive filesystem answered for the upper-case file
 * and a Linux one did not (`docs/defects/fixed/the-about-page-looks-for-the-licence-bundle-under-a-lowercase-name.md`).
 * The second case below fails on every platform against that name: on Linux the reader finds nothing, and elsewhere
 * it answers a path spelled differently from the file the generator wrote.
 */
/** The reader's second candidate, `apps/desktop/resources/<name>`: its trimmed text, or null when it holds none. */
function sourceTreeAnswer(name: string): string | null {
  try { return readFileSync(join(__dirname, '..', '..', 'resources', name), 'utf8').trim() || null; } catch { return null; }
}

describe('REQ-STARTUP-141 / REQ-SHELL-142: the About page opens the file the notices generator writes', () => {
  const holder = process as unknown as { resourcesPath?: string };
  const before = holder.resourcesPath;
  let resources: string;
  beforeEach(() => { resources = mkdtempSync(join(tmpdir(), 'rotaris-about-')); holder.resourcesPath = resources; });
  afterEach(() => {
    // Electron declares `resourcesPath` on every process; under Vitest it is absent until a test sets it.
    if (before === undefined) delete holder.resourcesPath;
    else holder.resourcesPath = before;
    rmSync(resources, { recursive: true, force: true });
  });

  it('names the bundle exactly as REQ-STARTUP-141 does, and as the generator writes it', () => {
    expect(THIRD_PARTY_LICENSES_ASSET).toBe('THIRD-PARTY-LICENSES.txt');
    expect(THIRD_PARTY_LICENSES_ASSET).toBe(NOTICES_FILE);
  });

  it('finds the bundle the generator names under the resources path, by that exact spelling', () => {
    const bundled = join(resources, NOTICES_FILE);
    writeFileSync(bundled, 'Rotaris — third-party software notices\n');
    expect(thirdPartyLicensesPath()).toBe(bundled);
  });

  it('takes the absent branch when the resources path carries no bundle', () => {
    // The source tree's `resources/` is the reader's second candidate, and a build of this worktree may have written
    // the bundle there (first-release-plan.md §4.4); absent means neither candidate holds it.
    const sourceTree = join(__dirname, '..', '..', 'resources', NOTICES_FILE);
    expect(thirdPartyLicensesPath()).toBe(existsSync(sourceTree) ? sourceTree : null);
  });

  it('names the build identifier\'s asset as the writer does (REQ-SHELL-140, first-release-plan.md §4.4)', () => {
    expect(BUILD_ID_ASSET).toBe('build-id.txt');
    expect(BUILD_ID_ASSET).toBe(BUILD_ID_FILE);
  });

  it('reads back the one line the writer writes: a commit name, `-dirty` when the tree differed', () => {
    const id = `${'0123456789abcdef'.repeat(2)}01234567-dirty`;
    writeFileSync(join(resources, BUILD_ID_FILE), `${id}\n`);
    expect(buildIdentifier()).toBe(id);
  });

  it('reads the build identifier from its own asset, and passes over an empty one', () => {
    writeFileSync(join(resources, BUILD_ID_ASSET), '  0.1.0+abc1234\n');
    expect(buildIdentifier()).toBe('0.1.0+abc1234');
    // An empty asset says nothing, so the reader goes on to the source tree's `resources/`, which a build of this
    // worktree may have written (first-release-plan.md §4.4); the answer is that candidate's, whatever it holds.
    writeFileSync(join(resources, BUILD_ID_ASSET), '\n');
    expect(buildIdentifier()).toBe(sourceTreeAnswer(BUILD_ID_ASSET));
  });
});
