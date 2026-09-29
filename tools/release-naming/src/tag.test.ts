import { describe, expect, it } from 'vitest';
import { InvalidReleaseTagError, parseReleaseTag, parseReleaseVersion, tryParseReleaseVersion, UnsupportedVersionError } from './index.js';

describe('the release-tag grammar — REQ-STARTUP-027', () => {
  it('accepts a plain tag and each prerelease suffix, and carries the version without its v', () => {
    expect(parseReleaseTag('v1.2.3')).toEqual({ tag: 'v1.2.3', version: '1.2.3', major: 1, minor: 2, patch: 3, prerelease: null, channel: 'stable' });
    expect(parseReleaseTag('v0.1.0rc1')).toMatchObject({ version: '0.1.0rc1', prerelease: { kind: 'rc', number: 1 }, channel: 'prerelease' });
    expect(parseReleaseTag('v2.0.0a4').prerelease).toEqual({ kind: 'a', number: 4 });
    expect(parseReleaseTag('v2.0.0b12').prerelease).toEqual({ kind: 'b', number: 12 });
  });

  it('refuses every counter-example the requirement names, and a ref, naming the tag and the expected shape', () => {
    for (const tag of ['vlatest', 'v1.2.3dev1', '1.2.3', 'v1.2', 'v1.2.3-rc1', 'refs/tags/v1.2.3', 'main', 'v1.2.3 ', '']) {
      expect(() => parseReleaseTag(tag), tag).toThrow(InvalidReleaseTagError);
    }
    expect(() => parseReleaseTag('v1.2.3-rc1')).toThrow('"v1.2.3-rc1" is not a release tag: expected v<major>.<minor>.<patch>, optionally followed by a prerelease suffix a<N>, b<N> or rc<N> (for example v1.2.3 or v1.2.3rc1).');
  });

  it('refuses a number written with a leading zero, which would be a second spelling of one release', () => {
    expect(() => parseReleaseTag('v01.2.3')).toThrow(InvalidReleaseTagError);
    expect(() => parseReleaseTag('v1.2.3rc01')).toThrow(InvalidReleaseTagError);
    expect(parseReleaseTag('v0.0.0').version).toBe('0.0.0');
  });
});

describe('channel classification — REQ-STARTUP-029', () => {
  it('plain X.Y.Z is stable, any suffix is prerelease', () => {
    expect(parseReleaseVersion('0.1.0').channel).toBe('stable');
    expect(parseReleaseVersion('0.1.0rc1').channel).toBe('prerelease');
  });

  it('an invalid version is an error stating it is not a supported product version', () => {
    expect(() => parseReleaseVersion('0.1.0-rc1')).toThrow(UnsupportedVersionError);
    expect(() => parseReleaseVersion('dev')).toThrow('"dev" is not a supported product version');
    expect(tryParseReleaseVersion('v1.2.3')).toBeNull();
  });
});
