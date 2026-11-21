import { describe, expect, it } from 'vitest';
import { checkReleasePage, exactAsset, FEED_ACCEPT, FEED_ENDPOINT, FEED_TIMEOUT_MS, parseLatestRelease, RELEASE_PAGE_HOST, RELEASE_PAGE_MAX_LENGTH, releaseSummary, selectLinkOffer, selectOffer, SUMMARY_LIMIT, type LatestRelease } from './feed.js';

const release = (over: Partial<{ tag_name: unknown; draft: unknown; prerelease: unknown; body: unknown; assets: unknown; html_url: unknown }> = {}) => JSON.stringify({
  tag_name: 'v0.2.0',
  html_url: 'https://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0',
  draft: false,
  prerelease: false,
  body: '## Changes\n\n- Faster startup\n',
  assets: [
    { name: 'Rotaris-0.2.0-windows-x64-setup.exe', browser_download_url: 'https://github.com/Concrete-Dynamics/Rotaris/releases/download/v0.2.0/Rotaris-0.2.0-windows-x64-setup.exe', size: 125_000_000 },
    { name: 'Rotaris-0.2.0-windows-x64-portable.exe', browser_download_url: 'https://github.com/x/portable', size: 190_000_000 },
    { name: 'SHA256SUMS.txt', browser_download_url: 'https://github.com/x/sums', size: 200 },
    { name: 'SHA256SUMS.txt.sig', browser_download_url: 'https://github.com/x/sig', size: 64 },
  ],
  ...over,
});

const parsed = (text: string): LatestRelease => {
  const p = parseLatestRelease(text);
  if (!p.ok) throw new Error(p.reason);
  return p.release;
};

describe('the release feed — REQ-STARTUP-105', () => {
  it('is exactly one fixed endpoint, the latest-release API of the product repository, with the fixed Accept header and a 10.0 s timeout', () => {
    expect(FEED_ENDPOINT).toBe('https://api.github.com/repos/Concrete-Dynamics/Rotaris/releases/latest');
    expect(FEED_ACCEPT).toBe('application/vnd.github+json');
    expect(FEED_TIMEOUT_MS).toBe(10_000);
  });
});

describe('what the check consumes of a release, and what it refuses — REQ-STARTUP-109, REQ-STARTUP-110', () => {
  it('reads tag_name, body and the assets\' name, browser_download_url and integer size (0 when absent)', () => {
    const r = parsed(release({ assets: [{ name: 'a', browser_download_url: 'https://a', size: 12 }, { name: 'b', browser_download_url: 'https://b' }, { name: 'c', browser_download_url: 'https://c', size: 3.5 }] }));
    expect(r.version).toBe('0.2.0');
    expect(r.body).toBe('## Changes\n\n- Faster startup\n');
    expect(r.assets).toEqual([{ name: 'a', url: 'https://a', size: 12 }, { name: 'b', url: 'https://b', size: 0 }, { name: 'c', url: 'https://c', size: 0 }]);
  });

  it('refuses a structurally invalid payload with a reason for the log: non-JSON, non-object, draft, prerelease, a missing or malformed tag', () => {
    expect(parseLatestRelease('<html>')).toMatchObject({ ok: false, reason: expect.stringContaining('not JSON') });
    expect(parseLatestRelease('[]')).toEqual({ ok: false, reason: 'the payload is not an object' });
    expect(parseLatestRelease('null')).toEqual({ ok: false, reason: 'the payload is not an object' });
    expect(parseLatestRelease(release({ draft: true }))).toEqual({ ok: false, reason: 'the payload is flagged draft' });
    expect(parseLatestRelease(release({ prerelease: true }))).toEqual({ ok: false, reason: 'the payload is flagged prerelease' });
    expect(parseLatestRelease(release({ tag_name: undefined }))).toEqual({ ok: false, reason: 'the payload carries no tag_name' });
    expect(parseLatestRelease(release({ tag_name: 'v0.102.0-rc1' }))).toEqual({ ok: false, reason: 'the tag "v0.102.0-rc1" is outside the release-tag grammar' });
    expect(parseLatestRelease(release({ tag_name: 'v0.102' }))).toMatchObject({ ok: false });
  });

  it('skips an asset entry that is not an object with a string name and url, never guessing at it', () => {
    const r = parsed(release({ assets: [null, 'x', { name: 1, browser_download_url: 'https://a' }, { name: 'ok', browser_download_url: 'https://ok', size: 1 }] }));
    expect(r.assets).toEqual([{ name: 'ok', url: 'https://ok', size: 1 }]);
    expect(parsed(release({ assets: undefined })).assets).toEqual([]);
  });
});

