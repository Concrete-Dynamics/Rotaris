import { artifactName, CHECKSUM_MANIFEST_NAME, CHECKSUM_SIGNATURE_NAME, isStrictlyNewer, parseReleaseTag } from '@rotaris/release-naming';
import { ARTIFACT_KIND_BY_FLAVOUR, type Flavour } from './classify.js';

/**
 * REQ-STARTUP-105, REQ-STARTUP-107 to REQ-STARTUP-110, REQ-STARTUP-112 — the release feed: the one endpoint, what
 * the check consumes of its answer, the offer rule, and the banner summary. Pure functions over the body a fetch
 * returned; the fetch itself is `electron.ts`'s.
 *
 * REQ-STARTUP-105 names the endpoint's shape and O-5 names the repository: the product's releases are GitHub releases
 * of `Concrete-Dynamics/Rotaris`, this repository's public home since R-078 re-ruled O-5 (2026-10-21), superseding
 * R-053's `theUpsider/Rotaris-crw`. REQ-STARTUP-111 forbids any surface that moves this value, and the four closed
 * enumerations it names carry no entry for it: it is a constant here and a constant nowhere else.
 */
export const FEED_REPOSITORY = { owner: 'Concrete-Dynamics', repo: 'Rotaris' } as const;
export const FEED_ENDPOINT = `https://api.github.com/repos/${FEED_REPOSITORY.owner}/${FEED_REPOSITORY.repo}/releases/latest`;
export const FEED_ACCEPT = 'application/vnd.github+json';
/** REQ-STARTUP-105: the request timeout, 10.0 seconds. */
export const FEED_TIMEOUT_MS = 10_000;
/** REQ-STARTUP-112: the banner summary's length limit. */
export const SUMMARY_LIMIT = 160;
/** REQ-STARTUP-116: the message when the release body yields no summary. */
export const SUMMARY_FALLBACK = 'Open the release notes for the full changelog.';

/** The fields consumed of a GitHub release (domain 11, Data & Formats: "Release feed consumption"). */
export interface FeedAsset {
  readonly name: string;
  readonly url: string;
  /** Integer bytes, 0 when the feed states none (REQ-STARTUP-118 then reports whole MiB). */
  readonly size: number;
}
export interface LatestRelease {
  /** The tag's version without its `v` — the `{v}` every artifact name is rendered with. */
  readonly version: string;
  readonly body: string;
  readonly assets: readonly FeedAsset[];
}

export type FeedParse = { readonly ok: true; readonly release: LatestRelease } | { readonly ok: false; readonly reason: string };

/**
 * REQ-STARTUP-110's structural half: a non-object, a draft or prerelease flag, a missing or malformed tag are each a
 * check failure with a reason for the one internal log line — never a user-facing path. REQ-STARTUP-109's feed filter
 * is the same test from the other side: a draft or prerelease payload is filtered out before any comparison.
 */
export function parseLatestRelease(body: string): FeedParse {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (cause) {
    return { ok: false, reason: `the body is not JSON (${cause instanceof Error ? cause.message : String(cause)})` };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'the payload is not an object' };
  const release = value as Record<string, unknown>;
  if (release['draft'] === true) return { ok: false, reason: 'the payload is flagged draft' };
  if (release['prerelease'] === true) return { ok: false, reason: 'the payload is flagged prerelease' };
  const tag = release['tag_name'];
  if (typeof tag !== 'string') return { ok: false, reason: 'the payload carries no tag_name' };
  let version: string;
  try {
    version = parseReleaseTag(tag).version;
  } catch {
    return { ok: false, reason: `the tag ${JSON.stringify(tag)} is outside the release-tag grammar` };
  }
  const assets: FeedAsset[] = [];
  const rawAssets = release['assets'];
  if (Array.isArray(rawAssets)) {
    for (const entry of rawAssets) {
      if (entry === null || typeof entry !== 'object') continue;
      const a = entry as Record<string, unknown>;
      if (typeof a['name'] !== 'string' || typeof a['browser_download_url'] !== 'string') continue;
      const size = typeof a['size'] === 'number' && Number.isInteger(a['size']) && a['size'] > 0 ? a['size'] : 0;
      assets.push({ name: a['name'], url: a['browser_download_url'], size });
    }
  }
  return { ok: true, release: { version, body: typeof release['body'] === 'string' ? release['body'] : '', assets } };
}

/** What a check holds once a release is offered: everything the install step later needs, resolved once. */
export interface Offer {
  readonly version: string;
  readonly asset: FeedAsset;
  readonly summary: string;
  /** `SHA256SUMS.txt` and `SHA256SUMS.txt.sig`, by exact name; either may be absent, which the install step refuses (REQ-STARTUP-123). */
  readonly manifest: FeedAsset | null;
  readonly signature: FeedAsset | null;
}

/** REQ-STARTUP-108: exact-name matching only — same case, same separators, same literal version text. */
export function exactAsset(assets: readonly FeedAsset[], name: string): FeedAsset | null {
  return assets.find((a) => a.name === name) ?? null;
}

/**
 * REQ-STARTUP-107: an offer only when all three hold — a latest release exists (the caller parsed one), its version is
 * strictly newer than the running version (REQ-STARTUP-109), and it carries the asset for this flavour under the exact
 * name REQ-STARTUP-031 fixes (REQ-STARTUP-108). A release lacking this platform's file offers nothing: a real answer,
 * not an error.
 */
export function selectOffer(release: LatestRelease, runningVersion: string, flavour: Flavour): Offer | null {
  if (!isStrictlyNewer(release.version, runningVersion)) return null;
  const asset = exactAsset(release.assets, artifactName(release.version, ARTIFACT_KIND_BY_FLAVOUR[flavour]));
  if (asset === null) return null;
  return {
    version: release.version,
    asset,
    summary: releaseSummary(release.body),
    manifest: exactAsset(release.assets, CHECKSUM_MANIFEST_NAME),
    signature: exactAsset(release.assets, CHECKSUM_SIGNATURE_NAME),
  };
}

/**
 * REQ-STARTUP-112 — the banner summary. If a `## Changes` heading exists (case-insensitive) the search starts after
 * it; blank lines, headings, table rows, blockquotes and code fences are skipped (a fence and everything inside it);
 * a leading `- ` or `* ` bullet marker is stripped; the first substantive line is returned, truncated to 160
 * characters (159 + `…` when longer). An empty or scaffolding-only body yields an empty summary.
 */
export function releaseSummary(body: string): string {
  const lines = body.split(/\r?\n/);
  const changes = lines.findIndex((line) => /^##\s+changes\s*$/i.test(line.trim()));
  let inFence = false;
  for (const raw of lines.slice(changes >= 0 ? changes + 1 : 0)) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (line === '') continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('|')) continue;
    if (line.startsWith('>')) continue;
    // A bullet marker with nothing after it is scaffolding too.
    const text = line.replace(/^[-*](?:\s+|$)/, '').trim();
    if (text === '') continue;
    return [...text].length > SUMMARY_LIMIT ? `${[...text].slice(0, SUMMARY_LIMIT - 1).join('')}…` : text;
  }
  return '';
}
