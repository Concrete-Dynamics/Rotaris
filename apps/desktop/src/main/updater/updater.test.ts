import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakeClock, millis } from '@rotaris/kernel';
import { formatChecksumManifest } from '@rotaris/release-naming';
import type { AppLogLevel } from '../app-log.js';
import { createNoticeStore, type NoticeRecord } from '../notices.js';
import type { Classification } from './classify.js';
import type { DownloadSink } from './download.js';
import { FEED_ACCEPT, FEED_ENDPOINT, FEED_TIMEOUT_MS, SUMMARY_FALLBACK } from './feed.js';
import type { NetworkResponse, StagingArea, UpdateNetwork } from './install.js';
import type { StrategyFiles, StrategySpawn } from './strategies.js';
import { createUpdater, DOWNLOAD_IN_PROGRESS, downloadingMessage, downloadingTitle, FINISH_TITLE, INSTALLED_TITLE, INSTALLER_AUTO_CLOSE_MS, NOT_INSTALLED_MESSAGE, NOT_INSTALLED_TITLE, offerTitle, RESTART_NOW, TRY_AGAIN, UPDATE_NOW, type UpdaterDeps } from './updater.js';

const PORTABLE = 'Rotaris-0.2.0-windows-x64-portable.exe';
const SETUP = 'Rotaris-0.2.0-windows-x64-setup.exe';
const TARGET = 'E:\\Rotaris-0.1.0-windows-x64-portable.exe';
const INSTALL_DIR = 'C:\\Users\\u\\AppData\\Local\\Rotaris';
const payload = Buffer.alloc(2_500_000, 3);
const digest = createHash('sha256').update(payload).digest('hex');

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { pem: publicKey.export({ type: 'spki', format: 'pem' }) as string, privateKey };
}

interface FeedOptions {
  readonly version?: string;
  readonly body?: string;
  readonly status?: number;
  readonly text?: string;
  readonly assets?: readonly { name: string; size?: number }[];
  readonly fails?: string;
  /** Hold the feed response until `release()` is called. */
  readonly hold?: boolean;
}

/** A release server: the feed, the manifest, the signature and one asset, all by URL, every request recorded. */
function server(options: FeedOptions = {}) {
  const pair = keyPair();
  const version = options.version ?? '0.2.0';
  const assets = options.assets ?? [{ name: PORTABLE, size: payload.byteLength }, { name: SETUP, size: payload.byteLength }, { name: 'SHA256SUMS.txt' }, { name: 'SHA256SUMS.txt.sig' }];
  const manifest = Buffer.from(formatChecksumManifest([{ name: PORTABLE, sha256: digest }, { name: SETUP, sha256: digest }]));
  const signature = sign(null, manifest, pair.privateKey);
  const feed = options.text ?? JSON.stringify({
    tag_name: `v${version}`, draft: false, prerelease: false, body: options.body ?? '## Changes\n- Faster startup\n',
    assets: assets.map((a) => ({ name: a.name, browser_download_url: `https://dl/${a.name}`, size: a.size ?? 0 })),
  });
  const requests: { url: string; accept?: string; timeoutMs?: number }[] = [];
  let releaseHold: (() => void) | null = null;
  const held = new Promise<void>((resolve) => { releaseHold = resolve; });
  const one = (bytes: Buffer): NetworkResponse => ({ status: 200, body: (async function* () { for (let at = 0; at < bytes.byteLength; at += 700_000) yield bytes.subarray(at, Math.min(bytes.byteLength, at + 700_000)); })() });
  const network: UpdateNetwork = {
    get: async (url, o) => {
      requests.push({ url, ...(o.accept === undefined ? {} : { accept: o.accept }), ...(o.timeoutMs === undefined ? {} : { timeoutMs: o.timeoutMs }) });
      if (url === FEED_ENDPOINT) {
        if (options.hold) await held;
        if (options.fails) throw new Error(options.fails);
        return { status: options.status ?? 200, body: (async function* () { yield Buffer.from(feed); })() };
      }
      if (url.endsWith('/SHA256SUMS.txt')) return one(manifest);
      if (url.endsWith('/SHA256SUMS.txt.sig')) return one(signature);
      if (url.endsWith(`/${PORTABLE}`) || url.endsWith(`/${SETUP}`)) {
        if (o.signal?.aborted) throw new Error('aborted');
        return one(payload);
      }
      throw new Error(`unexpected ${url}`);
    },
  };
  return { pair, network, requests, release: () => releaseHold?.() };
}

