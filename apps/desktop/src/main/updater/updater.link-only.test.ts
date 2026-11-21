import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import type { UpdateState } from '@rotaris/contracts';
import type { AppLogLevel } from '../app-log.js';
import { createNoticeStore } from '../notices.js';
import { classifyInstallation, type Classification } from './classify.js';
import { FEED_ACCEPT, FEED_ENDPOINT, FEED_TIMEOUT_MS, SUMMARY_FALLBACK } from './feed.js';
import { memoryDisk, plantPending } from './memory-disk.test-support.js';
import type { NetworkResponse } from './install.js';
import { createUpdater, offerTitle, OPEN_RELEASE_PAGE, RELEASE_PAGE_NOT_OPENED } from './updater.js';

/**
 * PD-STARTUP-014 (R-117, the plan's Stage 3) — the link-only build: packaged, classified not updatable, still checked. Every
 * port but the feed request, the notices, the waved-off version and the opener is a fake that fails the test when touched,
 * because the directive's "and nothing else" is the point: no launch-time settlement, no asset, no download, no apply.
 */

const PAGE = 'https://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0';
/** The Debian package's classification, decided by the real classifier (PD-STARTUP-013, PD-STARTUP-014). */
const deb = classifyInstallation({ platform: 'linux', packaged: true, execPath: '/opt/Rotaris/rotaris', env: {}, installDir: null });

interface Options {
  readonly classification?: Classification;
  readonly feed?: { readonly version?: string; readonly body?: string; readonly page?: unknown; readonly draft?: boolean; readonly prerelease?: boolean; readonly status?: number; readonly fails?: string; readonly text?: string };
  readonly running?: string;
  readonly dismissed?: string;
  readonly open?: 'opens' | 'refuses' | 'throws';
}

function harness(options: Options = {}) {
  const requests: { url: string; accept?: string; timeoutMs?: number }[] = [];
  let feed = options.feed ?? {};
  const body = (): string => feed.text ?? JSON.stringify({
    tag_name: `v${feed.version ?? '0.2.0'}`, draft: feed.draft ?? false, prerelease: feed.prerelease ?? false,
    body: feed.body ?? '## Changes\n- Faster startup\n',
    ...('page' in feed ? (feed.page === undefined ? {} : { html_url: feed.page }) : { html_url: PAGE }),
    assets: [{ name: `Rotaris-${feed.version ?? '0.2.0'}-linux-x86_64.AppImage`, browser_download_url: 'https://dl/asset', size: 10 }],
  });
  const logged: string[] = [];
  const touched: string[] = [];
  const opened: string[] = [];
  const acks: string[] = [];
  const states: UpdateState[] = [];
  const disk = memoryDisk();
  let dismissed = options.dismissed;
  const notices = createNoticeStore({
    broadcast: () => undefined,
    pushAcknowledgement: (a) => { acks.push(`${a.kind}:${a.title}${a.body === undefined ? '' : `:${a.body}`}`); },
    record: async () => true,
    log: () => undefined,
    focusedSession: () => 's1',
  });
  const never = (what: string) => () => { touched.push(what); throw new Error(`${what} must not be reached by a link-only build`); };
  const updater = createUpdater({
    classification: options.classification ?? deb,
    runningVersion: options.running ?? '0.1.0',
    network: {
      get: async (url, o): Promise<NetworkResponse> => {
        requests.push({ url, ...(o.accept === undefined ? {} : { accept: o.accept }), ...(o.timeoutMs === undefined ? {} : { timeoutMs: o.timeoutMs }) });
        if (url !== FEED_ENDPOINT) throw new Error(`a link-only build requested ${url}`);
        if (feed.fails) throw new Error(feed.fails);
        const text = body();
        return { status: feed.status ?? 200, body: (async function* () { yield Buffer.from(text); })() };
      },
    },
    updates: disk.area,
    files: { makeExecutable: never('files'), pathKind: never('files'), copyFile: never('files'), copyAside: never('files'), flushFile: never('files'), flushDirectory: never('files'), rename: never('files'), removeFile: never('files') },
    spawn: { spawnDetached: never('spawn') },
    handOffRecord: { read: never('hand-off record'), clear: never('hand-off record') },
    dismissedVersion: { read: () => dismissed, write: async (v) => { dismissed = v; } },
    notices,
    connectionCost: never('connection cost'),
    publishState: (s) => { states.push(s); },
    log: (level: AppLogLevel, message: string) => { logged.push(`${level}: ${message}`); },
    openPage: async (url) => {
      opened.push(url);
      if (options.open === 'throws') throw new Error('xdg-open: not found');
      return options.open === 'refuses' ? { ok: false, reason: 'the default browser did not answer within 5 s' } : { ok: true };
    },
    timers: new FakeClock().timers,
    wall: new FakeClock().wall,
    startSuccessor: never('successor'),
    closeWindows: never('close windows'),
    activeRuns: never('active runs'),
    confirmClose: never('confirm close'),
    confirmUnsaved: never('confirm unsaved'),
    integrationAllows: never('integration'),
  });
  return { updater, requests, logged, touched, opened, acks, states, disk, notices, dismissed: () => dismissed, setFeed: (next: Options['feed']) => { feed = next ?? {}; } };
}