describe('the offer rule — REQ-STARTUP-107, REQ-STARTUP-108, REQ-STARTUP-109', () => {
  it('offers the exact asset for the flavour when the release is strictly newer', () => {
    const offer = selectOffer(parsed(release()), '0.1.0', 'installer');
    expect(offer).toMatchObject({ version: '0.2.0', asset: { name: 'Rotaris-0.2.0-windows-x64-setup.exe', size: 125_000_000 }, summary: 'Faster startup' });
    expect(offer?.manifest?.name).toBe('SHA256SUMS.txt');
    expect(offer?.signature?.name).toBe('SHA256SUMS.txt.sig');
    expect(selectOffer(parsed(release()), '0.1.0', 'portable')?.asset.name).toBe('Rotaris-0.2.0-windows-x64-portable.exe');
  });

  it('offers nothing when the version is equal or older, or when the running version does not parse', () => {
    expect(selectOffer(parsed(release()), '0.2.0', 'installer')).toBeNull();
    expect(selectOffer(parsed(release()), '0.3.0', 'installer')).toBeNull();
    expect(selectOffer(parsed(release()), 'dev', 'installer')).toBeNull();
  });

  it('a running prerelease is offered the stable release of its own tuple', () => {
    expect(selectOffer(parsed(release()), '0.2.0rc1', 'installer')).not.toBeNull();
  });

  it('a release lacking this flavour\'s file offers nothing — a real answer, not an error', () => {
    expect(selectOffer(parsed(release()), '0.1.0', 'appimage')).toBeNull();
    expect(selectOffer(parsed(release()), '0.1.0', 'app-bundle')).toBeNull();
  });

  it('matches an asset by its exact published name only: re-cased, re-separated, prefixed, suffixed and substring names are rejected', () => {
    const assets = [
      { name: 'rotaris-0.2.0-windows-x64-setup.exe', url: 'u', size: 1 },
      { name: 'Rotaris_0.2.0_windows_x64_setup.exe', url: 'u', size: 1 },
      { name: 'Rotaris-0.2.0-windows-x64-setup.exe.zip', url: 'u', size: 1 },
      { name: 'v-Rotaris-0.2.0-windows-x64-setup.exe', url: 'u', size: 1 },
      { name: 'Rotaris-0.2-windows-x64-setup.exe', url: 'u', size: 1 },
      { name: 'Rotaris-0.2.0-windows-x64-setup', url: 'u', size: 1 },
    ];
    expect(exactAsset(assets, 'Rotaris-0.2.0-windows-x64-setup.exe')).toBeNull();
    expect(selectOffer({ version: '0.2.0', body: '', assets, page: null }, '0.1.0', 'installer')).toBeNull();
    expect(exactAsset([...assets, { name: 'Rotaris-0.2.0-windows-x64-setup.exe', url: 'yes', size: 1 }], 'Rotaris-0.2.0-windows-x64-setup.exe')?.url).toBe('yes');
  });

  it('the manifest and the signature are located by exact name too, and may be absent', () => {
    const offer = selectOffer(parsed(release({ assets: [{ name: 'Rotaris-0.2.0-windows-x64-setup.exe', browser_download_url: 'u', size: 1 }, { name: 'sha256sums.txt', browser_download_url: 'u', size: 1 }] })), '0.1.0', 'installer');
    expect(offer?.manifest).toBeNull();
    expect(offer?.signature).toBeNull();
  });
});

