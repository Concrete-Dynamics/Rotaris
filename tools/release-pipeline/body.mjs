// @ts-check
/**
 * The release's name, its channel flag and its body (REQ-STARTUP-033, REQ-STARTUP-034, REQ-STARTUP-035 narrowed by
 * `PD-STARTUP-001`; first-release-plan.md §4.8).
 *
 * The body is REQ-STARTUP-035's seven elements in order, each a separate block so each is checkable on its own:
 *   (1) `## Rotaris {v}`
 *   (2) one line carrying the tag `v{v}` literally
 *   (3) one table row per published asset but the manifest and its signature, each digest the manifest's own
 *   (4) the "Not built in this release" blockquote, only where a platform of the PUBLISHED set contributed nothing —
 *       never for `macos-arm64` or `linux-x86_64` while `PD-STARTUP-001` stands, because those builds were not
 *       attempted; in their place, one line between (3) and (5) saying the release publishes Windows builds only
 *   (5) the verification hint: `sha256sum -c SHA256SUMS.txt`, and `certutil -hashfile <filename> SHA256` for Windows
 *   (6) the caveat: no code signature, SmartScreen and Gatekeeper named, the manifest signed and verified before an
 *       update is installed (REQ-STARTUP-167)
 *   (7) `## Changes` and REQ-STARTUP-033's changelog
 * The wording of (2), (5) and (6) beyond what the requirement quotes is this module's; (4)'s and (7)'s fixed sentences
 * are the requirement's, character for character.
 */
import { spawnSync } from 'node:child_process';
import { CHECKSUM_MANIFEST_NAME, CHECKSUM_SIGNATURE_NAME, compareReleaseVersions, parseReleaseTag, tryParseReleaseVersion } from '../release-naming/src/index.ts';
import { PUBLISHED_PLATFORMS } from './assets.mjs';

/** REQ-STARTUP-033's three fixed forms. */
export const FIRST_RELEASE_CHANGELOG = 'First release — no previous tag to compare against.';
export const noCommitsChangelog = (previousTag) => `No commits since ${previousTag}.`;
export const changesSinceHeading = (previousTag) => `Changes since ${previousTag}:`;

/** `PD-STARTUP-001`'s one line in place of element (4) for the platforms it leaves out. */
export const WINDOWS_ONLY_LINE = 'This release publishes Windows builds only.';

/** REQ-STARTUP-033: the changelog against the previous tag, from the commit subjects since it (merge commits excluded). */
export function changelog(previousTag, subjects) {
  if (previousTag === null) return FIRST_RELEASE_CHANGELOG;
  if (subjects.length === 0) return noCommitsChangelog(previousTag);
  return [changesSinceHeading(previousTag), ...subjects.map((s) => `- ${s}`)].join('\n');
}

/**
 * The previous tag: among the tags in REQ-STARTUP-027's grammar, the newest that sorts strictly before `tag` in
 * REQ-STARTUP-109's order (so `v0.2.0` follows `v0.2.0rc1`), or null when there is none. Other tags are not releases.
 */
export function previousReleaseTag(tags, tag) {
  const current = parseReleaseTag(tag);
  let best = null;
  for (const candidate of tags) {
    if (!candidate.startsWith('v')) continue;
    const parsed = tryParseReleaseVersion(candidate.slice(1));
    if (parsed === null || compareReleaseVersions(parsed, current) >= 0) continue;
    if (best === null || compareReleaseVersions(parsed, best.parsed) > 0) best = { tag: candidate, parsed };
  }
  return best === null ? null : best.tag;
}

/** REQ-STARTUP-034: the release's name, and whether it is flagged prerelease (REQ-STARTUP-029's channel). */
export function releaseMetadata(tag) {
  const parsed = parseReleaseTag(tag);
  return { tag: parsed.tag, version: parsed.version, name: `Rotaris ${parsed.version}`, prerelease: parsed.channel === 'prerelease' };
}

/**
 * REQ-STARTUP-034 at the release host: the `gh release create` arguments the draft is created with. The channel's flag
 * is passed in both directions (`--prerelease=true` for an `a`/`b`/`rc` tag, `--prerelease=false` for a plain one), so
 * the flag the release carries is the channel's and never the host's default.
 */
export function draftReleaseArguments(meta, bodyFile) {
  return ['--draft', '--verify-tag', '--title', meta.name, '--notes-file', bodyFile, `--prerelease=${meta.prerelease === true}`];
}

