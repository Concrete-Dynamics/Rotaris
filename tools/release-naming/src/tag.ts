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
 * grammar does not say so itself; that is the reading OQ-67 records.
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
  constructor(readonly tag: string) {
    super(`"${tag}" is not a release tag: expected ${RELEASE_TAG_SHAPE}.`);
    this.name = 'InvalidReleaseTagError';
  }
}

/** REQ-STARTUP-029: "an invalid version string SHALL be an error stating it is not a supported product version". */
export class UnsupportedVersionError extends Error {
  constructor(readonly version: string) {
    super(`"${version}" is not a supported product version: expected <major>.<minor>.<patch>, optionally followed by a<N>, b<N> or rc<N> (for example 1.2.3 or 1.2.3rc1).`);
    this.name = 'UnsupportedVersionError';
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
