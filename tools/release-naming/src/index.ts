/**
 * REQ-STARTUP-030, REQ-STARTUP-031 — the build matrix and the artifact names.
 *
 * One authority. The installer names `pnpm package` writes as literals into
 * electron-builder's configuration (`apps/desktop/scripts/lib/artifact-names.mjs`,
 * rendered from the declared version, never from electron-builder's normalised
 * `${version}` — ADR-0054, 2026-09-28), the updater's expectation of what a release
 * contains, and the portable's assembly step all read this module and compose
 * nothing of their own.
 *
 * ONE FILE OF ERASABLE SYNTAX, and it must stay so: the packaging scripts
 * (`apps/desktop/scripts/lib/artifact-names.mjs`, which `package.mjs` and
 * `build-hooks.cjs`'s `checkNaming` load) import this file with plain
 * Node, whose type stripping neither maps a `./x.js` specifier to `x.ts` nor accepts
 * parameter properties. A relative import or a `constructor(readonly …)` here refuses
 * every installer build at `afterPack` (measured 2026-09-27, when the tag grammar
 * arrived as a second module); `naming.test.ts` loads it that way.
 */
export const PLATFORM_KEYS = ['windows-x64', 'macos-arm64', 'linux-x86_64'] as const;
export type PlatformKey = (typeof PLATFORM_KEYS)[number];

