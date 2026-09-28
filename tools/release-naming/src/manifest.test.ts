import { describe, expect, it } from 'vitest';
import { compareReleaseVersions, formatChecksumManifest, isStrictlyNewer, parseChecksumManifest, parseReleaseVersion } from './index.js';

const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);
const HEX_C = 'c'.repeat(64);

describe('the checksum manifest format — REQ-STARTUP-032, REQ-STARTUP-113', () => {
  it('writes one line per asset, two-space separated, sorted by filename, the digest in lower case', () => {
    const text = formatChecksumManifest([
      { name: 'Rotaris-0.1.0-windows-x64-setup.exe', sha256: HEX_B.toUpperCase() },
      { name: 'Rotaris-0.1.0-windows-x64-portable.exe', sha256: HEX_A },
    ]);
    expect(text).toBe(`${HEX_A}  Rotaris-0.1.0-windows-x64-portable.exe\n${HEX_B}  Rotaris-0.1.0-windows-x64-setup.exe\n`);
  });

  it('round-trips: parsing what the writer wrote gives the entries back, sorted, with lower-case digests', () => {
    const entries = [
      { name: 'Rotaris-0.1.0-windows-x64-setup.exe', sha256: HEX_C },
      { name: 'Rotaris-0.1.0-windows-x64-portable.exe', sha256: HEX_A.toUpperCase() },
      { name: 'Rotaris-0.1.0-macos-arm64.dmg', sha256: HEX_B },
    ];
    const parsed = parseChecksumManifest(formatChecksumManifest(entries));
    expect(parsed).toEqual([
      { name: 'Rotaris-0.1.0-macos-arm64.dmg', sha256: HEX_B },
      { name: 'Rotaris-0.1.0-windows-x64-portable.exe', sha256: HEX_A },
      { name: 'Rotaris-0.1.0-windows-x64-setup.exe', sha256: HEX_C },
    ]);
    expect(formatChecksumManifest(parsed)).toBe(formatChecksumManifest(entries));
  });

  it('parses the exact inverse of the writer — trimmed name and digest, digest lower-cased — and tolerates CRLF', () => {
    const parsed = parseChecksumManifest(`  ${HEX_A.toUpperCase()}  Rotaris-0.1.0-windows-x64-portable.exe  \r\n${HEX_B}  Rotaris-0.1.0-windows-x64-setup.exe\r\n`);
    expect(parsed).toEqual([
      { name: 'Rotaris-0.1.0-windows-x64-portable.exe', sha256: HEX_A },
      { name: 'Rotaris-0.1.0-windows-x64-setup.exe', sha256: HEX_B },
    ]);
  });

  it('skips a malformed line rather than guessing at it: no two-space separator, a short digest, a non-hex digest, an empty name, the binary-mode marker', () => {
    const text = [
      `${HEX_A} Rotaris-one-space.exe`,
      `${HEX_A.slice(0, 40)}  Rotaris-short.exe`,
      `${'g'.repeat(64)}  Rotaris-not-hex.exe`,
      `${HEX_A}  `,
      `${HEX_A} *Rotaris-binary-mode.exe`,
      '',
      `${HEX_B}  Rotaris-0.1.0-windows-x64-setup.exe`,
    ].join('\n');
    expect(parseChecksumManifest(text)).toEqual([{ name: 'Rotaris-0.1.0-windows-x64-setup.exe', sha256: HEX_B }]);
  });

  it('an empty manifest parses to no entries and writes to an empty string', () => {
    expect(parseChecksumManifest('')).toEqual([]);
    expect(formatChecksumManifest([])).toBe('');
  });
});

describe('the strict version order — REQ-STARTUP-109', () => {
  const v = (s: string) => parseReleaseVersion(s);

  it('orders the numeric tuple first', () => {
    expect(compareReleaseVersions(v('1.2.3'), v('1.2.4'))).toBeLessThan(0);
    expect(compareReleaseVersions(v('1.10.0'), v('1.9.9'))).toBeGreaterThan(0);
    expect(compareReleaseVersions(v('2.0.0'), v('1.99.99'))).toBeGreaterThan(0);
    expect(compareReleaseVersions(v('1.2.3'), v('1.2.3'))).toBe(0);
  });

  it('within one tuple a prerelease sorts before the plain release, a before b before rc, ties by the ascending suffix', () => {
    expect(compareReleaseVersions(v('1.2.3rc1'), v('1.2.3'))).toBeLessThan(0);
    expect(compareReleaseVersions(v('1.2.3a1'), v('1.2.3b1'))).toBeLessThan(0);
    expect(compareReleaseVersions(v('1.2.3b1'), v('1.2.3rc1'))).toBeLessThan(0);
    expect(compareReleaseVersions(v('1.2.3rc1'), v('1.2.3rc2'))).toBeLessThan(0);
    expect(compareReleaseVersions(v('1.2.3rc2'), v('1.2.3rc2'))).toBe(0);
    // A prerelease of a HIGHER tuple still sorts after the plain release of a lower one.
    expect(compareReleaseVersions(v('1.2.4a1'), v('1.2.3'))).toBeGreaterThan(0);
  });

  it('offers only a strictly newer version: a running prerelease is offered the stable release of its own tuple', () => {
    expect(isStrictlyNewer('1.2.3', '1.2.3rc1')).toBe(true);
    expect(isStrictlyNewer('1.2.4', '1.2.3')).toBe(true);
    expect(isStrictlyNewer('1.2.3', '1.2.3')).toBe(false);
    expect(isStrictlyNewer('1.2.2', '1.2.3')).toBe(false);
    expect(isStrictlyNewer('1.2.3rc1', '1.2.3')).toBe(false);
  });

  it('decides nothing for a candidate outside the grammar or a running version that does not parse', () => {
    expect(isStrictlyNewer('0.102.0-rc1', '0.1.0')).toBe(false);
    expect(isStrictlyNewer('0.102', '0.1.0')).toBe(false);
    expect(isStrictlyNewer('v0.2.0', '0.1.0')).toBe(false);
    expect(isStrictlyNewer('0.2.0', 'dev')).toBe(false);
    expect(isStrictlyNewer('0.2.0', '0+unknown')).toBe(false);
  });
});