/**
 * REQ-STARTUP-034 read back: what the release host recorded (`gh release view <tag> --json tagName,name,isDraft,isPrerelease`)
 * against the metadata the release was created from. `stage` is `draft` right after the draft job created it, `published`
 * once the owner has made it public (first-release-plan.md §5). One sentence per disagreement; none when they agree.
 */
export function releaseStateProblems(meta, view, stage) {
  const problems = [];
  if (view.tagName !== meta.tag) problems.push(`the release host's release is for ${String(view.tagName)}, not ${meta.tag}`);
  if (view.name !== meta.name) problems.push(`REQ-STARTUP-034: the release is named "${String(view.name)}", not "${meta.name}"`);
  if (view.isPrerelease !== meta.prerelease) {
    problems.push(`REQ-STARTUP-034: ${meta.tag} is of the ${meta.prerelease ? 'prerelease' : 'stable'} channel (REQ-STARTUP-029), but the release host records prerelease=${String(view.isPrerelease)}`);
  }
  const draft = stage === 'draft';
  if (view.isDraft !== draft) problems.push(`the release is ${view.isDraft === true ? 'still a draft' : 'published'}, where the ${stage} stage expects ${draft ? 'a draft' : 'a published release'}`);
  return problems;
}

/**
 * REQ-STARTUP-035's body. `entries` is the release's manifest, parsed (`parseChecksumManifest`): the table is its rows,
 * so a digest in the body is the digest the manifest lists. `platformsWithAssets` names the published platforms that
 * contributed at least one asset; a published platform missing from it is element (4)'s.
 */
export function releaseBody({ tag, entries, platformsWithAssets, changelogText, publishedPlatforms = PUBLISHED_PLATFORMS }) {
  const { version } = parseReleaseTag(tag);
  const rows = entries.filter((e) => e.name !== CHECKSUM_MANIFEST_NAME && e.name !== CHECKSUM_SIGNATURE_NAME);
  const notBuilt = publishedPlatforms.filter((p) => !platformsWithAssets.includes(p));
  const blocks = [
    `## Rotaris ${version}`,
    `Built from tag \`${tag}\` by the release pipeline.`,
    ['| File | SHA-256 |', '|---|---|', ...rows.map((e) => `| \`${e.name}\` | \`${e.sha256}\` |`)].join('\n'),
  ];
  if (notBuilt.length > 0) {
    blocks.push(`> **Not built in this release: ${notBuilt.join(', ')}.** Those builds failed; the artifacts above are unaffected. Use the previous release for the missing platforms.`);
  }
  if (publishedPlatforms.length === 1 && publishedPlatforms[0] === 'windows-x64') blocks.push(WINDOWS_ONLY_LINE);
  blocks.push(
    [
      `**Verifying a download.** On macOS and Linux, run \`sha256sum -c ${CHECKSUM_MANIFEST_NAME}\` in the directory holding the downloads.`,
      `On Windows, run \`certutil -hashfile <filename> SHA256\` and compare the hexadecimal digest it prints with the line of \`${CHECKSUM_MANIFEST_NAME}\` that carries that filename, ignoring letter case and any spaces the command inserts.`,
    ].join(' '),
    [
      '**About signatures.** The binaries carry no code signature, so Windows SmartScreen and macOS Gatekeeper ask for confirmation the first time one is opened.',
      `The checksum manifest \`${CHECKSUM_MANIFEST_NAME}\` published with this release is signed (\`${CHECKSUM_SIGNATURE_NAME}\`), and Rotaris verifies that signature before it installs an update.`,
    ].join(' '),
    `## Changes\n\n${changelogText}`,
  );
  return `${blocks.join('\n\n')}\n`;
}

/** Git, read-only, in `repo`; the trimmed standard output, or a thrown error naming the command. */
function git(repo, args) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || '').trim() || `exit ${r.status}`}`);
  return r.stdout;
}

/** REQ-STARTUP-033 read from `repo`'s history: the previous release tag and the subjects since it, merges excluded. */
export function changelogFromGit(repo, tag) {
  const tags = git(repo, ['tag', '--list']).split('\n').map((t) => t.trim()).filter(Boolean);
  const previous = previousReleaseTag(tags, tag);
  if (previous === null) return changelog(null, []);
  const subjects = git(repo, ['log', '--no-merges', '--format=%s', `${previous}..${tag}`]).split('\n').filter((s) => s.length > 0);
  return changelog(previous, subjects);
}
