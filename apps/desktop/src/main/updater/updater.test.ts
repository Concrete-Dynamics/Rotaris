import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakeClock, millis } from '@rotaris/kernel';
import { formatChecksumManifest } from '@rotaris/release-naming';
import type { AppLogLevel } from '../app-log.js';
import { createNoticeStore, type NoticeRecord } from '../notices.js';
import type { Classification } from './classify.js';
import type { DownloadSink } from './download.js';
import { FEED_ACCEPT, FEED_ENDPOINT, FEED_TIMEOUT_MS, SUMMARY_FALLBACK } from './feed.js';
import { formatHandOffRecord, parseHandOffRecord, type HandOffRecordFile, type NetworkResponse, type StagingArea, type UpdateNetwork } from './install.js';
import type { StrategyFiles, StrategySpawn } from './strategies.js';
import { passFailedSentence } from './successor.js';
import { createUpdater, DOWNLOAD_IN_PROGRESS, downloadingMessage, downloadingTitle, FINISH_TITLE, INSTALLED_TITLE, INSTALLER_AUTO_CLOSE_MS, NOT_INSTALLED_MESSAGE, NOT_INSTALLED_TITLE, offerTitle, RESTART_NOW, RETURN_TO_WINDOW, TRY_AGAIN, UPDATE_DECLINED, UPDATE_DECLINED_INTEGRATION, UPDATE_DECLINED_UNSAVED, UPDATE_NOW, mustAskAtHandOff, updateCloseBox, updateCloseDetail, updateCloseMessage, type UpdaterDeps } from './updater.js';

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

function stagingArea(options: { removeFails?: boolean } = {}) {
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
    removeDirectory: async (d) => {
      if (options.removeFails) throw new Error('EBUSY: resource busy or locked');
      dirs.delete(d);
    },
  };
  return { area, files, dirs };
}

/** REQ-STARTUP-178: the hand-off record's file, in memory; `spawnedAtWrite` is how many processes had started when it was written. */
function handOffFile(initial: string | null, spawned: readonly string[]) {
  let text = initial;
  const spawnedAtWrite: number[] = [];
  const port: HandOffRecordFile = {
    read: async () => text,
    write: async (t) => { spawnedAtWrite.push(spawned.length); text = t; },
    clear: async () => { text = null; },
  };
  return { port, spawnedAtWrite, text: () => text, record: () => (text === null ? null : parseHandOffRecord(text)) };
}

function volume(initial: Record<string, string>) {
  const files = new Map(Object.entries(initial));
  const ops: string[] = [];
  const port: StrategyFiles = {
    pathKind: async (p) => (files.has(p) ? 'file' : 'absent'),
    copyFile: async (from, to) => { ops.push(`copy:${to}`); files.set(to, `copy of ${from}`); },
    copyAside: async (from, to) => { ops.push(`copy-aside:${to}`); files.set(to, files.get(from)!); },
    rename: async (from, to) => { ops.push(`rename:${from}→${to}`); files.set(to, files.get(from)!); files.delete(from); },
    removeFile: async (p) => { ops.push(`remove:${p}`); files.delete(p); },
  };
  return { files, ops, port };
}

const portable: Classification = { updatable: true, flavour: 'portable', target: TARGET };
const installer: Classification = { updatable: true, flavour: 'installer', target: INSTALL_DIR };
const dev: Classification = { updatable: false, reason: 'a development or source-tree launch, not a released standalone artifact (REQ-STARTUP-106)' };

