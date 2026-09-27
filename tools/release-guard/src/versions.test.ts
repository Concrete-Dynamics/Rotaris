import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseReleaseVersion } from '@rotaris/release-naming';
import { PRODUCT_VERSION_PLACES, readDeclaredVersions, versionMismatch, type VersionPlace } from './versions.js';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const scratch: string[] = [];
afterEach(() => { for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true }); });

/** A repository holding exactly the given files. */
function repoWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'release-guard-'));
  scratch.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}

const DESKTOP: VersionPlace = { file: 'apps/desktop/package.json', field: 'version' };
const OTHER: VersionPlace = { file: 'build/product.json', field: 'productVersion' };

describe('where the product version is declared — REQ-STARTUP-158 (the decision this guard records)', () => {
  it('is one place, the desktop application manifest electron-builder packs and the running app reads back', () => {
    expect(PRODUCT_VERSION_PLACES).toEqual([DESKTOP]);
  });

  it('that place declares a supported product version, and the workspace root declares none at all', () => {
    const [declared] = readDeclaredVersions(REPO);
    expect(declared!.value).not.toBeNull();
    expect(parseReleaseVersion(declared!.value!).version).toBe(declared!.value);
    expect(JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))).not.toHaveProperty('version');
  });
});

describe('reading the declared versions', () => {
  it('reads each place, and a place that cannot be read declares no version rather than throwing', () => {
    const root = repoWith({
      'apps/desktop/package.json': JSON.stringify({ name: 'x', version: '0.1.0' }),
      'a.json': '{ not json',
      'b.json': JSON.stringify({ name: 'no version' }),
      'c.json': JSON.stringify({ version: 1 }),
    });
    const read = readDeclaredVersions(root, [DESKTOP, { file: 'missing.json', field: 'version' }, { file: 'a.json', field: 'version' }, { file: 'b.json', field: 'version' }, { file: 'c.json', field: 'version' }]);
    expect(read.map((d) => d.value)).toEqual(['0.1.0', null, null, null, null]);
    expect(read.map((d) => d.absent)).toEqual([undefined, 'the file could not be read (no such file)', expect.stringMatching(/^the file is not JSON/), 'the file has no "version" field', '"version" is not a string']);
  });
});

describe('the version half — REQ-STARTUP-028', () => {
  it('agrees when every place declares the tag version', () => {
    expect(versionMismatch('v0.1.0', '0.1.0', [{ place: DESKTOP, value: '0.1.0' }])).toBeNull();
    expect(versionMismatch('v0.1.0rc1', '0.1.0rc1', [{ place: DESKTOP, value: '0.1.0rc1' }, { place: OTHER, value: '0.1.0rc1' }])).toBeNull();
  });

  it('a different release: names the tag version, the differing declared version and its place, and says to bump every place', () => {
    const message = versionMismatch('v0.2.0', '0.2.0', [{ place: DESKTOP, value: '0.1.0' }])!;
    expect(message).toMatch(/^error: /);
    expect(message).toContain('tag v0.2.0 is version 0.2.0');
    expect(message).toMatch(/apps\/desktop\/package\.json \("version"\)\s+"0\.1\.0"\s+← differs/);
    expect(message).toContain('The product releases exactly one version (REQ-STARTUP-158): bump every place listed above to 0.2.0');
  });

  it('a prerelease tag over a stable declaration, and the packaging tool\'s hyphenated spelling, both differ — equality is exact text', () => {
    expect(versionMismatch('v0.1.0rc1', '0.1.0rc1', [{ place: DESKTOP, value: '0.1.0' }])).toMatch(/"0\.1\.0"\s+← differs/);
    expect(versionMismatch('v0.1.0rc1', '0.1.0rc1', [{ place: DESKTOP, value: '0.1.0-rc1' }])).toMatch(/"0\.1\.0-rc1"\s+← differs/);
  });

  it('several places: every place is named, only the differing ones are marked, and every differing version appears', () => {
    const message = versionMismatch('v1.0.0', '1.0.0', [
      { place: DESKTOP, value: '1.0.0' },
      { place: OTHER, value: '0.9.0' },
      { place: { file: 'c.json', field: 'version' }, value: '0.1.0' },
    ])!;
    const lines = message.split('\n');
    expect(lines.find((l) => l.includes('apps/desktop/package.json'))).not.toContain('differs');
    expect(lines.find((l) => l.includes('build/product.json ("productVersion")'))).toMatch(/"0\.9\.0"\s+← differs$/);
    expect(lines.find((l) => l.includes('c.json ("version")'))).toMatch(/"0\.1\.0"\s+← differs$/);
  });

  it('a place that declares nothing differs, and says why', () => {
    const message = versionMismatch('v0.1.0', '0.1.0', [{ place: DESKTOP, value: null, absent: 'the file could not be read (no such file)' }])!;
    expect(message).toMatch(/apps\/desktop\/package\.json \("version"\)\s+no version — the file could not be read \(no such file\)\s+← differs/);
  });
});