function stagingArea() {
  const files = new Map<string, Buffer>();
  const dirs = new Set<string>();
  let n = 0;
  const area: StagingArea = {
    create: async () => { const d = `/tmp/rotaris-update-${++n}`; dirs.add(d); return d; },
    join: (dir, name) => `${dir}/${name}`,
    open: async (path) => {
      const parts: Uint8Array[] = [];
      files.set(path, Buffer.alloc(0));
      const sink: DownloadSink & { close(): Promise<void> } = { write: async (c) => { parts.push(c); files.set(path, Buffer.concat(parts)); }, close: async () => undefined };
      return sink;
    },
    removeFile: async (p) => { files.delete(p); },
    removeDirectory: async (d) => { dirs.delete(d); },
  };
  return { area, files, dirs };
}

function volume(initial: Record<string, string>) {
  const files = new Map(Object.entries(initial));
  const ops: string[] = [];
  const port: StrategyFiles = {
    pathKind: async (p) => (files.has(p) ? 'file' : 'absent'),
    copyFile: async (from, to) => { ops.push(`copy:${to}`); files.set(to, `copy of ${from}`); },
    rename: async (from, to) => { ops.push(`rename:${from}→${to}`); files.set(to, files.get(from)!); files.delete(from); },
    removeFile: async (p) => { ops.push(`remove:${p}`); files.delete(p); },
  };
  return { files, ops, port };
}

const portable: Classification = { updatable: true, flavour: 'portable', target: TARGET };
const installer: Classification = { updatable: true, flavour: 'installer', target: INSTALL_DIR };
const dev: Classification = { updatable: false, reason: 'a development or source-tree launch, not a released standalone artifact (REQ-STARTUP-106)' };

function harness(options: { classification?: Classification; feed?: FeedOptions; running?: string; dismissed?: string; keys?: 'carried' | 'empty' | 'other'; successor?: 'passes' | 'fails' | 'never'; volumeFiles?: Record<string, string> } = {}) {
  const srv = server(options.feed);
  const clock = new FakeClock();
  const logged: string[] = [];
  const log = (level: AppLogLevel, message: string) => { logged.push(`${level}: ${message}`); };
  const recorded: NoticeRecord[] = [];
  const broadcasts: (number | null)[] = [];
  const notices = createNoticeStore({
    broadcast: (c) => { broadcasts.push(c.current?.id ?? null); },
    pushAcknowledgement: () => undefined,
    record: async (e) => { recorded.push(e); return true; },
    log: (line) => logged.push(`notice-store: ${line}`),
    focusedSession: () => 's1',
  });
  let dismissed = options.dismissed;
  const staging = stagingArea();
  const vol = volume(options.volumeFiles ?? { [TARGET]: 'v0.1.0' });
  const spawned: string[] = [];
  const spawn: StrategySpawn = { spawnDetached: async (exe) => { spawned.push(exe); } };
  const started: string[] = [];
  let closed = 0;
  const keys = options.keys === 'empty' ? [] : options.keys === 'other' ? [keyPair().pem] : [srv.pair.pem];
  const deps: UpdaterDeps = {
    classification: options.classification ?? portable,
    runningVersion: options.running ?? '0.1.0',
    network: srv.network, staging: staging.area, files: vol.port, spawn, keys,
    dismissedVersion: { read: () => dismissed, write: async (v) => { dismissed = v; } },
    notices, log, timers: clock.timers,
    startSuccessor: async (target) => {
      started.push(target);
      if (options.successor === 'fails') throw new Error('EACCES: cannot execute');
      if (options.successor === 'never') await new Promise<void>(() => undefined);
    },
    closeWindows: () => { closed += 1; },
  };
  const updater = createUpdater(deps);
  return { updater, srv, clock, logged, recorded, broadcasts, notices, staging, vol, spawned, started, closed: () => closed, dismissed: () => dismissed };
}

