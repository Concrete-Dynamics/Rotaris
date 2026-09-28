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