describe('the banner summary — REQ-STARTUP-112', () => {
  it('starts after a `## Changes` heading (case-insensitive) when there is one', () => {
    expect(releaseSummary('## Rotaris 0.2.0\nBuilt from tag v0.2.0\n\n## changes\n\n- Faster startup\n- Smaller download')).toBe('Faster startup');
    expect(releaseSummary('## Rotaris 0.2.0\nBuilt from tag v0.2.0')).toBe('Built from tag v0.2.0');
  });

  it('reads "a `## Changes` heading" as a level-2 heading whose text is `Changes` alone: `## Changes:` or `## Changes in 0.2.0` is another heading and starts nothing', () => {
    // The reading pinned: REQ-STARTUP-112 names the heading by its text, so a heading with more text is not it; the
    // search then runs from the top, where that heading is itself skipped as scaffolding.
    expect(releaseSummary('Intro line\n## Changes:\n- Faster startup')).toBe('Intro line');
    expect(releaseSummary('Intro line\n## Changes in 0.2.0\n- Faster startup')).toBe('Intro line');
    expect(releaseSummary('Intro line\n###  CHANGES \n- Faster startup')).toBe('Intro line');
    expect(releaseSummary('Intro line\n  ##   CHANGES  \n- Faster startup')).toBe('Faster startup');
  });

  it('skips blank lines, headings, table rows, blockquotes and code fences, and strips a leading bullet marker', () => {
    const body = ['## Changes', '', '### Sub', '| name | digest |', '|---|---|', '> quoted', '```', 'not this', '```', '* The first substantive line', '- second'].join('\n');
    expect(releaseSummary(body)).toBe('The first substantive line');
    expect(releaseSummary('~~~\ncode\n~~~\n- after the fence')).toBe('after the fence');
  });

  it('truncates to 160 characters as 159 plus an ellipsis, and leaves 160 alone', () => {
    const long = 'x'.repeat(200);
    const out = releaseSummary(`## Changes\n- ${long}`);
    expect([...out].length).toBe(SUMMARY_LIMIT);
    expect(out).toBe(`${'x'.repeat(159)}…`);
    expect(releaseSummary(`- ${'y'.repeat(160)}`)).toBe('y'.repeat(160));
  });

  it('an empty or scaffolding-only body yields an empty summary', () => {
    expect(releaseSummary('')).toBe('');
    expect(releaseSummary('## Changes\n\n### heading\n| a | b |\n> quote\n```\nfence\n```\n')).toBe('');
    expect(releaseSummary('- \n*   \n')).toBe('');
  });
});

const PAGE = 'https://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0';
const refused = (value: unknown): string => {
  const c = checkReleasePage(value);
  if (c.ok) throw new Error(`accepted ${JSON.stringify(value)} as ${c.url}`);
  return c.reason;
};

