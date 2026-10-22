import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatChecksumManifest } from '@rotaris/release-naming';
import { expectedAssets, PUBLISHED_PLATFORMS, readReleaseDirectory, sha256File, verifyReleaseDirectory, writeChecksumManifest } from './assets.mjs';

/**
 * The published assets and `SHA256SUMS.txt` (REQ-STARTUP-031, REQ-STARTUP-032, REQ-STARTUP-152; first-release-plan.md
 * §4.7). Every case runs over a release directory made in a temporary directory, with stand-in artifacts of a few
 * bytes: the names and the manifest's text are what is under test, not the installer.
 */

const SETUP = 'Rotaris-0.1.0-windows-x64-setup.exe';
const PORTABLE = 'Rotaris-0.1.0-windows-x64-portable.exe';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'release-assets-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function lay(files: Record<string, string>) {
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
}

describe('the published set — PD-STARTUP-001, REQ-STARTUP-031', () => {
  it('publishes windows-x64 alone, its installer and its portable, named by the authority', () => {
    expect(PUBLISHED_PLATFORMS).toEqual(['windows-x64']);
    expect(expectedAssets('0.1.0rc1').map((a) => a.name)).toEqual(['Rotaris-0.1.0rc1-windows-x64-setup.exe', 'Rotaris-0.1.0rc1-windows-x64-portable.exe']);
  });

  it('renders the full matrix only when asked for it, and refuses a key REQ-STARTUP-030 does not have', () => {
    expect(expectedAssets('1.2.3', ['windows-x64', 'macos-arm64', 'linux-x86_64']).map((a) => a.name)).toEqual([
      'Rotaris-1.2.3-windows-x64-setup.exe',
      'Rotaris-1.2.3-windows-x64-portable.exe',
      'Rotaris-1.2.3-macos-arm64.dmg',
      'Rotaris-1.2.3-linux-x86_64.AppImage',
    ]);
    expect(() => expectedAssets('1.2.3', ['windows-arm64'])).toThrow(/not a platform key/);
  });

  it('sorts what a directory holds into the expected, the missing and the foreign; the manifest and its signature are neither', () => {
    lay({ [SETUP]: 'setup', 'SHA256SUMS.txt': '', 'SHA256SUMS.txt.sig': '', [`${SETUP}.blockmap`]: 'map' });
    const read = readReleaseDirectory(dir, '0.1.0');
    expect(read.assets.map((a) => a.name)).toEqual([SETUP]);
    expect(read.missing.map((a) => a.name)).toEqual([PORTABLE]);
    expect(read.foreign).toEqual([`${SETUP}.blockmap`]);
  });
});

describe('writing SHA256SUMS.txt — REQ-STARTUP-032', () => {
  it('lists every asset in the authority\'s one format, sorted, never itself or the signature', () => {
    lay({ [SETUP]: 'setup bytes', [PORTABLE]: 'portable bytes' });
    const written = writeChecksumManifest(dir, '0.1.0');
    expect(written.ok).toBe(true);
    const text = readFileSync(join(dir, 'SHA256SUMS.txt'), 'utf8');
    expect(text).toBe(`${sha('portable bytes')}  ${PORTABLE}\n${sha('setup bytes')}  ${SETUP}\n`);
    expect(text).toBe(formatChecksumManifest([{ name: SETUP, sha256: sha('setup bytes') }, { name: PORTABLE, sha256: sha('portable bytes') }]));
  });

  it('removes a signature made over earlier bytes', () => {
    lay({ [SETUP]: 'setup', 'SHA256SUMS.txt.sig': 'stale' });
    expect(writeChecksumManifest(dir, '0.1.0').ok).toBe(true);
    expect(existsSync(join(dir, 'SHA256SUMS.txt.sig'))).toBe(false);
  });

  it('refuses, writing nothing, when the directory holds a file the naming scheme does not name (REQ-STARTUP-152)', () => {
    lay({ [SETUP]: 'setup', [`${SETUP}.blockmap`]: 'map', 'Rotaris-0.1.0-rc1-windows-x64-setup.exe': 'hyphenated' });
    const written = writeChecksumManifest(dir, '0.1.0');
    expect(written.ok).toBe(false);
    if (!written.ok) {
      expect(written.problems).toHaveLength(2);
      expect(written.problems[0]).toMatch(/REQ-STARTUP-152: "Rotaris-0\.1\.0-rc1-windows-x64-setup\.exe" is not an artifact name/);
    }
    expect(existsSync(join(dir, 'SHA256SUMS.txt'))).toBe(false);
  });

  it('refuses an empty directory', () => {
    const written = writeChecksumManifest(dir, '0.1.0');
    expect(written.ok).toBe(false);
  });

  it('digests a file larger than one read chunk', () => {
    const big = Buffer.alloc(3 * 1024 * 1024 + 17, 7);
    writeFileSync(join(dir, SETUP), big);
    expect(sha256File(join(dir, SETUP))).toBe(createHash('sha256').update(big).digest('hex'));
  });

  const sha256sum = spawnSync('sha256sum', ['--version']).status === 0;
  it.runIf(sha256sum)('is read by `sha256sum -c` unmodified (REQ-STARTUP-032, REQ-STARTUP-152)', () => {
    lay({ [SETUP]: 'setup', [PORTABLE]: 'portable' });
    writeChecksumManifest(dir, '0.1.0');
    const r = spawnSync('sha256sum', ['-c', '--strict', 'SHA256SUMS.txt'], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`${PORTABLE}: OK\n${SETUP}: OK\n`);
  });
});