describe('the link-only check — PD-STARTUP-014, REQ-STARTUP-105, REQ-STARTUP-106 as narrowed', () => {
  it('the Debian package, a packaged macOS build and a packaged Windows build naming no artifact are each link-only', () => {
    expect(deb).toMatchObject({ updatable: false, notifiable: true });
    expect(classifyInstallation({ platform: 'darwin', packaged: true, execPath: '/Applications/Rotaris.app/Contents/MacOS/Rotaris', env: {}, installDir: null })).toMatchObject({ updatable: false, notifiable: true });
    expect(classifyInstallation({ platform: 'win32', packaged: true, execPath: 'D:\\copied\\Rotaris.exe', env: {}, installDir: null })).toMatchObject({ updatable: false, notifiable: true });
  });

  it('issues exactly one request, to the one endpoint with its Accept header and 10.0 s timeout, and touches nothing else', async () => {
    const h = harness();
    expect(await h.updater.activate({ windowId: 1 })).toBe('offered');
    expect(h.requests).toEqual([{ url: FEED_ENDPOINT, accept: FEED_ACCEPT, timeoutMs: FEED_TIMEOUT_MS }]);
    // REQ-STARTUP-173: no launch-time settlement, no pending update read or written, no asset, no apply, no metered probe.
    expect(h.disk.ops).toEqual([]);
    expect(h.touched).toEqual([]);
    expect(h.logged[0]).toMatch(/^info: update check: window 1, a link-only build \(a packaged Linux build with no APPIMAGE .*\), GET https:\/\/api\.github\.com\/.* \(REQ-STARTUP-105, PD-STARTUP-014\)$/);
  });

  it('a newer release raises `Rotaris {version} is available` with the summary and `Open release page`, and no indicator', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    expect(h.notices.current()).toMatchObject({ severity: 'info', title: offerTitle('0.2.0'), message: 'Faster startup', persistent: true, action: { label: OPEN_RELEASE_PAGE, action: { kind: 'open-release-page' } } });
    expect(h.notices.current()?.progress).toBeUndefined();
    expect(h.updater.state()).toMatchObject({ kind: 'link-offered', offer: { version: '0.2.0', page: PAGE } });
    // PD-SHELL-018: the title-bar indicator has nothing to draw for a link-only offer.
    expect(h.updater.updateState().phase).toBe('none');
    for (const s of h.states) expect(s.phase).toBe('none');
    expect(h.logged.some((l) => l.includes(`offered with ${OPEN_RELEASE_PAGE} (${PAGE})`) && l.includes('nothing is matched, downloaded or applied'))).toBe(true);
  });

  it('offers a release whose assets name no file for this build: no asset condition applies (REQ-STARTUP-107/108 as narrowed)', async () => {
    const h = harness({ feed: { text: JSON.stringify({ tag_name: 'v0.2.0', draft: false, prerelease: false, body: '', html_url: PAGE, assets: [] }) } });
    expect(await h.updater.activate({ windowId: 1 })).toBe('offered');
    // REQ-STARTUP-116: an empty summary falls back.
    expect(h.notices.current()).toMatchObject({ message: SUMMARY_FALLBACK });
  });

  it('offers nothing for the running version or an older one (REQ-STARTUP-109)', async () => {
    for (const running of ['0.2.0', '0.3.0']) {
      const h = harness({ running });
      expect(await h.updater.activate({ windowId: 1 })).toBe('none');
      expect(h.notices.current()).toBeNull();
      expect(h.requests).toHaveLength(1);
    }
  });

  it('a draft or prerelease payload, a non-200 answer, a transport failure and a malformed body are each invisible (REQ-STARTUP-110)', async () => {
    for (const feed of [{ draft: true }, { prerelease: true }, { status: 503 }, { fails: 'getaddrinfo ENOTFOUND api.github.com' }, { text: '<html>' }]) {
      const h = harness({ feed });
      expect(await h.updater.activate({ windowId: 1 }), JSON.stringify(feed)).toBe('failed');
      expect(h.notices.current()).toBeNull();
      expect(h.acks).toEqual([]);
      expect(h.logged.filter((l) => l.includes('failed silently'))).toHaveLength(1);
      expect(h.logged.find((l) => l.includes('failed silently'))).toMatch(/^info: /);
    }
  });

  it('a waved-off version stays silent, and a newer one offers again (REQ-STARTUP-116, REQ-STARTUP-117)', async () => {
    const h = harness({ dismissed: '0.2.0' });
    expect(await h.updater.activate({ windowId: 1 })).toBe('dismissed');
    expect(h.notices.current()).toBeNull();
    h.setFeed({ version: '0.3.0', page: 'https://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.3.0' });
    expect(await h.updater.activate({ windowId: 2 })).toBe('offered');
    expect(h.notices.current()).toMatchObject({ title: offerTitle('0.3.0') });
  });

  it('dismissing the link-only notice waves its version off; the next check is silent', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    const id = h.notices.current()!.id;
    await h.updater.noticeDismissed(id);
    expect(h.dismissed()).toBe('0.2.0');
    expect(h.updater.state().kind).toBe('idle');
    expect(h.logged.some((l) => l.includes('Rotaris 0.2.0 is remembered as waved off (REQ-STARTUP-117)'))).toBe(true);
    await h.notices.dismiss(id);
    expect(await h.updater.activate({ windowId: 2 })).toBe('dismissed');
    expect(h.notices.current()).toBeNull();
  });

  it('a second window\'s check while the offer stands is not offered twice (REQ-STARTUP-114)', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    expect(await h.updater.activate({ windowId: 2 })).toBe('already-offered');
    expect(h.requests).toHaveLength(2);
  });

  it('a refused page is logged and withholds the action: the same notice with no action (PD-STARTUP-014)', async () => {
    for (const page of ['http://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0', 'https://evil.example/x', 'https://github.com/Concrete-Dynamics/Rotaris/issues/1', undefined]) {
      const h = harness({ feed: { page } });
      expect(await h.updater.activate({ windowId: 1 })).toBe('offered');
      expect(h.notices.current()).toMatchObject({ title: offerTitle('0.2.0') });
      expect(h.notices.current()?.action).toBeUndefined();
      expect(h.logged.filter((l) => /^warn: update check: the release page the feed states for Rotaris 0\.2\.0 is refused — .*; the offer is shown with no action/.test(l))).toHaveLength(1);
      // Its press, were one to arrive, opens nothing.
      expect(await h.updater.openReleasePage()).toMatchObject({ ok: true, value: { opened: false } });
      expect(h.opened).toEqual([]);
    }
  });

  it('install and restart are refused: a link-only build applies nothing', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    expect(await h.updater.install()).toMatchObject({ ok: false, code: 'update.notUpdatable' });
    expect(await h.updater.restart()).toMatchObject({ ok: false, code: 'update.notApplied' });
    expect(h.requests).toHaveLength(1);
    expect(h.touched).toEqual([]);
  });

  it('a development or source-tree build stays silent: no request, one line (REQ-STARTUP-106, REQ-STARTUP-150)', async () => {
    const dev = classifyInstallation({ platform: 'linux', packaged: false, execPath: '/repo/electron', env: {}, installDir: null });
    const h = harness({ classification: dev });
    expect(await h.updater.activate({ windowId: 1 })).toBe('not-updatable');
    expect(h.requests).toEqual([]);
    expect(h.logged).toEqual([expect.stringMatching(/^info: update check: this build is not updatable — a development or source-tree launch/)]);
  });

  it('a link-only build leaves a pending update and its files exactly as it found them (REQ-STARTUP-173)', async () => {
    const h = harness();
    plantPending(h.disk, { version: '0.2.0', flavour: 'appimage', platformKey: 'linux-x86_64', asset: { name: 'Rotaris-0.2.0-linux-x86_64.AppImage', size: 3, sha256: 'a'.repeat(64) }, state: 'verified', downloadedBy: '0.1.0', verifiedAt: '2026-11-21T12:00:00.000Z', applyAttempts: 0 }, Buffer.from('abc'));
    const before = JSON.stringify(h.disk.tree());
    h.disk.ops.length = 0;
    await h.updater.activate({ windowId: 1 });
    expect(h.disk.ops).toEqual([]);
    expect(JSON.stringify(h.disk.tree())).toBe(before);
  });
});

