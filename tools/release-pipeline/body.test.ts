import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changelog, changelogFromGit, draftReleaseArguments, FIRST_RELEASE_CHANGELOG, previousReleaseTag, releaseBody, releaseMetadata, releaseStateProblems, WINDOWS_ONLY_LINE } from './body.mjs';

/**
 * The release's name and body (REQ-STARTUP-033, REQ-STARTUP-034, REQ-STARTUP-035 narrowed by PD-STARTUP-001;
 * first-release-plan.md §4.8: "The generator is unit-tested per element").
 */

const SETUP = { name: 'Rotaris-0.2.0-windows-x64-setup.exe', sha256: 'a'.repeat(64) };
const PORTABLE = { name: 'Rotaris-0.2.0-windows-x64-portable.exe', sha256: 'b'.repeat(64) };

function body(over: Partial<Parameters<typeof releaseBody>[0]> = {}) {
  return releaseBody({ tag: 'v0.2.0', entries: [PORTABLE, SETUP], platformsWithAssets: ['windows-x64'], changelogText: FIRST_RELEASE_CHANGELOG, ...over });
}
const blocks = (text: string) => text.trimEnd().split('\n\n');

describe('REQ-STARTUP-035 — the body, element by element', () => {
  it('(1) opens with the heading `## Rotaris {v}`', () => {
    expect(blocks(body())[0]).toBe('## Rotaris 0.2.0');
    expect(blocks(body({ tag: 'v0.2.0rc1' }))[0]).toBe('## Rotaris 0.2.0rc1');
  });

  it('(2) states the tag it was built from, the tag string literally', () => {
    expect(blocks(body())[1]).toContain('v0.2.0');
    expect(blocks(body())[1]).toBe('Built from tag `v0.2.0` by the release pipeline.');
  });

  it('(3) one row per published asset with its digest, never the manifest or its signature', () => {
    const table = blocks(body({ entries: [PORTABLE, SETUP, { name: 'SHA256SUMS.txt', sha256: 'c'.repeat(64) }, { name: 'SHA256SUMS.txt.sig', sha256: 'd'.repeat(64) }] }))[2]!;
    expect(table.split('\n')).toEqual([
      '| File | SHA-256 |',
      '|---|---|',
      `| \`${PORTABLE.name}\` | \`${PORTABLE.sha256}\` |`,
      `| \`${SETUP.name}\` | \`${SETUP.sha256}\` |`,
    ]);
  });

  it('(4) is absent for the platforms PD-STARTUP-001 leaves out; one line in its place says Windows only, between (3) and (5)', () => {
    const b = blocks(body());
    expect(b.join('\n')).not.toContain('Not built in this release');
    expect(b[3]).toBe(WINDOWS_ONLY_LINE);
    expect(b[4]).toMatch(/^\*\*Verifying a download\.\*\*/);
  });

  it('(4) names a published platform that contributed nothing, in the requirement\'s exact sentence', () => {
    const b = blocks(body({ platformsWithAssets: [] }));
    expect(b[3]).toBe('> **Not built in this release: windows-x64.** Those builds failed; the artifacts above are unaffected. Use the previous release for the missing platforms.');
  });

  it('(4) once the directive is withdrawn: a failed platform is named, and the Windows-only line is gone', () => {
    const b = blocks(body({ publishedPlatforms: ['windows-x64', 'macos-arm64', 'linux-x86_64'], platformsWithAssets: ['windows-x64', 'linux-x86_64'] }));
    expect(b[3]).toBe('> **Not built in this release: macos-arm64.** Those builds failed; the artifacts above are unaffected. Use the previous release for the missing platforms.');
    expect(b).not.toContain(WINDOWS_ONLY_LINE);
  });

  it('(5) names `sha256sum -c SHA256SUMS.txt` and `certutil -hashfile <filename> SHA256`, and how the Windows digest is compared', () => {
    const hint = blocks(body())[4]!;
    expect(hint).toContain('`sha256sum -c SHA256SUMS.txt`');
    expect(hint).toContain('macOS and Linux');
    expect(hint).toContain('`certutil -hashfile <filename> SHA256`');
    expect(hint).toMatch(/ignoring letter case and any spaces the command inserts/);
    expect(hint).toMatch(/the line of `SHA256SUMS\.txt` that carries that filename/);
  });

  it('(6) says the binaries are unsigned, names SmartScreen and Gatekeeper, and that the manifest is signed and verified before an update', () => {
    const caveat = blocks(body())[5]!;
    expect(caveat).toMatch(/no code signature/);
    expect(caveat).toContain('SmartScreen');
    expect(caveat).toContain('Gatekeeper');
    expect(caveat).toMatch(/`SHA256SUMS\.txt` published with this release is signed/);
    expect(caveat).toMatch(/verifies that signature before it installs an update/);
  });

  it('(7) closes with `## Changes` and the changelog', () => {
    const b = blocks(body({ changelogText: 'Changes since v0.1.0:\n- one\n- two' }));
    expect(b.slice(6)).toEqual(['## Changes', 'Changes since v0.1.0:\n- one\n- two']);
    expect(body().endsWith('\n')).toBe(true);
  });

  it('keeps the seven in order and nothing else', () => {
    expect(blocks(body())).toHaveLength(8);
  });
});