describe('activation — REQ-STARTUP-106, REQ-STARTUP-114, REQ-STARTUP-057, REQ-STARTUP-150', () => {
  it('a build classified not updatable performs no check, issues no request, and writes one line to the application log', async () => {
    const h = harness({ classification: dev });
    expect(await h.updater.activate({ windowId: 1 })).toBe('not-updatable');
    expect(h.srv.requests).toEqual([]);
    expect(h.notices.current()).toBeNull();
    expect(h.logged).toEqual([`info: update check: this build is not updatable — ${dev.updatable ? '' : dev.reason}; no request is made (REQ-STARTUP-106)`]);
  });

  it('a demo window issues no request on any runtime', async () => {
    const h = harness();
    expect(await h.updater.activate({ windowId: 1, demo: true })).toBe('demo');
    expect(h.srv.requests).toEqual([]);
  });

  it('the check contacts the one endpoint with the Accept header and the 10.0 s timeout, and offers the exact asset for the flavour on a persistent info notice with `Update now`', async () => {
    const h = harness();
    expect(await h.updater.activate({ windowId: 1 })).toBe('offered');
    expect(h.srv.requests).toEqual([{ url: FEED_ENDPOINT, accept: FEED_ACCEPT, timeoutMs: FEED_TIMEOUT_MS }]);
    expect(h.notices.current()).toMatchObject({ id: 1, severity: 'info', title: offerTitle('0.2.0'), message: 'Faster startup', persistent: true, action: { label: UPDATE_NOW, action: { kind: 'install-update' } } });
    expect(h.updater.state()).toMatchObject({ kind: 'offered', noticeId: 1, offer: { version: '0.2.0', asset: { name: PORTABLE } } });
    expect(h.logged.some((l) => l.includes('Rotaris 0.2.0 is available'))).toBe(true);
  });

  it('with no summary the message is the fallback sentence (REQ-STARTUP-116)', async () => {
    const h = harness({ feed: { body: '' } });
    await h.updater.activate({ windowId: 1 });
    expect(h.notices.current()?.message).toBe(SUMMARY_FALLBACK);
  });

  it('every check failure is invisible — one internal log line and no notice: a non-200 status, a transport failure, a body that is not a release, a prerelease flag', async () => {
    for (const [feed, reason] of [
      [{ status: 404 }, 'HTTP 404'],
      [{ status: 403 }, 'HTTP 403'],
      [{ fails: 'ETIMEDOUT: the request timed out after 10000 ms' }, 'ETIMEDOUT'],
      [{ text: '<html>rate limited</html>' }, 'not JSON'],
      [{ text: JSON.stringify({ tag_name: 'v9.9.9', prerelease: true, assets: [] }) }, 'flagged prerelease'],
      [{ text: JSON.stringify({ draft: true, tag_name: 'v9.9.9' }) }, 'flagged draft'],
      [{ text: JSON.stringify({ tag_name: 'nightly' }) }, 'outside the release-tag grammar'],
    ] as const) {
      const h = harness({ feed });
      expect(await h.updater.activate({ windowId: 1 })).toBe('failed');
      expect(h.notices.current()).toBeNull();
      const silent = h.logged.filter((l) => l.includes('update check failed silently'));
      expect(silent, JSON.stringify(feed)).toHaveLength(1);
      expect(silent[0], JSON.stringify(feed)).toContain(reason);
      expect(silent[0]).toContain('(REQ-STARTUP-110)');
    }
  });

  it('an equal or older latest release offers nothing, and a running version that does not parse decides nothing', async () => {
    expect(await harness({ running: '0.2.0' }).updater.activate({ windowId: 1 })).toBe('none');
    expect(await harness({ running: '0.3.0' }).updater.activate({ windowId: 1 })).toBe('none');
    expect(await harness({ running: 'dev' }).updater.activate({ windowId: 1 })).toBe('none');
  });

  it('a release lacking this flavour\'s file offers nothing — a real answer, not an error', async () => {
    const h = harness({ feed: { assets: [{ name: SETUP, size: 5 }, { name: 'SHA256SUMS.txt' }, { name: 'SHA256SUMS.txt.sig' }] } });
    expect(await h.updater.activate({ windowId: 1 })).toBe('none');
    expect(h.notices.current()).toBeNull();
  });

  it('an offer of the waved-off version is silently ignored; any newer version notifies again (REQ-STARTUP-116/117)', async () => {
    const same = harness({ dismissed: '0.2.0' });
    expect(await same.updater.activate({ windowId: 1 })).toBe('dismissed');
    expect(same.notices.current()).toBeNull();
    const newer = harness({ dismissed: '0.1.5' });
    expect(await newer.updater.activate({ windowId: 1 })).toBe('offered');
  });

  it('only one update operation is in flight: a second activation while a check runs is refused, not queued', async () => {
    const h = harness({ feed: { hold: true } });
    const first = h.updater.activate({ windowId: 1 });
    expect(h.updater.inFlight()).toBe(true);
    expect(await h.updater.activate({ windowId: 2 })).toBe('refused');
    expect(await h.updater.install()).toMatchObject({ ok: false, code: 'update.busy' });
    h.srv.release();
    expect(await first).toBe('offered');
    expect(h.updater.inFlight()).toBe(false);
    expect(h.srv.requests.filter((r) => r.url === FEED_ENDPOINT)).toHaveLength(1);
  });

  it('a second window\'s check finding the same version while the offer is still on screen publishes no second notice', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    expect(await h.updater.activate({ windowId: 2 })).toBe('already-offered');
    expect(h.notices.lastId()).toBe(1);
  });

  it('deletes the portable\'s leftover <name>.old before the network round trip (REQ-STARTUP-115)', async () => {
    const h = harness({ volumeFiles: { [TARGET]: 'v0.1.0', [`${TARGET}.old`]: 'old' } });
    await h.updater.activate({ windowId: 1 });
    expect(h.vol.ops[0]).toBe(`remove:${TARGET}.old`);
    expect(h.logged.some((l) => l.includes('REQ-STARTUP-115'))).toBe(true);
  });
});