describe('`open-release-page` — PD-SHELL-018 revision 2, OQ-556, REQ-SHELL-040', () => {
  it('opens the page held with the offer, checked again at the press, and says so once', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    expect(await h.updater.openReleasePage()).toEqual({ ok: true, value: { opened: true, url: PAGE } });
    expect(h.opened).toEqual([PAGE]);
    expect(h.acks).toEqual([]);
    expect(h.logged.filter((l) => l.startsWith('info: update release page: opened'))).toEqual([`info: update release page: opened ${PAGE} for Rotaris 0.2.0 in the default browser (PD-STARTUP-014)`]);
    // The offer stands: the notice and the state are unchanged by the press.
    expect(h.updater.state().kind).toBe('link-offered');
    expect(h.notices.current()).toMatchObject({ title: offerTitle('0.2.0') });
  });

  it('opens the page as WHATWG serialises it, the default port dropped', async () => {
    const h = harness({ feed: { page: 'https://github.com:443/Concrete-Dynamics/Rotaris/releases/tag/v0.2.0' } });
    await h.updater.activate({ windowId: 1 });
    await h.updater.openReleasePage();
    expect(h.opened).toEqual([PAGE]);
  });

  it('a press with no offer held — never raised, or dismissed — writes one log line and opens nothing', async () => {
    const h = harness();
    expect(await h.updater.openReleasePage()).toEqual({ ok: true, value: { opened: false, reason: 'no link-only offer is held' } });
    expect(h.logged).toEqual(['info: update release page: pressed with no link-only offer held (idle); nothing is opened (OQ-556)']);
    await h.updater.activate({ windowId: 1 });
    await h.updater.noticeDismissed(h.notices.current()!.id);
    h.logged.length = 0;
    await h.updater.openReleasePage();
    expect(h.logged).toEqual(['info: update release page: pressed with no link-only offer held (idle); nothing is opened (OQ-556)']);
    expect(h.opened).toEqual([]);
    expect(h.acks).toEqual([]);
    expect(h.notices.current()).toMatchObject({ title: offerTitle('0.2.0') });
  });

  it('a press on an updatable build\'s state opens nothing either', async () => {
    const h = harness({ classification: { updatable: true, flavour: 'appimage', target: '/home/u/Rotaris.AppImage' } });
    expect(await h.updater.openReleasePage()).toMatchObject({ ok: true, value: { opened: false } });
    expect(h.opened).toEqual([]);
  });

  it('a browser that refuses or never answers raises REQ-SHELL-040\'s transient error naming the address, and the offer stands', async () => {
    for (const open of ['refuses', 'throws'] as const) {
      const h = harness({ open });
      await h.updater.activate({ windowId: 1 });
      const outcome = await h.updater.openReleasePage();
      expect(outcome).toMatchObject({ ok: false, code: 'update.releasePage', headline: RELEASE_PAGE_NOT_OPENED });
      expect(h.acks).toHaveLength(1);
      expect(h.acks[0]).toMatch(new RegExp(`^fail:${RELEASE_PAGE_NOT_OPENED}:${PAGE.replace(/[.?]/g, '\\$&')} — `));
      expect(h.logged.some((l) => l.startsWith(`warn: update release page: ${PAGE} — `) && l.endsWith('(REQ-SHELL-040)'))).toBe(true);
      // The action stays: pressed again, it is tried again.
      expect(h.notices.current()).toMatchObject({ action: { action: { kind: 'open-release-page' } } });
      await h.updater.openReleasePage();
      expect(h.opened).toEqual([PAGE, PAGE]);
    }
  });
});