describe('verifying the release directory — §5\'s checksum check', () => {
  it('passes a complete release whose manifest is the writer\'s', () => {
    lay({ [SETUP]: 'setup', [PORTABLE]: 'portable' });
    writeChecksumManifest(dir, '0.1.0');
    expect(verifyReleaseDirectory(dir, '0.1.0')).toEqual([]);
  });

  it('names a missing portable, and the stub it waits on', () => {
    lay({ [SETUP]: 'setup' });
    writeChecksumManifest(dir, '0.1.0');
    expect(verifyReleaseDirectory(dir, '0.1.0')).toEqual([
      `REQ-STARTUP-031: ${PORTABLE} is missing; windows-x64 publishes setup and portable (the portable is assembled around the launcher stub of first-release-plan.md §4.5)`,
    ]);
  });

  it('refuses a release with no manifest', () => {
    lay({ [SETUP]: 'setup', [PORTABLE]: 'portable' });
    expect(verifyReleaseDirectory(dir, '0.1.0')).toEqual(['REQ-STARTUP-032: SHA256SUMS.txt is missing; a release publishing no manifest is refused as unverifiable']);
  });

  it('finds an asset changed after the manifest was written', () => {
    lay({ [SETUP]: 'setup', [PORTABLE]: 'portable' });
    writeChecksumManifest(dir, '0.1.0');
    writeFileSync(join(dir, SETUP), 'setup, altered');
    expect(verifyReleaseDirectory(dir, '0.1.0')).toEqual([`REQ-STARTUP-032: the digest SHA256SUMS.txt lists for ${SETUP} does not match the file`]);
  });

  it('refuses a manifest in another format: CRLF, upper-case digests, unsorted, a single space', () => {
    lay({ [SETUP]: 'setup', [PORTABLE]: 'portable' });
    const good = (writeChecksumManifest(dir, '0.1.0') as { text: string }).text;
    const variants = [
      good.replace(/\n/g, '\r\n'),
      good.replace(/^[0-9a-f]{64}/gm, (digest) => digest.toUpperCase()),
      good.split('\n').filter(Boolean).reverse().join('\n') + '\n',
    ];
    for (const text of variants) {
      writeFileSync(join(dir, 'SHA256SUMS.txt'), text);
      expect(verifyReleaseDirectory(dir, '0.1.0').some((p) => p.includes('is not in the one format'))).toBe(true);
    }
  });

  it('refuses a manifest that lists itself, the signature, or a file the release does not publish', () => {
    lay({ [SETUP]: 'setup', [PORTABLE]: 'portable' });
    const text = formatChecksumManifest([
      { name: SETUP, sha256: sha('setup') },
      { name: PORTABLE, sha256: sha('portable') },
      { name: 'SHA256SUMS.txt', sha256: sha('x') },
      { name: 'SHA256SUMS.txt.sig', sha256: sha('y') },
      { name: 'Rotaris-0.0.9-windows-x64-setup.exe', sha256: sha('z') },
    ]);
    writeFileSync(join(dir, 'SHA256SUMS.txt'), text);
    expect(verifyReleaseDirectory(dir, '0.1.0')).toEqual([
      'REQ-STARTUP-032: SHA256SUMS.txt lists SHA256SUMS.txt; it lists neither itself nor the signature',
      'REQ-STARTUP-032: SHA256SUMS.txt lists SHA256SUMS.txt.sig; it lists neither itself nor the signature',
      'REQ-STARTUP-032: SHA256SUMS.txt lists Rotaris-0.0.9-windows-x64-setup.exe, which the release does not publish',
    ]);
  });

  it('refuses an asset the manifest leaves out', () => {
    lay({ [SETUP]: 'setup', [PORTABLE]: 'portable' });
    writeFileSync(join(dir, 'SHA256SUMS.txt'), formatChecksumManifest([{ name: SETUP, sha256: sha('setup') }]));
    expect(verifyReleaseDirectory(dir, '0.1.0')).toEqual([`REQ-STARTUP-032: SHA256SUMS.txt does not list ${PORTABLE}`]);
  });
});