describe('the download reported into the same notice — REQ-STARTUP-118, REQ-STARTUP-124, REQ-SHELL-118', () => {
  it('keeps the notice\'s identity, takes the downloading title and message, disables the action with its description, and repaints only when the whole percent changes', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    const faces: { title: string; message: string; disabled: string | undefined; persistent: boolean }[] = [];
    const unsubscribe = ((): (() => void) => {
      const seen = new Set<string>();
      const timer = setInterval(() => {
        const c = h.notices.current();
        if (c === null) return;
        const key = `${c.id}|${c.title}|${c.message}|${c.action?.disabled ?? ''}|${c.persistent}`;
        if (!seen.has(key)) { seen.add(key); faces.push({ title: c.title, message: c.message, disabled: c.action?.disabled, persistent: c.persistent }); }
      }, 0);
      return () => clearInterval(timer);
    })();
    const result = await h.updater.install();
    unsubscribe();
    expect(result).toEqual({ ok: true, value: { outcome: 'replaced' } });
    // The same identity throughout: every broadcast after the offer carried notice #1.
    expect(new Set(h.broadcasts)).toEqual(new Set([1]));
    // 2,500,000 bytes in 1 MiB chunks: 41 %, 83 %, 100 % — one repaint per whole-percent change, never more.
    const messages = h.broadcasts.length;
    expect(messages).toBeGreaterThanOrEqual(5);
    expect(h.notices.current()).toMatchObject({ id: 1, severity: 'success', title: INSTALLED_TITLE, message: 'The update is installed. Restart Rotaris to run it.', persistent: true, action: { label: RESTART_NOW, action: { kind: 'restart' } } });
    expect(h.notices.current()?.action?.disabled).toBeUndefined();
    expect(h.updater.state()).toMatchObject({ kind: 'applied', noticeId: 1 });
    expect(h.vol.files.get(TARGET)).toBe(`copy of /tmp/rotaris-update-1/${PORTABLE}`);
  });

  it('the downloading face: `Downloading Rotaris {version}`, `{measured} — verifying against the published checksum when it finishes.`, not persistent, the action disabled', async () => {
    const h = harness({ feed: { hold: false } });
    await h.updater.activate({ windowId: 1 });
    // Hold the asset by watching the first repaint: the first face after install() starts is the 0 % one.
    const observed: string[] = [];
    const original = h.notices.update.bind(h.notices);
    (h.notices as { update: typeof h.notices.update }).update = async (id, patch) => {
      observed.push(JSON.stringify({ id, title: patch.title, message: patch.message, persistent: patch.persistent, disabled: patch.action === null || patch.action === undefined ? null : patch.action.disabled }));
      return original(id, patch);
    };
    await h.updater.install();
    expect(observed[0]).toBe(JSON.stringify({ id: 1, title: downloadingTitle('0.2.0'), message: downloadingMessage('0%'), persistent: false, disabled: DOWNLOAD_IN_PROGRESS }));
    expect(observed.slice(1, 4).map((o) => JSON.parse(o).message)).toEqual([downloadingMessage('41%'), downloadingMessage('83%'), downloadingMessage('100%')]);
    expect(DOWNLOAD_IN_PROGRESS).toBe('The download is in progress; the same download cannot be started twice.');
  });

  it('with a claimed size of 0 the measured figure is whole MiB, `{N} MB`', async () => {
    const h = harness({ feed: { assets: [{ name: PORTABLE, size: 0 }, { name: 'SHA256SUMS.txt' }, { name: 'SHA256SUMS.txt.sig' }] } });
    await h.updater.activate({ windowId: 1 });
    const messages: string[] = [];
    const original = h.notices.update.bind(h.notices);
    (h.notices as { update: typeof h.notices.update }).update = async (id, patch) => { if (patch.message !== undefined) messages.push(patch.message); return original(id, patch); };
    await h.updater.install();
    expect(messages.slice(0, 3)).toEqual([downloadingMessage('0 MB'), downloadingMessage('1 MB'), downloadingMessage('2 MB')]);
  });

  it('when the offer notice was replaced meanwhile, the download is reported on a fresh notice rather than nowhere', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    await h.notices.report({ severity: 'warning', title: 'something else' });
    await h.updater.install();
    expect(h.notices.current()).toMatchObject({ id: 3, title: INSTALLED_TITLE });
    expect(h.updater.state()).toMatchObject({ kind: 'applied', noticeId: 3 });
  });
});