function harness(options: { classification?: Classification; feed?: FeedOptions; running?: string; dismissed?: string; keys?: 'carried' | 'empty' | 'other'; successor?: 'passes' | 'fails' | 'never' | 'refused'; volumeFiles?: Record<string, string>; confirm?: boolean | 'throws' | 'hold' | readonly boolean[]; runs?: readonly (number | null | 'throws')[]; unsaved?: boolean | 'throws' | readonly boolean[]; integrating?: boolean | 'throws' | readonly boolean[]; handOff?: string; stagingRemoveFails?: boolean; spawnFails?: boolean } = {}) {
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
  const staging = stagingArea({ removeFails: options.stagingRemoveFails ?? false });
  const vol = volume(options.volumeFiles ?? { [TARGET]: 'v0.1.0' });
  const spawned: string[] = [];
  const spawn: StrategySpawn = {
    spawnDetached: async (exe) => {
      if (options.spawnFails) throw new Error('EACCES: cannot execute');
      spawned.push(exe);
    },
  };
  const handOff = handOffFile(options.handOff ?? null, spawned);
  const started: string[] = [];
  let closed = 0;
  const asked: string[] = [];
  /** OQ-311: each asking of every window's unsaved-settings guard, and the order of both guards' askings together. */
  const unsavedAsked: string[] = [];
  /** OQ-361: each asking of guard (2) at an update's close. */
  const integrationAsked: string[] = [];
  const order: string[] = [];
  const held: ((answer: boolean) => void)[] = [];
  const runs = options.runs ?? [0];
  let reads = 0;
  const keys = options.keys === 'empty' ? [] : options.keys === 'other' ? [keyPair().pem] : [srv.pair.pem];
  const deps: UpdaterDeps = {
    classification: options.classification ?? portable,
    runningVersion: options.running ?? '0.1.0',
    network: srv.network, staging: staging.area, files: vol.port, spawn, handOffRecord: handOff.port, keys,
    dismissedVersion: { read: () => dismissed, write: async (v) => { dismissed = v; } },
    notices, log, timers: clock.timers,
    startSuccessor: async (target) => {
      started.push(target);
      if (options.successor === 'fails') throw new Error('EACCES: cannot execute');
      if (options.successor === 'never') await new Promise<void>(() => undefined);
      // Started and accepted, but the record could not be passed to it (main's `successor.ts` rejects the same way).
      if (options.successor === 'refused') throw new Error(passFailedSentence('the instance record could not be replaced: EBUSY'));
    },
    closeWindows: () => { closed += 1; },
    // OQ-86: the run host's count — by default no run is active; a sequence is read in order, its last value repeating.
    activeRuns: async () => {
      const value = runs[Math.min(reads, runs.length - 1)];
      reads += 1;
      if (value === 'throws') throw new Error('the run host did not answer');
      return value ?? 0;
    },
    // OQ-86: the active-run confirmation — the user closes anyway unless told otherwise; `hold` waits for `answer`.
    confirmClose: async (closeAsk) => {
      asked.push(`${closeAsk.action}@${closeAsk.moment}:${closeAsk.activeRuns ?? 'unknown'}`);
      order.push(`runs:${closeAsk.action}@${closeAsk.moment}`);
      const confirm = options.confirm;
      if (confirm === 'throws') throw new Error('no window to ask from');
      if (confirm === 'hold') return new Promise<boolean>((resolve) => { held.push(resolve); });
      if (Array.isArray(confirm)) return (confirm as readonly boolean[])[asked.length - 1] ?? true;
      return (confirm as boolean | undefined) ?? true;
    },
    // OQ-311: every window's unsaved-settings guard — every window allows unless told otherwise; a sequence is answered in order.
    confirmUnsaved: async (unsavedAsk) => {
      unsavedAsked.push(`${unsavedAsk.action}@${unsavedAsk.moment}`);
      order.push(`unsaved:${unsavedAsk.action}@${unsavedAsk.moment}`);
      const unsaved = options.unsaved;
      if (unsaved === 'throws') throw new Error('no main window could be asked');
      if (Array.isArray(unsaved)) return (unsaved as readonly boolean[])[unsavedAsked.length - 1] ?? true;
      return (unsaved as boolean | undefined) ?? true;
    },
    // OQ-361: guard (2), instance-wide — no integration runs unless told otherwise; a sequence says, asking by asking,
    // whether one is running; the answer is that none is.
    integrationAllows: async (integrationAsk) => {
      integrationAsked.push(`${integrationAsk.action}@${integrationAsk.moment}`);
      order.push(`integration:${integrationAsk.action}@${integrationAsk.moment}`);
      const integrating = options.integrating;
      if (integrating === 'throws') throw new Error('the integration record could not be asked');
      if (Array.isArray(integrating)) return !((integrating as readonly boolean[])[integrationAsked.length - 1] ?? false);
      return !((integrating as boolean | undefined) ?? false);
    },
  };
  const updater = createUpdater(deps);
  return { updater, srv, clock, logged, recorded, broadcasts, notices, staging, vol, spawned, handOff, started, asked, unsavedAsked, integrationAsked, order, held, reads: () => reads, closed: () => closed, dismissed: () => dismissed };
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

  it('a later window\'s check after `Update installed` offers the installed version not again: `Restart now` stays reachable (REQ-STARTUP-119, REQ-STARTUP-121)', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    const installed = h.notices.current();
    expect(installed).toMatchObject({ title: INSTALLED_TITLE, action: { label: RESTART_NOW } });
    const opsBefore = [...h.vol.ops];
    // A hand-over launch's added window or a replacement window goes through the same post-show activation.
    expect(await h.updater.activate({ windowId: 2 })).toBe('already-applied');
    expect(h.notices.current()).toEqual(installed);
    expect(h.updater.state().kind).toBe('applied');
    expect(h.logged.some((l) => l.includes('is already installed and waits for Restart now'))).toBe(true);
    // Nothing re-applied: the backup of the running version is untouched, and the restart is still offered.
    expect(await h.updater.install()).toMatchObject({ ok: false, code: 'update.none' });
    expect(h.vol.ops).toEqual(opsBefore);
    expect(await h.updater.restart()).toEqual({ ok: true, value: { outcome: 'handed-over' } });
  });

  it('a later window\'s check after the installer hand-off leaves `Finish the update` as it is (REQ-STARTUP-119)', async () => {
    const h = harness({ classification: installer });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    const handedOff = h.notices.current();
    expect(handedOff).toMatchObject({ title: FINISH_TITLE });
    expect(await h.updater.activate({ windowId: 2 })).toBe('already-applied');
    expect(h.notices.current()).toEqual(handedOff);
    expect(h.updater.state().kind).toBe('handed-off');
  });

  it('deletes the portable\'s leftover <name>.old before the network round trip (REQ-STARTUP-115)', async () => {
    const h = harness({ volumeFiles: { [TARGET]: 'v0.1.0', [`${TARGET}.old`]: 'old' } });
    await h.updater.activate({ windowId: 1 });
    expect(h.vol.ops[0]).toBe(`remove:${TARGET}.old`);
    expect(h.logged.some((l) => l.includes('REQ-STARTUP-115'))).toBe(true);
  });

  it('the cleanup is launch-time: a later window\'s check in the same process never deletes the backup this process\'s own apply made (REQ-STARTUP-115)', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    expect(h.vol.files.get(`${TARGET}.old`)).toBe('v0.1.0');
    await h.updater.activate({ windowId: 2 });
    expect(h.vol.files.get(`${TARGET}.old`)).toBe('v0.1.0');
    expect(h.vol.ops.filter((o) => o === `remove:${TARGET}.old`)).toHaveLength(1);
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

describe('the installer hand-off\'s staging directory — REQ-STARTUP-178', () => {
  const handedOff = (version: string, staging: string): string => formatHandOffRecord({ version, staging });

  it('is recorded, with the version it installs, before the setup starts — and the process that handed off never removes it', async () => {
    const h = harness({ classification: installer });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    expect(h.spawned).toEqual([`/tmp/rotaris-update-1/${SETUP}`]);
    expect(h.handOff.record()).toEqual({ version: '0.2.0', staging: '/tmp/rotaris-update-1' });
    expect(h.handOff.spawnedAtWrite).toEqual([0]);
    // A later window's check in the same process is not the updated build's first launch.
    await h.updater.activate({ windowId: 2 });
    expect(h.staging.dirs.has('/tmp/rotaris-update-1')).toBe(true);
    expect(h.handOff.record()).not.toBeNull();
  });

  it('the updated build\'s first check removes it and clears the record, before the network round trip, and reports nothing', async () => {
    const h = harness({ classification: installer, running: '0.2.0', handOff: handedOff('0.2.0', '/tmp/rotaris-update-9') });
    h.staging.dirs.add('/tmp/rotaris-update-9');
    await h.updater.activate({ windowId: 1 });
    expect(h.staging.dirs.has('/tmp/rotaris-update-9')).toBe(false);
    expect(h.handOff.text()).toBeNull();
    expect(h.notices.current()).toBeNull();
    expect(h.logged).toContain('info: update check: the installer hand-off\'s staging directory was removed (REQ-STARTUP-178)');
    expect(h.logged.findIndex((l) => l.includes('REQ-STARTUP-178'))).toBeLessThan(h.logged.findIndex((l) => l.includes(FEED_ENDPOINT)));
  });

  it('a launch of a newer version removes it too: the same or a newer version running supersedes it', async () => {
    const h = harness({ classification: installer, running: '0.3.0', feed: { version: '0.3.0' }, handOff: handedOff('0.2.0', '/tmp/rotaris-update-9') });
    h.staging.dirs.add('/tmp/rotaris-update-9');
    await h.updater.activate({ windowId: 1 });
    expect(h.staging.dirs.size).toBe(0);
    expect(h.handOff.text()).toBeNull();
  });

  it('a launch still running the older version (the installer cancelled, failed or still open) removes nothing', async () => {
    const h = harness({ classification: installer, running: '0.1.0', handOff: handedOff('0.2.0', '/tmp/rotaris-update-9') });
    h.staging.dirs.add('/tmp/rotaris-update-9');
    await h.updater.activate({ windowId: 1 });
    expect(h.staging.dirs.has('/tmp/rotaris-update-9')).toBe(true);
    expect(h.handOff.record()).toEqual({ version: '0.2.0', staging: '/tmp/rotaris-update-9' });
  });

  it('a removal that fails keeps the record for a later launch and is not reported', async () => {
    const record = handedOff('0.2.0', '/tmp/rotaris-update-9');
    const h = harness({ classification: installer, running: '0.2.0', handOff: record, stagingRemoveFails: true });
    h.staging.dirs.add('/tmp/rotaris-update-9');
    await h.updater.activate({ windowId: 1 });
    expect(h.handOff.text()).toBe(record);
    expect(h.notices.current()).toBeNull();
    expect(h.logged).toContain('info: update check: the installer hand-off\'s staging directory was left for a later launch (REQ-STARTUP-178)');
    // The next launch retries.
    const next = harness({ classification: installer, running: '0.2.0', handOff: h.handOff.text()! });
    next.staging.dirs.add('/tmp/rotaris-update-9');
    await next.updater.activate({ windowId: 1 });
    expect(next.staging.dirs.size).toBe(0);
    expect(next.handOff.text()).toBeNull();
  });

  it('a new hand-off supersedes an earlier record: the directory it named is removed and the record names the new one', async () => {
    const h = harness({ classification: installer, handOff: handedOff('0.2.0', '/tmp/rotaris-update-earlier') });
    h.staging.dirs.add('/tmp/rotaris-update-earlier');
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    expect([...h.staging.dirs]).toEqual(['/tmp/rotaris-update-1']);
    expect(h.handOff.record()).toEqual({ version: '0.2.0', staging: '/tmp/rotaris-update-1' });
  });

  it('an installer that cannot be started discards its staging and clears the record naming it', async () => {
    const h = harness({ classification: installer, spawnFails: true });
    await h.updater.activate({ windowId: 1 });
    expect(await h.updater.install()).toMatchObject({ ok: false, code: 'update.apply' });
    expect(h.staging.dirs.size).toBe(0);
    expect(h.handOff.text()).toBeNull();
  });

  it('the portable flavour records nothing: its apply copies the verified file out of staging and removes staging at once', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    expect(h.staging.dirs.size).toBe(0);
    expect(h.handOff.spawnedAtWrite).toEqual([]);
    expect(h.handOff.text()).toBeNull();
  });

  it('a build classified not updatable leaves the record and its directory as they are', async () => {
    const record = handedOff('0.2.0', '/tmp/rotaris-update-9');
    const h = harness({ classification: dev, handOff: record });
    h.staging.dirs.add('/tmp/rotaris-update-9');
    await h.updater.activate({ windowId: 1 });
    expect(h.staging.dirs.has('/tmp/rotaris-update-9')).toBe(true);
    expect(h.handOff.text()).toBe(record);
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
  /*
   * OQ-86, ruled 2026-10-06 by the owner (R-071): REQ-STARTUP-046's active-run confirmation is asked when the action is
   * clicked, before the installer or the successor starts — afterwards declining could not keep the window. Until the
   * ruling both closed every window without it.
   */
  it('Restart now asks the active-run confirmation first; returning to the window starts nothing, closes nothing and keeps the notice', async () => {
    const h = harness({ confirm: false, runs: [1] });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    // The portable's in-place apply closes nothing, so `Update now` asked nothing — not even the count.
    expect(h.asked).toEqual([]);
    expect(h.reads()).toBe(0);
    const notice = h.notices.current();
    expect(notice).toMatchObject({ title: INSTALLED_TITLE });
    expect(await h.updater.restart()).toEqual(UPDATE_DECLINED);
    expect(h.asked).toEqual(['restart@click:1']);
    expect(h.started).toEqual([]);
    expect(h.closed()).toBe(0);
    expect(h.notices.current()).toEqual(notice);
    expect(h.updater.state().kind).toBe('applied');
    expect(h.updater.inFlight()).toBe(false);
    expect(h.logged.some((l) => /update restart: a run is active and the user returned to the window at the click/.test(l))).toBe(true);
  });

  it('no run active asks nothing, at the click or at the hand-off', async () => {
    const restart = harness();
    await restart.updater.activate({ windowId: 1 });
    await restart.updater.install();
    expect(await restart.updater.restart()).toEqual({ ok: true, value: { outcome: 'handed-over' } });
    expect(restart.asked).toEqual([]);
    expect(restart.reads()).toBe(2);
    const install = harness({ classification: installer });
    await install.updater.activate({ windowId: 1 });
    expect(await install.updater.install()).toMatchObject({ ok: true, value: { outcome: 'handed-off' } });
    expect(install.asked).toEqual([]);
    expect(install.reads()).toBe(2);
  });

  it('a run count that cannot be read is a run active: the confirmation is asked', async () => {
    const h = harness({ confirm: false, runs: ['throws'] });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    expect(await h.updater.restart()).toEqual(UPDATE_DECLINED);
    expect(h.asked).toEqual(['restart@click:unknown']);
    expect(h.logged.some((l) => /the active-run count could not be read \(the run host did not answer\)/.test(l))).toBe(true);
  });

  it('Update now on the installer flavour asks before anything is downloaded or started; declined, the offer stands; accepted, the hand-off proceeds', async () => {
    const declined = harness({ classification: installer, confirm: false, runs: [1] });
    await declined.updater.activate({ windowId: 1 });
    const requestsBefore = declined.srv.requests.length;
    expect(await declined.updater.install()).toEqual(UPDATE_DECLINED);
    expect(declined.asked).toEqual(['install@click:1']);
    expect(declined.srv.requests.length).toBe(requestsBefore);
    expect(declined.spawned).toEqual([]);
    expect(declined.notices.current()).toMatchObject({ title: offerTitle('0.2.0'), action: { label: UPDATE_NOW } });
    expect(declined.updater.state().kind).toBe('offered');
    expect(declined.updater.inFlight()).toBe(false);
    declined.clock.advance(INSTALLER_AUTO_CLOSE_MS * 10);
    expect(declined.closed()).toBe(0);

    // Accepted: the download ran in between, so a run still active at the hand-off is asked about again (below).
    const accepted = harness({ classification: installer, confirm: true, runs: [1, 0] });
    await accepted.updater.activate({ windowId: 1 });
    expect(await accepted.updater.install()).toMatchObject({ ok: true, value: { outcome: 'handed-off' } });
    expect(accepted.asked).toEqual(['install@click:1']);
    expect(accepted.spawned).toHaveLength(1);
  });

  /*
   * OQ-86's verification (fin21, repair round 1): the click's answer was the only asking, and the download that follows
   * can take minutes while the window accepts input — a run started then was ended by the 1200 ms auto-close unasked.
   * The count is re-read immediately before the installer is spawned.
   */
  it('a run started while the installer downloaded is asked about before the installer starts; declined, the update stays offered and nothing is spawned or closed', async () => {
    const h = harness({ classification: installer, confirm: false, runs: [0, 1, 0] });
    await h.updater.activate({ windowId: 1 });
    const result = await h.updater.install();
    expect(result).toEqual(UPDATE_DECLINED);
    // Nothing was asked at the click (no run then); the hand-off asked, after the download and its verification.
    expect(h.asked).toEqual(['install@hand-off:1']);
    expect(h.srv.requests.some((r) => r.url.endsWith(SETUP))).toBe(true);
    expect(h.spawned).toEqual([]);
    // The verified download is discarded; the offer is back in the same notice with its action.
    expect(h.staging.dirs.size).toBe(0);
    expect(h.notices.current()).toMatchObject({ id: 1, title: offerTitle('0.2.0'), action: { label: UPDATE_NOW } });
    expect(h.updater.state().kind).toBe('offered');
    expect(h.updater.inFlight()).toBe(false);
    h.clock.advance(INSTALLER_AUTO_CLOSE_MS * 10);
    expect(h.closed()).toBe(0);
    expect(h.logged.some((l) => /1 run is active at the hand-off, which the click's answer did not cover/.test(l))).toBe(true);
    // Offered again: a later Update now with no run active hands off.
    expect(await h.updater.install()).toMatchObject({ ok: true, value: { outcome: 'handed-off' } });
    expect(h.spawned).toHaveLength(1);
  });

  it('after the download, a run still active is asked about again even when the click was answered — the count cannot tell it is the same run', async () => {
    const proceed = harness({ classification: installer, confirm: [true, true], runs: [1, 1] });
    await proceed.updater.activate({ windowId: 1 });
    expect(await proceed.updater.install()).toMatchObject({ ok: true, value: { outcome: 'handed-off' } });
    expect(proceed.asked).toEqual(['install@click:1', 'install@hand-off:1']);
    expect(proceed.spawned).toHaveLength(1);
    const declined = harness({ classification: installer, confirm: [true, false], runs: [1, 1] });
    await declined.updater.activate({ windowId: 1 });
    expect(await declined.updater.install()).toEqual(UPDATE_DECLINED);
    expect(declined.spawned).toEqual([]);
  });

  it('Restart now re-reads the count before the successor starts: a run past what the click covered is asked about, the runs it covered are not', async () => {
    const started = harness({ confirm: false, runs: [0, 1] });
    await started.updater.activate({ windowId: 1 });
    await started.updater.install();
    expect(await started.updater.restart()).toEqual(UPDATE_DECLINED);
    expect(started.asked).toEqual(['restart@hand-off:1']);
    expect(started.started).toEqual([]);
    expect(started.updater.state().kind).toBe('applied');

    const covered = harness({ runs: [2, 2] });
    await covered.updater.activate({ windowId: 1 });
    await covered.updater.install();
    expect(await covered.updater.restart()).toEqual({ ok: true, value: { outcome: 'handed-over' } });
    expect(covered.asked).toEqual(['restart@click:2']);
  });

  it('mustAskAtHandOff: no run asks nothing; after a download any run asks; otherwise only a run the click did not cover', () => {
    const none = { asked: false } as const;
    const two = { asked: true, activeRuns: 2 } as const;
    const unknown = { asked: true, activeRuns: null } as const;
    expect(mustAskAtHandOff(two, 0, true)).toBe(false);
    expect(mustAskAtHandOff(none, 0, false)).toBe(false);
    expect(mustAskAtHandOff(two, 1, true)).toBe(true);
    expect(mustAskAtHandOff(two, null, true)).toBe(true);
    expect(mustAskAtHandOff(none, 1, false)).toBe(true);
    expect(mustAskAtHandOff(none, null, false)).toBe(true);
    expect(mustAskAtHandOff(two, 2, false)).toBe(false);
    expect(mustAskAtHandOff(two, 3, false)).toBe(true);
    expect(mustAskAtHandOff(two, null, false)).toBe(false);
    expect(mustAskAtHandOff(unknown, 4, false)).toBe(false);
  });

  it('a second click while the confirmation is open is refused as the operation in flight, so no second box opens', async () => {
    const h = harness({ confirm: 'hold', runs: [1] });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    const first = h.updater.restart();
    await new Promise((r) => setTimeout(r, 0));
    expect(h.asked).toEqual(['restart@click:1']);
    expect(h.updater.inFlight()).toBe(true);
    expect(await h.updater.restart()).toMatchObject({ ok: false, code: 'update.busy' });
    expect(h.asked).toHaveLength(1);
    h.held[0]!(false);
    expect(await first).toEqual(UPDATE_DECLINED);
  });

  it('a confirmation that cannot be asked is read as returning to the window: nothing starts', async () => {
    const h = harness({ confirm: 'throws', runs: [1] });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    expect(await h.updater.restart()).toEqual(UPDATE_DECLINED);
    expect(h.started).toEqual([]);
    expect(h.logged.some((l) => /the active-run confirmation could not be asked \(no window to ask from\)/.test(l))).toBe(true);
  });

  it('the confirmation\'s words convey REQ-STARTUP-046\'s three things, and the returning answer is named', () => {
    expect(RETURN_TO_WINDOW).toBe('Return to the window');
    expect(updateCloseMessage(1)).toBe('A run is still executing.');
    expect(updateCloseMessage(null)).toBe('A run is still executing.');
    expect(updateCloseMessage(3)).toBe('3 runs are still executing.');
    expect(updateCloseDetail('install')).toBe('Installing the update closes every Rotaris window, which ends the run. Return to the window to let it finish, and update afterwards.');
    expect(updateCloseDetail('install', 'hand-off')).toBe('The update is downloaded and verified. Installing it closes every Rotaris window, which ends the run. Return to the window to let it finish; the update stays offered.');
    expect(updateCloseDetail('restart')).toBe('Restarting into the update closes every Rotaris window, which ends the run. Return to the window to let it finish, and restart afterwards.');
  });

  it('the message box main shows: two answers, returning first, the default and Escape\'s (REQ-SHELL-055)', () => {
    expect(updateCloseBox({ action: 'install', activeRuns: 2, moment: 'hand-off' })).toEqual({
      type: 'warning', title: 'A run is still executing', message: '2 runs are still executing.', detail: updateCloseDetail('install', 'hand-off'),
      buttons: [RETURN_TO_WINDOW, 'Close and install the update'], defaultId: 0, cancelId: 0, noLink: true,
    });
    expect(updateCloseBox({ action: 'restart', activeRuns: null, moment: 'click' })).toMatchObject({
      message: 'A run is still executing.', buttons: [RETURN_TO_WINDOW, 'Close and restart'], defaultId: 0, cancelId: 0,
    });
  });

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

  it('a successor that started but could not be given the record surfaces `Update not installed`, closes nothing, and frees the in-flight guard', async () => {
    const h = harness({ successor: 'refused' });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    const sentence = `could not start the updated Rotaris at ${TARGET}: ${passFailedSentence('the instance record could not be replaced: EBUSY')}`;
    expect(await h.updater.restart()).toMatchObject({ ok: false, code: 'update.restart', headline: NOT_INSTALLED_TITLE, detail: sentence });
    expect(h.closed()).toBe(0);
    expect(h.updater.inFlight()).toBe(false);
    expect(h.notices.current()).toMatchObject({ id: 1, severity: 'error', title: NOT_INSTALLED_TITLE, detail: sentence, action: { label: TRY_AGAIN } });
    // The guard is free: `Try again` runs the sequence again rather than answering `update.busy`.
    expect(await h.updater.install()).not.toMatchObject({ code: 'update.busy' });
  });

  it('a successor that never signals leaves this instance holding its window; nothing times it out', async () => {
    const h = harness({ successor: 'never' });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    const pending = h.updater.restart();
    // The restart starts once the active-run confirmation has answered (OQ-86), a turn after the click.
    await new Promise((r) => setTimeout(r, 0));
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

/*
 * OQ-311, ruled 2026-10-14 by the consortium under R-072: `Restart now`, and `Update now` / `Try again` on the installer
 * flavour, are user-initiated closes. Each asks REQ-SHELL-124's Save/Discard/Cancel of every open main window at the click,
 * ahead of OQ-86's active-run confirmation (REQ-SHELL-119's order), and again immediately before the installer or the
 * successor starts. A Cancel, or a Save that fails, starts nothing and leaves the notice as it was. The portable's in-place
 * apply and the installer's 1,200 ms auto-close are programmatic and ask nothing. Until the ruling was built every one of
 * these closes discarded a window's unsaved settings unasked.
 */
describe('the unsaved-settings guard at the update\'s closes — OQ-311, REQ-SHELL-119 guard (1), REQ-SHELL-124', () => {
  it('Restart now asks the settings before the runs, at the click and at the hand-off; Cancel at the click starts nothing and asks no run box', async () => {
    const declined = harness({ runs: [1], unsaved: [false] });
    await declined.updater.activate({ windowId: 1 });
    await declined.updater.install();
    const notice = declined.notices.current();
    expect(notice).toMatchObject({ title: INSTALLED_TITLE, action: { label: RESTART_NOW } });
    expect(await declined.updater.restart()).toEqual(UPDATE_DECLINED_UNSAVED);
    expect(declined.unsavedAsked).toEqual(['restart@click']);
    expect(declined.asked).toEqual([]);
    expect(declined.reads()).toBe(0);
    expect(declined.started).toEqual([]);
    expect(declined.closed()).toBe(0);
    expect(declined.notices.current()).toEqual(notice);
    expect(declined.updater.state().kind).toBe('applied');
    expect(declined.updater.inFlight()).toBe(false);
    expect(declined.logged.some((l) => /update restart: a window's unsaved settings were not saved or discarded at the click; nothing is started/.test(l))).toBe(true);

    const accepted = harness({ runs: [1] });
    await accepted.updater.activate({ windowId: 1 });
    await accepted.updater.install();
    expect(await accepted.updater.restart()).toEqual({ ok: true, value: { outcome: 'handed-over' } });
    expect(accepted.order).toEqual(['unsaved:restart@click', 'integration:restart@click', 'runs:restart@click', 'unsaved:restart@hand-off', 'integration:restart@hand-off']);
    expect(accepted.started).toEqual([TARGET]);
    expect(accepted.closed()).toBe(1);
  });

  it('Update now on the installer flavour asks the settings before the runs; Cancel at the click downloads nothing, asks no run box, and leaves the offer', async () => {
    const declined = harness({ classification: installer, runs: [1], unsaved: false });
    await declined.updater.activate({ windowId: 1 });
    const offer = declined.notices.current();
    const requestsBefore = declined.srv.requests.length;
    expect(await declined.updater.install()).toEqual(UPDATE_DECLINED_UNSAVED);
    expect(declined.unsavedAsked).toEqual(['install@click']);
    expect(declined.asked).toEqual([]);
    expect(declined.reads()).toBe(0);
    expect(declined.srv.requests.length).toBe(requestsBefore);
    expect(declined.spawned).toEqual([]);
    expect(declined.notices.current()).toEqual(offer);
    expect(declined.updater.state().kind).toBe('offered');
    expect(declined.updater.inFlight()).toBe(false);

    const accepted = harness({ classification: installer, confirm: [true, true], runs: [1, 1] });
    await accepted.updater.activate({ windowId: 1 });
    expect(await accepted.updater.install()).toMatchObject({ ok: true, value: { outcome: 'handed-off' } });
    expect(accepted.order).toEqual(['unsaved:install@click', 'integration:install@click', 'runs:install@click', 'unsaved:install@hand-off', 'integration:install@hand-off', 'runs:install@hand-off']);
    expect(accepted.spawned).toHaveLength(1);
  });

  it('Try again on the installer flavour asks too; Cancel leaves `Update not installed` as it was', async () => {
    const h = harness({ classification: installer, keys: 'empty', unsaved: [true, false] });
    await h.updater.activate({ windowId: 1 });
    expect(await h.updater.install()).toMatchObject({ ok: false });
    const failure = h.notices.current();
    expect(failure).toMatchObject({ title: NOT_INSTALLED_TITLE, action: { label: TRY_AGAIN } });
    expect(await h.updater.install()).toEqual(UPDATE_DECLINED_UNSAVED);
    expect(h.unsavedAsked).toEqual(['install@click', 'install@click']);
    expect(h.notices.current()).toEqual(failure);
    expect(h.updater.state().kind).toBe('failed');
    expect(h.spawned).toEqual([]);
  });

  it('a window that became dirty while the installer downloaded is asked at the hand-off; Cancel spawns no installer and brings the offer back', async () => {
    const h = harness({ classification: installer, unsaved: [true, false] });
    await h.updater.activate({ windowId: 1 });
    expect(await h.updater.install()).toEqual(UPDATE_DECLINED_UNSAVED);
    expect(h.unsavedAsked).toEqual(['install@click', 'install@hand-off']);
    // The download ran and was verified; the hand-off's settings answer stopped it before the run count was re-read.
    expect(h.srv.requests.some((r) => r.url.endsWith(SETUP))).toBe(true);
    expect(h.reads()).toBe(1);
    expect(h.asked).toEqual([]);
    expect(h.spawned).toEqual([]);
    expect(h.staging.dirs.size).toBe(0);
    expect(h.notices.current()).toMatchObject({ id: 1, title: offerTitle('0.2.0'), action: { label: UPDATE_NOW } });
    expect(h.updater.state().kind).toBe('offered');
    expect(h.updater.inFlight()).toBe(false);
    h.clock.advance(INSTALLER_AUTO_CLOSE_MS * 10);
    expect(h.closed()).toBe(0);
    expect(h.logged.some((l) => /update install: a window's unsaved settings were not saved or discarded at the hand-off/.test(l))).toBe(true);
  });

  it('Restart now: Cancel at the hand-off starts no successor and leaves `Update installed` as it was', async () => {
    const h = harness({ unsaved: [true, false] });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    const notice = h.notices.current();
    expect(await h.updater.restart()).toEqual(UPDATE_DECLINED_UNSAVED);
    expect(h.unsavedAsked).toEqual(['restart@click', 'restart@hand-off']);
    expect(h.started).toEqual([]);
    expect(h.closed()).toBe(0);
    expect(h.notices.current()).toEqual(notice);
    expect(h.updater.state().kind).toBe('applied');
  });

  it('the portable\'s Update now asks nothing: its in-place apply closes no window', async () => {
    const h = harness({ runs: [1], unsaved: false });
    await h.updater.activate({ windowId: 1 });
    expect(await h.updater.install()).toEqual({ ok: true, value: { outcome: 'replaced' } });
    expect(h.unsavedAsked).toEqual([]);
    expect(h.asked).toEqual([]);
  });

  it('the installer\'s 1,200 ms auto-close asks nothing: it is programmatic', async () => {
    const h = harness({ classification: installer });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    expect(h.unsavedAsked).toEqual(['install@click', 'install@hand-off']);
    h.clock.advance(INSTALLER_AUTO_CLOSE_MS);
    expect(h.closed()).toBe(1);
    expect(h.unsavedAsked).toEqual(['install@click', 'install@hand-off']);
  });

  it('a guard that cannot be asked declines, with a warning: nothing starts', async () => {
    const h = harness({ unsaved: 'throws' });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    expect(await h.updater.restart()).toEqual(UPDATE_DECLINED_UNSAVED);
    expect(h.started).toEqual([]);
    expect(h.logged.some((l) => /^warn: update restart: the unsaved-settings guard could not be asked at the click \(no main window could be asked\)/.test(l))).toBe(true);
  });

  it('the successor-failure path is unchanged: both guards allowed, nothing closes and `Update not installed` surfaces', async () => {
    const h = harness({ successor: 'fails' });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    expect(await h.updater.restart()).toMatchObject({ ok: false, code: 'update.restart', headline: NOT_INSTALLED_TITLE });
    expect(h.unsavedAsked).toEqual(['restart@click', 'restart@hand-off']);
    expect(h.closed()).toBe(0);
    expect(h.notices.current()).toMatchObject({ severity: 'error', title: NOT_INSTALLED_TITLE, action: { label: TRY_AGAIN } });
  });

  it('the declined outcome cites REQ-SHELL-124 and OQ-311 and is a cancellation, not a failure', () => {
    expect(UPDATE_DECLINED_UNSAVED.ok).toBe(true);
    expect(UPDATE_DECLINED_UNSAVED.value.cancelled).toBe(true);
    expect(UPDATE_DECLINED_UNSAVED.value.reason).toMatch(/REQ-SHELL-124, OQ-311/);
  });
});

/*
 * OQ-361, ruled 2026-10-20 by the consortium under R-072 (point (a)): `Restart now`, and `Update now` / `Try again` on the
 * installer flavour, close every main window, so REQ-SHELL-119 guard (2) ("refused unconditionally") and REQ-NOTIFY-056
 * ("Closing the application while an isolated worktree integration is running is refused") govern them as written. Each asks
 * whether an integration runs anywhere in the instance after the unsaved-settings guard and before OQ-86's run box, at the
 * click and again at the hand-off; one running, or a record that cannot be read, starts nothing. The portable's apply and the
 * 1,200 ms auto-close ask nothing (REQ-NOTIFY-057). Until the ruling was built no update path asked guard (2).
 */
describe('guard (2) at the update\'s closes — OQ-361, REQ-SHELL-119 guard (2), REQ-NOTIFY-056', () => {
  it('Restart now refused at the click: nothing is started, no run box or count, nothing closed, the notice unchanged', async () => {
    const h = harness({ runs: [1], integrating: true });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    const notice = h.notices.current();
    expect(notice).toMatchObject({ title: INSTALLED_TITLE, action: { label: RESTART_NOW } });
    expect(await h.updater.restart()).toEqual(UPDATE_DECLINED_INTEGRATION);
    expect(h.order).toEqual(['unsaved:restart@click', 'integration:restart@click']);
    expect(h.asked).toEqual([]);
    expect(h.reads()).toBe(0);
    expect(h.started).toEqual([]);
    expect(h.closed()).toBe(0);
    expect(h.notices.current()).toEqual(notice);
    expect(h.updater.state().kind).toBe('applied');
    expect(h.updater.inFlight()).toBe(false);
    expect(h.logged.some((l) => /^info: update restart: a worktree integration is running at the click; nothing is started and the notice stays as it was/.test(l))).toBe(true);
  });

  it('Restart now refused at the hand-off: no successor is started and `Update installed` stays as it was', async () => {
    const h = harness({ integrating: [false, true] });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    const notice = h.notices.current();
    expect(await h.updater.restart()).toEqual(UPDATE_DECLINED_INTEGRATION);
    expect(h.integrationAsked).toEqual(['restart@click', 'restart@hand-off']);
    expect(h.started).toEqual([]);
    expect(h.closed()).toBe(0);
    expect(h.notices.current()).toEqual(notice);
    expect(h.updater.state().kind).toBe('applied');
  });

  it('installer Update now refused at the click: nothing is downloaded and the offer stays as it was', async () => {
    const h = harness({ classification: installer, runs: [1], integrating: true });
    await h.updater.activate({ windowId: 1 });
    const offer = h.notices.current();
    const requestsBefore = h.srv.requests.length;
    expect(await h.updater.install()).toEqual(UPDATE_DECLINED_INTEGRATION);
    expect(h.order).toEqual(['unsaved:install@click', 'integration:install@click']);
    expect(h.reads()).toBe(0);
    expect(h.srv.requests.length).toBe(requestsBefore);
    expect(h.spawned).toEqual([]);
    expect(h.notices.current()).toEqual(offer);
    expect(h.updater.state().kind).toBe('offered');
    expect(h.updater.inFlight()).toBe(false);
  });

  it('installer Update now refused at the hand-off, after the download: nothing is spawned and the offer comes back in the same notice', async () => {
    const h = harness({ classification: installer, integrating: [false, true] });
    await h.updater.activate({ windowId: 1 });
    expect(await h.updater.install()).toEqual(UPDATE_DECLINED_INTEGRATION);
    expect(h.integrationAsked).toEqual(['install@click', 'install@hand-off']);
    expect(h.srv.requests.some((r) => r.url.endsWith(SETUP))).toBe(true);
    expect(h.spawned).toEqual([]);
    // Stopped before the run count was re-read at the hand-off: only the click's read happened.
    expect(h.reads()).toBe(1);
    expect(h.staging.dirs.size).toBe(0);
    expect(h.notices.current()).toMatchObject({ id: 1, title: offerTitle('0.2.0'), action: { label: UPDATE_NOW } });
    expect(h.updater.state().kind).toBe('offered');
    h.clock.advance(INSTALLER_AUTO_CLOSE_MS * 10);
    expect(h.closed()).toBe(0);
    expect(h.logged.some((l) => /update install: a worktree integration is running at the hand-off/.test(l))).toBe(true);
  });

  it('accepted, both moments ask unsaved, then integration, then runs', async () => {
    const restart = harness({ runs: [1, 2], confirm: [true, true] });
    await restart.updater.activate({ windowId: 1 });
    await restart.updater.install();
    expect(await restart.updater.restart()).toEqual({ ok: true, value: { outcome: 'handed-over' } });
    expect(restart.order).toEqual(['unsaved:restart@click', 'integration:restart@click', 'runs:restart@click', 'unsaved:restart@hand-off', 'integration:restart@hand-off', 'runs:restart@hand-off']);

    const install = harness({ classification: installer, runs: [1, 1], confirm: [true, true] });
    await install.updater.activate({ windowId: 1 });
    expect(await install.updater.install()).toMatchObject({ ok: true, value: { outcome: 'handed-off' } });
    expect(install.order).toEqual(['unsaved:install@click', 'integration:install@click', 'runs:install@click', 'unsaved:install@hand-off', 'integration:install@hand-off', 'runs:install@hand-off']);
  });

  it('the portable\'s Update now asks nothing: its in-place apply closes no window', async () => {
    const h = harness({ integrating: true });
    await h.updater.activate({ windowId: 1 });
    expect(await h.updater.install()).toEqual({ ok: true, value: { outcome: 'replaced' } });
    expect(h.integrationAsked).toEqual([]);
  });

  it('the installer\'s 1,200 ms auto-close asks nothing (REQ-NOTIFY-057)', async () => {
    const h = harness({ classification: installer, integrating: [false, false, true] });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    expect(h.integrationAsked).toEqual(['install@click', 'install@hand-off']);
    h.clock.advance(INSTALLER_AUTO_CLOSE_MS);
    expect(h.closed()).toBe(1);
    expect(h.integrationAsked).toEqual(['install@click', 'install@hand-off']);
  });

  it('a dependency that throws declines with a warning: nothing starts', async () => {
    const h = harness({ integrating: 'throws' });
    await h.updater.activate({ windowId: 1 });
    await h.updater.install();
    expect(await h.updater.restart()).toEqual(UPDATE_DECLINED_INTEGRATION);
    expect(h.started).toEqual([]);
    expect(h.closed()).toBe(0);
    expect(h.reads()).toBe(0);
    expect(h.logged.some((l) => /^warn: update restart: guard \(2\) could not be asked at the click \(the integration record could not be asked\); nothing is started/.test(l))).toBe(true);
  });

  it('the declined outcome cites REQ-SHELL-119 guard (2), REQ-NOTIFY-056 and OQ-361 and is a cancellation, not a failure', () => {
    expect(UPDATE_DECLINED_INTEGRATION.ok).toBe(true);
    expect(UPDATE_DECLINED_INTEGRATION.value.cancelled).toBe(true);
    expect(UPDATE_DECLINED_INTEGRATION.value.reason).toMatch(/REQ-SHELL-119 guard \(2\), REQ-NOTIFY-056, OQ-361/);
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