describe('the release page of a link-only offer — PD-STARTUP-014, OQ-556', () => {
  it('reads html_url as the feed states it, and null when it is absent or not a string', () => {
    expect(parsed(release()).page).toBe(PAGE);
    expect(parsed(release({ html_url: undefined })).page).toBeNull();
    expect(parsed(release({ html_url: 42 })).page).toBeNull();
    expect(parsed(release({ html_url: { href: PAGE } })).page).toBeNull();
  });

  it('accepts an https page of the feed repository on its own host, under its releases path, and answers it as serialised', () => {
    expect(RELEASE_PAGE_HOST).toBe('github.com');
    expect(checkReleasePage(PAGE)).toEqual({ ok: true, url: PAGE });
    expect(checkReleasePage('https://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.1.0rc5')).toEqual({ ok: true, url: 'https://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.1.0rc5' });
    // The default port is no port (OQ-556: "no port but the default"); WHATWG drops it from what is opened.
    expect(checkReleasePage('https://github.com:443/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toEqual({ ok: true, url: PAGE });
  });

  it('refuses http and every other scheme', () => {
    expect(refused('http://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/http, not https/);
    expect(refused('javascript://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/not https/);
    expect(refused('file:///Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/not https|not on|not an absolute|not of/);
    expect(refused('//github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/not an absolute/);
    expect(refused('github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/not an absolute/);
  });

  it('refuses another host, the API host included, and a host that only starts or ends like it', () => {
    expect(refused('https://api.github.com/repos/Concrete-Dynamics/Rotaris/releases/latest')).toMatch(/on api\.github\.com, not github\.com/);
    expect(refused('https://evil.example/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/not github\.com/);
    expect(refused('https://github.com.evil.example/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/not github\.com/);
    expect(refused('https://notgithub.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/not github\.com/);
    expect(refused('https://gist.github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/not github\.com/);
    expect(refused('https://github.com./Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/not github\.com/);
  });

  it('refuses another repository, another owner, and a spelling of either that is not the feed\'s own', () => {
    expect(refused('https://github.com/Concrete-Dynamics/Other/releases/tag/v0.2.0')).toMatch(/not of Concrete-Dynamics\/Rotaris/);
    expect(refused('https://github.com/someone/Rotaris/releases/tag/v0.2.0')).toMatch(/not of/);
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris-legacy/releases/tag/v0.2.0')).toMatch(/not of/);
    expect(refused('https://github.com/concrete-dynamics/rotaris/releases/tag/v0.2.0')).toMatch(/not of/);
    expect(refused('https://github.com/Concrete-Dynamics/releases/tag/v0.2.0')).toMatch(/not of|outside/);
  });

  it('refuses a path outside /releases/, and the releases index itself', () => {
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris')).toMatch(/outside/);
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/issues/1')).toMatch(/outside \/Concrete-Dynamics\/Rotaris\/releases\//);
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/releasesX/tag/v0.2.0')).toMatch(/outside/);
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/releases')).toMatch(/does not name one release/);
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/releases/')).toMatch(/does not name one release/);
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/releases/tag//v0.2.0')).toMatch(/does not name one release/);
  });

  it('refuses user information, empty or not', () => {
    expect(refused('https://user@github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/user information/);
    expect(refused('https://user:secret@github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/user information/);
    expect(refused('https://@github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/user information/);
    expect(refused('https://github.com@evil.example/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/user information/);
  });

  it('refuses any port but the default', () => {
    expect(refused('https://github.com:8443/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/port 8443/);
    expect(refused('https://github.com:80/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/port 80/);
    // An empty port is the default one, serialised away like `:443`.
    expect(checkReleasePage('https://github.com:/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toEqual({ ok: true, url: PAGE });
  });

  it('refuses traversal, encoded or written out, before the parser can resolve it into an accepted path', () => {
    // WHATWG resolves `..` and `%2e%2e` segments, so each of these would otherwise parse to a path that looks fine or one
    // that leaves the repository; every one is refused as written.
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/releases/%2e%2e/%2e%2e/Other/releases/tag/v1')).toMatch(/percent-encoded/);
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/releases/..%2F..%2FOther')).toMatch(/percent-encoded/);
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/releases/%2E%2E')).toMatch(/percent-encoded/);
    expect(refused('https://github.com/%43oncrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/percent-encoded/);
    expect(refused('https://github.com/Other/x/../../Concrete-Dynamics/Rotaris/releases/tag/v0.2.0')).toMatch(/dot segment/);
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0/..')).toMatch(/dot segment/);
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/releases/./tag/v0.2.0')).toMatch(/dot segment/);
    expect(refused('https://github.com\\Concrete-Dynamics\\Rotaris\\releases\\tag\\v0.2.0')).toMatch(/backslash/);
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0\\..\\..')).toMatch(/backslash/);
  });

  it('refuses a query, a fragment, whitespace and control characters', () => {
    expect(refused(`${PAGE}?redirect=https://evil.example`)).toMatch(/query or a fragment/);
    expect(refused(`${PAGE}#x`)).toMatch(/query or a fragment/);
    expect(refused(`${PAGE}?`)).toMatch(/query or a fragment/);
    expect(refused(` ${PAGE}`)).toMatch(/whitespace or a control/);
    expect(refused(`${PAGE}\n`)).toMatch(/whitespace or a control/);
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0\u0000')).toMatch(/control/);
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/releases/tag/v 0.2.0')).toMatch(/whitespace/);
  });

  it('refuses a value too long to be a release page, and one that is no string at all', () => {
    const long = `https://github.com/Concrete-Dynamics/Rotaris/releases/tag/${'v'.repeat(RELEASE_PAGE_MAX_LENGTH)}`;
    expect(refused(long)).toMatch(new RegExp(`over ${RELEASE_PAGE_MAX_LENGTH}`));
    const exactly = `https://github.com/Concrete-Dynamics/Rotaris/releases/tag/${'v'.repeat(RELEASE_PAGE_MAX_LENGTH - PAGE.length + 'v0.2.0'.length)}`;
    expect(exactly.length).toBe(RELEASE_PAGE_MAX_LENGTH);
    expect(checkReleasePage(exactly).ok).toBe(true);
    for (const value of [null, undefined, '', 42, {}, [PAGE]]) expect(refused(value)).toMatch(/states no page/);
  });

  it('refuses a segment outside the release-name characters', () => {
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0;x')).toMatch(/does not name one release/);
    expect(refused("https://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0'")).toMatch(/does not name one release/);
    expect(refused('https://github.com/Concrete-Dynamics/Rotaris/releases/tag/é')).toMatch(/does not name one release|percent-encoded/);
  });
});

describe('the link-only offer — PD-STARTUP-014, REQ-STARTUP-109', () => {
  it('offers a strictly newer release with its summary and page, and matches no asset', () => {
    expect(selectLinkOffer(parsed(release({ assets: [] })), '0.1.0')).toEqual({ version: '0.2.0', summary: 'Faster startup', page: PAGE });
    expect(selectLinkOffer(parsed(release({ html_url: undefined })), '0.1.0')).toEqual({ version: '0.2.0', summary: 'Faster startup', page: null });
  });

  it('offers nothing for the same or an older version', () => {
    expect(selectLinkOffer(parsed(release()), '0.2.0')).toBeNull();
    expect(selectLinkOffer(parsed(release()), '0.3.0')).toBeNull();
  });
});