describe('the applied outcomes — REQ-STARTUP-119, REQ-STARTUP-120, REQ-STARTUP-127', () => {
  it('a hand-off (the installer) shows `Finish the update` with no action and closes the window after the single 1200 ms delay, once', async () => {
    const h = harness({ classification: installer });
    await h.updater.activate({ windowId: 1 });
    expect(await h.updater.install()).toEqual({ ok: true, value: { outcome: 'handed-off', quitRequired: true } });
    expect(h.spawned).toEqual([`/tmp/rotaris-update-1/${SETUP}`]);
    expect(h.notices.current()).toMatchObject({ id: 1, severity: 'success', title: FINISH_TITLE, message: 'Rotaris will close so the installer can replace it.', persistent: true });
    expect(h.notices.current()?.action).toBeUndefined();
    expect(h.closed()).toBe(0);
    h.clock.advance(INSTALLER_AUTO_CLOSE_MS - 1);
    expect(h.closed()).toBe(0);
    h.clock.advance(1);
    expect(h.closed()).toBe(1);
    // A hand-off cannot be restarted into (REQ-STARTUP-121: Restart now is on Update installed alone).
    expect(await h.updater.restart()).toMatchObject({ ok: false, code: 'update.notApplied' });
    // The installer runs from staging, which is left for it.
    expect(h.staging.dirs.size).toBe(1);
  });

  it('an install failure becomes the persistent error notice `Update not installed` in place, the sentence as its detail, with `Try again` — and the record is written before it is rendered', async () => {
    const h = harness({ keys: 'empty' });
    await h.updater.activate({ windowId: 1 });
    const result = await h.updater.install();
    expect(result).toMatchObject({ ok: false, code: 'update.signature', headline: NOT_INSTALLED_TITLE });
    expect(h.notices.current()).toMatchObject({ id: 1, severity: 'error', title: NOT_INSTALLED_TITLE, message: NOT_INSTALLED_MESSAGE, persistent: true, action: { label: TRY_AGAIN, action: { kind: 'install-update' } } });
    expect(h.notices.current()?.detail).toContain('this build carries no verification key');
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0]).toMatchObject({ noticeId: 1, severity: 'error', title: NOT_INSTALLED_TITLE });
    expect(h.updater.state()).toMatchObject({ kind: 'failed', noticeId: 1 });
    // Nothing was downloaded: the asset was never requested, the installation is untouched.
    expect(h.srv.requests.some((r) => r.url.endsWith(`/${PORTABLE}`))).toBe(false);
    expect(h.vol.ops).toEqual([]);
    expect(h.logged.some((l) => l.startsWith('warn: update install: signature step failed'))).toBe(true);
  });

  it('`Try again` re-runs the install with the held offer', async () => {
    const h = harness({ keys: 'other' });
    await h.updater.activate({ windowId: 1 });
    expect(await h.updater.install()).toMatchObject({ ok: false });
    expect(h.updater.state().kind).toBe('failed');
    // The same offer, tried again — here it fails the same way, which is what a retry against the same release does.
    expect(await h.updater.install()).toMatchObject({ ok: false, code: 'update.signature' });
    expect(h.srv.requests.filter((r) => r.url.endsWith('/SHA256SUMS.txt'))).toHaveLength(2);
  });

  it('install is refused with no held offer, and for a build that cannot update itself', async () => {
    expect(await harness().updater.install()).toMatchObject({ ok: false, code: 'update.none' });
    expect(await harness({ classification: dev }).updater.install()).toMatchObject({ ok: false, code: 'update.notUpdatable' });
  });
});