describe('REQ-STARTUP-033 — the changelog', () => {
  it('has exactly the three forms', () => {
    expect(changelog(null, [])).toBe('First release — no previous tag to compare against.');
    expect(changelog('v0.1.0', [])).toBe('No commits since v0.1.0.');
    expect(changelog('v0.1.0', ['feat: a', 'fix: b'])).toBe('Changes since v0.1.0:\n- feat: a\n- fix: b');
  });

  it('compares against the newest release tag before this one, in REQ-STARTUP-109\'s order; other tags are not releases', () => {
    const tags = ['v0.1.0', 'v0.2.0rc1', 'v0.2.0rc2', 'v0.2.0', 'v0.3.0', 'vlatest', 'v0.2.0-rc3', 'nightly', 'v01.9.0'];
    expect(previousReleaseTag(tags, 'v0.2.0')).toBe('v0.2.0rc2');
    expect(previousReleaseTag(tags, 'v0.2.0rc1')).toBe('v0.1.0');
    expect(previousReleaseTag(tags, 'v0.1.0')).toBeNull();
    expect(previousReleaseTag(tags, 'v1.0.0')).toBe('v0.3.0');
  });

  describe('from git', () => {
    let repo: string;
    const IDENTITY = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false'];
    const git = (...args: string[]) => {
      const r = spawnSync('git', ['-C', repo, ...IDENTITY, ...args], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
      return r.stdout;
    };
    // One file per commit, so the two sides of the merge below never touch the same file.
    const commit = (subject: string) => {
      const file = `${subject.replace(/[^a-z]/g, '-')}.txt`;
      writeFileSync(join(repo, file), subject);
      git('add', file);
      git('commit', '-q', '-m', subject);
    };
    beforeEach(() => {
      repo = mkdtempSync(join(tmpdir(), 'release-changelog-'));
      git('init', '-q', '-b', 'main');
    });
    afterEach(() => rmSync(repo, { recursive: true, force: true }));

    it('the first release, with no earlier release tag', () => {
      commit('initial');
      git('tag', 'not-a-release');
      git('tag', 'v0.1.0');
      expect(changelogFromGit(repo, 'v0.1.0')).toBe(FIRST_RELEASE_CHANGELOG);
    });

    it('no commits since the previous tag', () => {
      commit('initial');
      git('tag', 'v0.1.0');
      git('tag', 'v0.1.1');
      expect(changelogFromGit(repo, 'v0.1.1')).toBe('No commits since v0.1.0.');
    });

    it('one bullet per commit subject since the previous tag, merge commits excluded', () => {
      commit('initial');
      git('tag', 'v0.1.0');
      git('checkout', '-q', '-b', 'side');
      commit('feat: on the side');
      git('checkout', '-q', 'main');
      commit('fix: on main');
      git('merge', '-q', '--no-ff', '-m', 'Merge branch side', 'side');
      git('tag', 'v0.2.0');
      const text = changelogFromGit(repo, 'v0.2.0');
      expect(text.split('\n')[0]).toBe('Changes since v0.1.0:');
      expect(text.split('\n').slice(1).sort()).toEqual(['- feat: on the side', '- fix: on main']);
    });
  });
});

describe('REQ-STARTUP-034 — the name and the prerelease flag', () => {
  it('names the release `Rotaris <version>` and flags exactly the prerelease channel (REQ-STARTUP-029)', () => {
    expect(releaseMetadata('v0.1.0')).toEqual({ tag: 'v0.1.0', version: '0.1.0', name: 'Rotaris 0.1.0', prerelease: false });
    expect(releaseMetadata('v0.1.0rc1')).toMatchObject({ name: 'Rotaris 0.1.0rc1', prerelease: true });
    expect(releaseMetadata('v0.1.0a2').prerelease).toBe(true);
    expect(releaseMetadata('v0.1.0b3').prerelease).toBe(true);
    expect(() => releaseMetadata('v0.1.0-rc1')).toThrow(/is not a release tag/);
  });
});

describe('REQ-STARTUP-034 at the release host — the draft\'s flag, both ways, and read back', () => {
  it('creates an rc tag\'s draft with --prerelease=true', () => {
    expect(draftReleaseArguments(releaseMetadata('v0.2.0rc1'), 'meta/release-body.md')).toEqual([
      '--draft', '--verify-tag', '--title', 'Rotaris 0.2.0rc1', '--notes-file', 'meta/release-body.md', '--prerelease=true',
    ]);
    expect(draftReleaseArguments(releaseMetadata('v0.2.0a1'), 'b.md')).toContain('--prerelease=true');
    expect(draftReleaseArguments(releaseMetadata('v0.2.0b2'), 'b.md')).toContain('--prerelease=true');
  });

  it('creates a stable tag\'s draft with --prerelease=false, never the host\'s default', () => {
    const args = draftReleaseArguments(releaseMetadata('v0.2.0'), 'meta/release-body.md');
    expect(args).toEqual(['--draft', '--verify-tag', '--title', 'Rotaris 0.2.0', '--notes-file', 'meta/release-body.md', '--prerelease=false']);
    expect(args).not.toContain('--prerelease');
  });

  it('accepts the host\'s record when it carries the channel\'s flag, at either stage', () => {
    expect(releaseStateProblems(releaseMetadata('v0.2.0rc1'), { tagName: 'v0.2.0rc1', name: 'Rotaris 0.2.0rc1', isDraft: true, isPrerelease: true }, 'draft')).toEqual([]);
    expect(releaseStateProblems(releaseMetadata('v0.2.0'), { tagName: 'v0.2.0', name: 'Rotaris 0.2.0', isDraft: false, isPrerelease: false }, 'published')).toEqual([]);
  });

  it('refuses an rc release the host records as stable — v0.1.0rc1\'s published state', () => {
    expect(releaseStateProblems(releaseMetadata('v0.1.0rc1'), { tagName: 'v0.1.0rc1', name: 'Rotaris 0.1.0rc1', isDraft: false, isPrerelease: false }, 'published')).toEqual([
      'REQ-STARTUP-034: v0.1.0rc1 is of the prerelease channel (REQ-STARTUP-029), but the release host records prerelease=false',
    ]);
  });

  it('refuses a stable release flagged prerelease, a wrong name, a wrong tag and a wrong stage, one sentence each', () => {
    const problems = releaseStateProblems(releaseMetadata('v0.2.0'), { tagName: 'v0.2.1', name: 'Rotaris', isDraft: false, isPrerelease: true }, 'draft');
    expect(problems).toEqual([
      'the release host\'s release is for v0.2.1, not v0.2.0',
      'REQ-STARTUP-034: the release is named "Rotaris", not "Rotaris 0.2.0"',
      'REQ-STARTUP-034: v0.2.0 is of the stable channel (REQ-STARTUP-029), but the release host records prerelease=true',
      'the release is published, where the draft stage expects a draft',
    ]);
    expect(releaseStateProblems(releaseMetadata('v0.2.0rc1'), { tagName: 'v0.2.0rc1', name: 'Rotaris 0.2.0rc1', isPrerelease: true }, 'draft')).toEqual([
      'the release is published, where the draft stage expects a draft',
    ]);
  });
});
