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
  /**
   * The release's own page as the feed states it (`html_url`), unchecked: a string, or null when the field is absent or not
   * a string. Only a link-only offer reads it (PD-STARTUP-014), and only through `checkReleasePage`.
   */
  readonly page: string | null;
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
  const page = typeof release['html_url'] === 'string' ? release['html_url'] : null;
  return { ok: true, release: { version, body: typeof release['body'] === 'string' ? release['body'] : '', assets, page } };
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

/**
 * PD-STARTUP-014 and OQ-556's ruling — the host that serves the feed repository's pages. The feed itself is the API host
 * (`FEED_ENDPOINT`); the release's page is on the repository's own host, and nowhere else.
 */
export const RELEASE_PAGE_HOST = 'github.com';
/** The longest page address accepted. A release page of this repository is under a hundred characters. */
export const RELEASE_PAGE_MAX_LENGTH = 512;
/** One path segment of a release page: letters, digits and `.`, `_`, `+`, `-`, never `.` or `..` alone. */
const PAGE_SEGMENT = /^[A-Za-z0-9._+-]+$/;

export type ReleasePageCheck = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly reason: string };

/**
 * PD-STARTUP-014: the release's page is opened only if it is an `https` page of the feed's own repository on the host that
 * serves it. OQ-556's ruling spells that out — an `https` address on that host, under the feed repository's releases path,
 * with no user information and no port but the default — and this is it, pure, so every refusal is decided in a test. The
 * answer's `url` is the parsed address as WHATWG serialises it, which is what is opened; a refusal's `reason` is for the one
 * log line, never a surface.
 *
 * Stricter than the ruling's letter where the letter leaves room for a trick, each a refusal: any `%` (no percent-encoding,
 * so no encoded `/`, `\` or `.` segment reaches the host), a backslash, whitespace or a control character, a `.` or `..`
 * segment in the text as written (the parser would resolve it away before the path is read), a query or a fragment, and an
 * address longer than `RELEASE_PAGE_MAX_LENGTH`. The repository's owner and name are compared exactly as `FEED_REPOSITORY`
 * spells them; the path must name something below `/releases/`, not the releases index itself.
 */
export function checkReleasePage(value: unknown, repository: { readonly owner: string; readonly repo: string } = FEED_REPOSITORY, host: string = RELEASE_PAGE_HOST): ReleasePageCheck {
  if (typeof value !== 'string' || value === '') return { ok: false, reason: 'the feed states no page for the release' };
  if (value.length > RELEASE_PAGE_MAX_LENGTH) return { ok: false, reason: `the page address is ${value.length} characters, over ${RELEASE_PAGE_MAX_LENGTH}` };
  if ([...value].some((ch) => { const code = ch.codePointAt(0)!; return code <= 0x20 || (code >= 0x7f && code <= 0x9f); })) return { ok: false, reason: 'the page address carries whitespace or a control character' };
  if (value.includes('\\')) return { ok: false, reason: 'the page address carries a backslash' };
  if (value.includes('%')) return { ok: false, reason: 'the page address is percent-encoded' };
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)/.exec(value);
  if (scheme === null) return { ok: false, reason: 'the page address is not an absolute web address' };
  if (scheme[2]!.includes('@')) return { ok: false, reason: 'the page address carries user information' };
  if (scheme[3]!.split('/').some((segment) => segment === '.' || segment === '..')) return { ok: false, reason: 'the page address carries a dot segment' };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: 'the page address does not parse' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, reason: `the page address is ${parsed.protocol.replace(':', '')}, not https` };
  if (parsed.username !== '' || parsed.password !== '') return { ok: false, reason: 'the page address carries user information' };
  if (parsed.hostname !== host) return { ok: false, reason: `the page is on ${parsed.hostname}, not ${host}` };
  // WHATWG drops the scheme's default port, so `:443` reads as none here and any other stays.
  if (parsed.port !== '') return { ok: false, reason: `the page address names port ${parsed.port}` };
  if (parsed.search !== '' || parsed.hash !== '' || value.includes('?') || value.includes('#')) return { ok: false, reason: 'the page address carries a query or a fragment' };
  const segments = parsed.pathname.split('/').slice(1);
  if (segments[0] !== repository.owner || segments[1] !== repository.repo) return { ok: false, reason: `the page is not of ${repository.owner}/${repository.repo}` };
  if (segments[2] !== 'releases') return { ok: false, reason: `the page is outside /${repository.owner}/${repository.repo}/releases/` };
  const below = segments.slice(3);
  if (below.length === 0 || below.some((segment) => !PAGE_SEGMENT.test(segment) || segment === '.' || segment === '..')) {
    return { ok: false, reason: `the page does not name one release below /${repository.owner}/${repository.repo}/releases/` };
  }
  return { ok: true, url: parsed.href };
}

/**
 * PD-STARTUP-014's offer: what a link-only build holds once the feed names a release strictly newer than the running one
 * (REQ-STARTUP-109; drafts and prereleases are already a check failure in `parseLatestRelease`). No asset is matched —
 * REQ-STARTUP-107's and REQ-STARTUP-108's asset conditions do not apply — and the page is kept as the feed stated it, checked
 * here for the face and again at the press (OQ-556).
 */
export interface LinkOffer {
  readonly version: string;
  readonly summary: string;
  /** `html_url` as the feed stated it; `checkReleasePage` decides whether it is opened. */
  readonly page: string | null;
}

export function selectLinkOffer(release: LatestRelease, runningVersion: string): LinkOffer | null {
  if (!isStrictlyNewer(release.version, runningVersion)) return null;
  return { version: release.version, summary: releaseSummary(release.body), page: release.page };
}