export const ARTIFACT_KINDS = ['setup', 'portable', 'dmg', 'appimage'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** Per-platform kinds, exactly as REQ-STARTUP-031 fixes them. */
export const KINDS_BY_PLATFORM: Readonly<Record<PlatformKey, readonly ArtifactKind[]>> = {
  'windows-x64': ['setup', 'portable'],
  'macos-arm64': ['dmg'],
  'linux-x86_64': ['appimage'],
};

export class UnknownArtifactKindError extends Error {
  constructor(requested: string) {
    super(`Unknown artifact kind "${requested}". Known kinds: ${ARTIFACT_KINDS.join(', ')}.`);
    this.name = 'UnknownArtifactKindError';
  }
}

export function artifactName(version: string, kind: string): string {
  switch (kind as ArtifactKind) {
    case 'setup':
      return `Rotaris-${version}-windows-x64-setup.exe`;
    case 'portable':
      return `Rotaris-${version}-windows-x64-portable.exe`;
    case 'dmg':
      return `Rotaris-${version}-macos-arm64.dmg`;
    case 'appimage':
      return `Rotaris-${version}-linux-x86_64.AppImage`;
    default:
      throw new UnknownArtifactKindError(kind);
  }
}

/** Every artifact a full release publishes, in matrix order. */
export function releaseArtifacts(version: string): readonly { platform: PlatformKey; kind: ArtifactKind; name: string }[] {
  return PLATFORM_KEYS.flatMap((platform) => KINDS_BY_PLATFORM[platform].map((kind) => ({ platform, kind, name: artifactName(version, kind) })));
}

export const CHECKSUM_MANIFEST_NAME = 'SHA256SUMS.txt' as const;
export const CHECKSUM_SIGNATURE_NAME = 'SHA256SUMS.txt.sig' as const;

/**
 * REQ-STARTUP-027, REQ-STARTUP-029 — the release-tag grammar and the channel a version belongs to.
 *
 * One grammar, read in three places: the pre-build guard parses the tag it is handed (REQ-STARTUP-028), the tag
 * workflow classifies the release it publishes (REQ-STARTUP-029), and the updater parses both sides of a comparison
 * through it (REQ-STARTUP-109). It lives beside the artifact names because the version a tag carries is the `{v}`
 * those names are rendered with (REQ-STARTUP-031).
 *
 * The numbers are canonical decimals — `v01.2.3` is refused — because the release version is compared as text by the
 * guard and rendered as text into every artifact name, so two spellings of one numeric tuple would be two releases. The
 * grammar does not say so itself; that is the reading OQ-70 records.
 */
export type ReleaseChannel = 'stable' | 'prerelease';
export type PrereleaseKind = 'a' | 'b' | 'rc';

export interface ReleaseVersion {
  /** The version exactly as written, without the tag's `v` — the value every declared place must equal. */
  readonly version: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** The PEP 440 suffix, or null for a plain `X.Y.Z`. */
  readonly prerelease: { readonly kind: PrereleaseKind; readonly number: number } | null;
  /** REQ-STARTUP-029: plain → stable, any suffix → prerelease. */
  readonly channel: ReleaseChannel;
}

export interface ReleaseTag extends ReleaseVersion {
  readonly tag: string;
}

const NUMBER = '(0|[1-9][0-9]*)';
const VERSION = new RegExp(`^${NUMBER}\\.${NUMBER}\\.${NUMBER}(?:(a|b|rc)${NUMBER})?$`);

/** The expected shape, stated once, for both rejection messages. */
export const RELEASE_TAG_SHAPE = 'v<major>.<minor>.<patch>, optionally followed by a prerelease suffix a<N>, b<N> or rc<N> (for example v1.2.3 or v1.2.3rc1)';

/** REQ-STARTUP-027: a candidate tag outside the grammar. The message names the tag and describes the expected shape. */
export class InvalidReleaseTagError extends Error {
  readonly tag: string;
  constructor(tag: string) {
    super(`"${tag}" is not a release tag: expected ${RELEASE_TAG_SHAPE}.`);
    this.name = 'InvalidReleaseTagError';
    this.tag = tag;
  }
}

/** REQ-STARTUP-029: "an invalid version string SHALL be an error stating it is not a supported product version". */
export class UnsupportedVersionError extends Error {
  readonly version: string;
  constructor(version: string) {
    super(`"${version}" is not a supported product version: expected <major>.<minor>.<patch>, optionally followed by a<N>, b<N> or rc<N> (for example 1.2.3 or 1.2.3rc1).`);
    this.name = 'UnsupportedVersionError';
    this.version = version;
  }
}

/** Parses a version (no `v`) through the grammar, or null when it is outside it. */
export function tryParseReleaseVersion(version: string): ReleaseVersion | null {
  const m = VERSION.exec(version);
  if (!m) return null;
  const kind = m[4] as PrereleaseKind | undefined;
  return {
    version,
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: kind ? { kind, number: Number(m[5]) } : null,
    channel: kind ? 'prerelease' : 'stable',
  };
}

export function parseReleaseVersion(version: string): ReleaseVersion {
  const parsed = tryParseReleaseVersion(version);
  if (!parsed) throw new UnsupportedVersionError(version);
  return parsed;
}

/** REQ-STARTUP-027: exactly `v` and a version. A ref (`refs/tags/…`), a bare version and `v1.2.3-rc1` are all refused. */
export function parseReleaseTag(tag: string): ReleaseTag {
  const parsed = tag.startsWith('v') ? tryParseReleaseVersion(tag.slice(1)) : null;
  if (!parsed) throw new InvalidReleaseTagError(tag);
  return { tag, ...parsed };
}

/**
 * REQ-STARTUP-109 — the order the updater compares two parsed versions in, and the only order this
 * repository has for them.
 *
 * The numeric tuple first; where two versions share a tuple, the prerelease rank second: a prerelease
 * sorts before the plain release of its own tuple (so `1.2.3rc1` is offered `v1.2.3`), and among the
 * prereleases of one tuple `a` sorts before `b` before `rc`, ties within a kind broken by the ascending
 * numeric suffix. Negative when `a` sorts before `b`, zero when they are the same version.
 */
const PRERELEASE_RANK: Record<PrereleaseKind, number> = { a: 0, b: 1, rc: 2 };

export function compareReleaseVersions(a: ReleaseVersion, b: ReleaseVersion): number {
  for (const part of ['major', 'minor', 'patch'] as const) {
    if (a[part] !== b[part]) return a[part] < b[part] ? -1 : 1;
  }
  if (a.prerelease === null && b.prerelease === null) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  const kind = PRERELEASE_RANK[a.prerelease.kind] - PRERELEASE_RANK[b.prerelease.kind];
  if (kind !== 0) return kind < 0 ? -1 : 1;
  if (a.prerelease.number === b.prerelease.number) return 0;
  return a.prerelease.number < b.prerelease.number ? -1 : 1;
}

/**
 * REQ-STARTUP-109's decision, on two version strings: true only when `candidate` parses, `running` parses,
 * and the candidate sorts strictly after the running version. Equal or older is false; a candidate outside
 * the grammar (`0.102.0-rc1`, `0.102`) is false; a running version that does not parse (`dev`) is false,
 * because the comparison cannot be decided and no update is ever offered from an undecidable one.
 */
export function isStrictlyNewer(candidate: string, running: string): boolean {
  const c = tryParseReleaseVersion(candidate);
  const r = tryParseReleaseVersion(running);
  if (c === null || r === null) return false;
  return compareReleaseVersions(c, r) > 0;
}

/**
 * REQ-STARTUP-032, REQ-STARTUP-113 — the checksum manifest's one format, written and read in one place so the
 * two cannot drift: `<sha256hex>  <filename>` per line, two-space separator, sorted by filename, the digest in
 * lower case, `sha256sum -c` compatible. The release pipeline writes it (§4.7 of the first-release plan) and
 * the updater parses it, and `manifest.test.ts` holds the round trip REQ-STARTUP-113 requires.
 *
 * The parser is the exact inverse of the writer and nothing more: a line without the two-space separator, with
 * an empty name, or whose digest is not 64 hexadecimal characters is skipped — never guessed at. `sha256sum`'s
 * own binary-mode marker (`<hex> *<name>`) is not the writer's format, so it is a malformed line here too.
 */
export interface ChecksumEntry {
  readonly name: string;
  /** Lower-case hexadecimal, 64 characters. */
  readonly sha256: string;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function formatChecksumManifest(entries: readonly ChecksumEntry[]): string {
  const lines = [...entries]
    .map((e) => ({ name: e.name.trim(), sha256: e.sha256.trim().toLowerCase() }))
    .sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))
    .map((e) => `${e.sha256}  ${e.name}\n`);
  return lines.join('');
}

export function parseChecksumManifest(text: string): ChecksumEntry[] {
  const out: ChecksumEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    // The line is trimmed before the split, so stray whitespace around it is not read as an empty digest; the
    // digest carries no space of its own, so the first two-space run inside the trimmed line is the separator.
    const line = raw.trim();
    const at = line.indexOf('  ');
    if (at < 0) continue;
    const sha256 = line.slice(0, at).trim().toLowerCase();
    const name = line.slice(at + 2).trim();
    if (name === '' || !SHA256_HEX.test(sha256)) continue;
    out.push({ name, sha256 });
  }
  return out;
}