describe('dismissing the offer — REQ-STARTUP-116, REQ-STARTUP-117, REQ-SHELL-114', () => {
  it('records exactly the offered version, before the notice is cleared, and only for the update notice', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    await h.updater.noticeDismissed(1);
    expect(h.dismissed()).toBe('0.2.0');
    expect(h.updater.state()).toEqual({ kind: 'idle' });
    // The next check of the same version is silent.
    expect(await h.updater.activate({ windowId: 1 })).toBe('dismissed');
  });

  it('dismissing an unrelated notice, or the offer\'s id once another notice has replaced it, records nothing', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    await h.updater.noticeDismissed(99);
    expect(h.dismissed()).toBeUndefined();
    await h.notices.report({ severity: 'info', title: 'another' });
    await h.updater.noticeDismissed(1);
    expect(h.dismissed()).toBeUndefined();
    expect(h.updater.state().kind).toBe('offered');
  });

  it('dismissing the failure notice the offer became records the version too (it is still the update notice)', async () => {
    const h = harness({ keys: 'empty' });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    await h.updater.noticeDismissed(1);
    expect(h.dismissed()).toBe('0.2.0');
  });
});

describe('`Restart now` — REQ-STARTUP-121', () => {
  it('starts the successor from the target, and closes the window only after the record has passed', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    expect(await h.updater.restart()).toEqual({ ok: true, value: { outcome: 'handed-over' } });
    expect(h.started).toEqual([TARGET]);
    expect(h.closed()).toBe(1);
  });

  it('when the successor cannot be started nothing closes and the failure surfaces through `Update not installed`', async () => {
    const h = harness({ successor: 'fails' });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    const result = await h.updater.restart();
    expect(result).toMatchObject({ ok: false, code: 'update.restart', headline: NOT_INSTALLED_TITLE, detail: `could not start the updated Rotaris at ${TARGET}: EACCES: cannot execute` });
    expect(h.closed()).toBe(0);
    expect(h.notices.current()).toMatchObject({ id: 1, severity: 'error', title: NOT_INSTALLED_TITLE, action: { label: TRY_AGAIN } });
    expect(h.notices.current()?.detail).toBe(`could not start the updated Rotaris at ${TARGET}: EACCES: cannot execute`);
  });

  it('a successor that never signals leaves this instance holding its window; nothing times it out', async () => {
    const h = harness({ successor: 'never' });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    const pending = h.updater.restart();
    h.clock.advance(600_000);
    expect(h.closed()).toBe(0);
    expect(h.updater.inFlight()).toBe(true);
    expect(await Promise.race([pending.then(() => 'settled'), new Promise((r) => setTimeout(() => r('still waiting'), 20))])).toBe('still waiting');
  });

  it('is offered on `Update installed` alone: before an install, or after a failure, it is refused', async () => {
    const h = harness();
    expect(await h.updater.restart()).toMatchObject({ ok: false, code: 'update.notApplied' });
    await h.updater.activate({ windowId: 1 });
    expect(await h.updater.restart()).toMatchObject({ ok: false, code: 'update.notApplied' });
  });
});

describe('quiescing at close — REQ-STARTUP-046, REQ-SHELL-121', () => {
  it('returns at once with nothing in flight, waits for a check that finishes inside the bound, and abandons one that does not', async () => {
    const idle = harness();
    await idle.updater.quiesce(millis(5_000));
    const held = harness({ feed: { hold: true } });
    const check = held.updater.activate({ windowId: 1 });
    const waiting = held.updater.quiesce(millis(5_000));
    held.srv.release();
    await check;
    await waiting;
    expect(held.logged.some((l) => l.includes('did not finish'))).toBe(false);
    const stuck = harness({ feed: { hold: true } });
    void stuck.updater.activate({ windowId: 1 });
    const quiesce = stuck.updater.quiesce(millis(5_000));
    stuck.clock.advance(5_000);
    await quiesce;
    expect(stuck.logged.some((l) => l.includes('did not finish within 5000 ms'))).toBe(true);
  });
});
