import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { UpdateStateSchema, type UpdateState } from '@rotaris/contracts';
import { FakeClock } from '@rotaris/kernel';
import { formatChecksumManifest } from '@rotaris/release-naming';
import { createNoticeStore } from '../notices.js';
import type { Classification } from './classify.js';
import { FEED_ENDPOINT } from './feed.js';
import type { NetworkResponse, UpdateNetwork } from './install.js';
import { memoryDisk, plantPending } from './memory-disk.test-support.js';
import { parsePendingRecord, PENDING_RECORD_NAME, type PendingRecord } from './pending.js';
import type { StrategyFiles } from './strategies.js';
import {
  CANCEL_BOUND_MS, CANCEL_DOWNLOAD, createUpdater, downloadingTitle, INSTALLED_TITLE, installedInPlaceMessage, NOT_INSTALLED_MESSAGE,
  NOT_INSTALLED_TITLE, offerTitle, REFUSED_MESSAGE, RESTART_NOW, TRY_AGAIN, UPDATE_NOW, updatedToTitle,
} from './updater.js';
import type { ConnectionCost } from './metered.js';

/**
 * REQ-STARTUP-169/170, PD-STARTUP-008 revision 3 (UD-1..UD-4, UD-7, items 13–15), PD-SHELL-005 revision 3, PD-SHELL-018 and
 * the rulings OQ-552..555 (R-117, the plan's Stage 2): the download that starts by itself, its cancel, the faces it shows and
 * which transitions take the banner back — over fakes and a controlled clock, the asset held mid-transfer where a case needs
 * something to happen while it runs. The click flow's own cases are `updater.test.ts`'s.
 */

const ASSET = 'Rotaris-0.2.0-windows-x64-portable.exe';
const TARGET = 'E:\\Rotaris-0.1.0-windows-x64-portable.exe';
const ROOT = '/home/u/.local/share/rotaris/updates';
const payload = Buffer.alloc(2_500_000, 5);
const digest = createHash('sha256').update(payload).digest('hex');
const portable: Classification = { updatable: true, flavour: 'portable', target: TARGET };
const installer: Classification = { updatable: true, flavour: 'installer', target: 'C:\\Users\\u\\AppData\\Local\\Rotaris' };

interface Options {
  readonly cost?: ConnectionCost | 'throws';
  readonly classification?: Classification;
  readonly running?: string;
  readonly dismissed?: string;
  /** The asset stops after its first piece until `release()`; `fail()` ends it with a transport error instead. */
  readonly holdAsset?: boolean;
  /** The asset's GET answers this status. */
  readonly assetStatus?: number;
  /** The manifest lists another digest: an integrity refusal. */
  readonly wrongDigest?: boolean;
  /** The successor cannot be started (a failed `Restart now`). */
  readonly successorFails?: boolean;
  /** The held asset does not end on the signal (a transport that does not honour it). */
  readonly ignoreAbort?: boolean;
}

function harness(options: Options = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const manifest = Buffer.from(formatChecksumManifest([{ name: ASSET, sha256: options.wrongDigest ? 'f'.repeat(64) : digest }]));
  const signature = sign(null, manifest, privateKey);
  const feed = JSON.stringify({
    tag_name: 'v0.2.0', draft: false, prerelease: false, body: '',
    assets: [{ name: ASSET, size: payload.byteLength }, { name: 'Rotaris-0.2.0-windows-x64-setup.exe', size: payload.byteLength }, { name: 'SHA256SUMS.txt', size: 0 }, { name: 'SHA256SUMS.txt.sig', size: 0 }].map((a) => ({ ...a, browser_download_url: `https://dl/${a.name}` })),
  });
  const requests: string[] = [];
  let release: () => void = () => undefined;
  let fail: (cause: Error) => void = () => undefined;
  const gate = new Promise<void>((resolve, reject) => { release = resolve; fail = reject; });
  const one = (bytes: Buffer): NetworkResponse => ({ status: 200, body: (async function* () { yield bytes; })() });
  const network: UpdateNetwork = {
    get: async (url, o) => {
      requests.push(url);
      if (url === FEED_ENDPOINT) return one(Buffer.from(feed));
      if (url.endsWith('/SHA256SUMS.txt')) return one(manifest);
      if (url.endsWith('/SHA256SUMS.txt.sig')) return one(signature);
      if (options.assetStatus !== undefined) return { status: options.assetStatus, body: (async function* () { /* none */ })() };
      const signal = o.signal;
      // The asset in 700 kB pieces; held after the first while `holdAsset`, and — as `net.fetch` does — the body rejects as
      // soon as the caller's signal aborts.
      const aborted = new Promise<never>((_resolve, reject) => { signal?.addEventListener('abort', () => reject(new Error('net::ERR_ABORTED')), { once: true }); });
      aborted.catch(() => undefined);
      return {
        status: 200,
        body: (async function* () {
          for (let at = 0; at < payload.byteLength; at += 700_000) {
            if (at > 0 && options.holdAsset) await (options.ignoreAbort ? gate : Promise.race([gate, aborted]));
            yield payload.subarray(at, Math.min(payload.byteLength, at + 700_000));
          }
        })(),
      };
    },
  };
  const disk = memoryDisk({ root: ROOT });
  const files = new Map<string, string>([[TARGET, 'v0.1.0']]);
  const volume: StrategyFiles = {
    makeExecutable: async () => undefined,
    pathKind: async (p) => (files.has(p) ? 'file' : 'absent'),
    copyFile: async (from, to) => { files.set(to, `copy of ${from}`); },
    copyAside: async (from, to) => { files.set(to, files.get(from)!); },
    flushFile: async () => undefined,
    flushDirectory: async () => undefined,
    rename: async (from, to) => { files.set(to, files.get(from)!); files.delete(from); },
    removeFile: async (p) => { files.delete(p); },
  };
  const clock = new FakeClock();
  const logged: string[] = [];
  /** Channel 4 and channel 17 in the one order they were sent, to pin that the state goes first. */
  const wire: string[] = [];
  const states: UpdateState[] = [];
  const acknowledged: string[] = [];
  const notices = createNoticeStore({
    broadcast: (c) => { wire.push(`notice:${c.current === null ? 'none' : `${c.current.id}:${c.current.title}`}`); },
    pushAcknowledgement: (a) => { acknowledged.push(`${a.kind}:${a.title}`); },
    record: async () => true,
    log: () => undefined,
    focusedSession: () => 's1',
  });
  let dismissed = options.dismissed;
  const updater = createUpdater({
    classification: options.classification ?? portable,
    runningVersion: options.running ?? '0.1.0',
    network, updates: disk.area, files: volume, spawn: { spawnDetached: async () => undefined },
    handOffRecord: { read: async () => null, clear: async () => undefined }, keys: [publicKey.export({ type: 'spki', format: 'pem' })],
    dismissedVersion: { read: () => dismissed, write: async (v) => { dismissed = v; } },
    notices,
    connectionCost: async () => { if (options.cost === 'throws') throw new Error('no answer'); return options.cost ?? 'not-metered'; },
    publishState: (state) => { states.push(state); wire.push(`state:${state.phase}${state.measured === undefined ? '' : `:${state.measured}`}`); },
    log: (level, message) => { logged.push(`${level}: ${message}`); },
    timers: clock.timers, wall: clock.wall,
    startSuccessor: async () => { if (options.successorFails) throw new Error('EACCES: cannot execute'); },
    closeWindows: () => undefined, activeRuns: async () => 0, confirmClose: async () => true, confirmUnsaved: async () => true, integrationAllows: async () => true,
  });
  /** Wait until the download has written its first piece and holds (the indicator says `downloading` with a figure past 0). */
  const downloading = async (): Promise<void> => {
    for (let i = 0; i < 200 && !(updater.state().kind === 'downloading' && disk.tree().some((p) => p.endsWith('.partial'))); i += 1) await new Promise((r) => setImmediate(r));
    for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));
  };
  return {
    updater, notices, disk, files, clock, logged, wire, states, acknowledged, requests, release, fail: (m: string) => fail(new Error(m)), downloading,
    dismissed: () => dismissed,
    record: (): PendingRecord | null => { const t = disk.text(`${ROOT}/${PENDING_RECORD_NAME}`); return t === null ? null : parsePendingRecord(t); },
    assetRequests: () => requests.filter((u) => u.endsWith(`/${ASSET}`)).length,
  };
}

describe('the download starts on its own — REQ-STARTUP-169, UD-1, UD-5, UD-8', () => {
  it('a check that finds a newer release downloads, verifies and replaces it in place with no click, and the notice becomes `Update installed` with `Restart now` (OQ-553)', async () => {
    const h = harness();
    expect(await h.updater.activate({ windowId: 1 })).toBe('downloaded');
    expect(h.assetRequests()).toBe(1);
    expect(h.files.get(TARGET)).toBe(`copy of ${ROOT}/0.2.0/${ASSET}`);
    expect(h.notices.current()).toMatchObject({ id: 1, severity: 'success', title: INSTALLED_TITLE, message: installedInPlaceMessage('0.2.0'), persistent: true, action: { label: RESTART_NOW, action: { kind: 'restart' } } });
    expect(installedInPlaceMessage('0.2.0')).toBe('Rotaris 0.2.0 has been downloaded, verified and installed. It runs the next time Rotaris starts, or now with Restart now.');
    expect(h.updater.updateState()).toEqual({ phase: 'ready', version: '0.2.0', inPlace: true, noticeId: 1 });
    expect(h.logged).toContain('info: update check: Rotaris 0.2.0 is available (Rotaris-0.2.0-windows-x64-portable.exe); downloading it with no click (REQ-STARTUP-169)');
  });

  it('the download notice is persistent with `Cancel download` and the meter, from its first face (PD-SHELL-005 rev. 2/3, REQ-NOTIFY-043)', async () => {
    const h = harness({ holdAsset: true });
    const run = h.updater.activate({ windowId: 1 });
    await h.downloading();
    expect(h.notices.current()).toMatchObject({ id: 1, severity: 'info', title: downloadingTitle('0.2.0'), persistent: true, action: { label: CANCEL_DOWNLOAD, action: { kind: 'cancel-update' } } });
    // REQ-NOTIFY-043: the meter from the first face, at the whole percent written so far (the first piece is under 1 MiB).
    expect(h.notices.current()?.progress).toBe(0);
    expect(h.updater.updateState()).toMatchObject({ phase: 'downloading', version: '0.2.0', noticeId: 1 });
    h.release();
    expect(await run).toBe('downloaded');
  });

  it('a connection whose cost is unknown, or whose cost cannot be read, is not metered: it downloads (UD-1)', async () => {
    for (const cost of ['unknown', 'throws'] as const) {
      const h = harness({ cost });
      expect(await h.updater.activate({ windowId: 1 }), cost).toBe('downloaded');
    }
  });

  it('a metered connection downloads nothing and shows REQ-STARTUP-116\'s offer with `Update now`; `Update now` then downloads (UD-1)', async () => {
    const h = harness({ cost: 'metered' });
    expect(await h.updater.activate({ windowId: 1 })).toBe('offered');
    expect(h.assetRequests()).toBe(0);
    expect(h.requests).toEqual([FEED_ENDPOINT]);
    expect(h.notices.current()).toMatchObject({ title: offerTitle('0.2.0'), persistent: true, action: { label: UPDATE_NOW, action: { kind: 'install-update' } } });
    expect(h.logged.some((l) => l.includes('metered, so the download does not start on its own (UD-1)'))).toBe(true);
    expect(await h.updater.install()).toEqual({ ok: true, value: { outcome: 'replaced' } });
    expect(h.assetRequests()).toBe(1);
  });

  it('a waved-off version is not downloaded', async () => {
    const h = harness({ dismissed: '0.2.0' });
    expect(await h.updater.activate({ windowId: 1 })).toBe('dismissed');
    expect(h.assetRequests()).toBe(0);
  });

  it('a pending update of the same version is kept and nothing is downloaded; an older one yields to the newer release (UD-5)', async () => {
    const same = harness();
    plantPending(same.disk, { version: '0.2.0', flavour: 'portable', platformKey: 'windows-x64', asset: { name: ASSET, size: 0, sha256: digest }, state: 'verified', downloadedBy: '0.1.0', verifiedAt: '2026-11-21T00:00:00.000Z', applyAttempts: 0 }, payload);
    expect(await same.updater.activate({ windowId: 1 })).toBe('pending-waits');
    expect(same.assetRequests()).toBe(0);
    expect(same.notices.current()).toBeNull();

    const older = harness();
    plantPending(older.disk, { version: '0.1.5', flavour: 'portable', platformKey: 'windows-x64', asset: { name: 'Rotaris-0.1.5-windows-x64-portable.exe', size: 0, sha256: digest }, state: 'verified', downloadedBy: '0.1.0', verifiedAt: '2026-11-21T00:00:00.000Z', applyAttempts: 0 }, payload);
    expect(await older.updater.activate({ windowId: 1 })).toBe('downloaded');
    expect(older.record()).toMatchObject({ version: '0.2.0', state: 'swapped' });
    expect(older.disk.tree().some((p) => p.startsWith('0.1.5/'))).toBe(false);
  });

  it('the installer flavour keeps the click flow until its next-start apply is built: the offer, nothing downloaded', async () => {
    const h = harness({ classification: installer });
    expect(await h.updater.activate({ windowId: 1 })).toBe('offered');
    expect(h.assetRequests()).toBe(0);
    expect(h.notices.current()?.action?.label).toBe(UPDATE_NOW);
  });
});

describe('the cancel — REQ-STARTUP-170, UD-2', () => {
  it('ends the transfer within 2 s, removes every byte it wrote, records nothing, is no failure, and leaves the offer in place', async () => {
    const h = harness({ holdAsset: true });
    const run = h.updater.activate({ windowId: 1 });
    await h.downloading();
    expect(h.disk.tree().some((p) => p.endsWith('.partial'))).toBe(true);
    const answer = await h.updater.cancel();
    // Answered with the transfer ended, and no fake second has passed: well inside REQ-STARTUP-170's bound.
    expect(answer).toEqual({ ok: true, value: { cancelled: true, ended: true } });
    expect(CANCEL_BOUND_MS).toBe(2_000);
    expect(await run).toBe('download-ended');
    expect(h.disk.tree()).toEqual([]);
    expect(h.record()).toBeNull();
    expect(h.dismissed()).toBeUndefined();
    expect(h.files.get(TARGET)).toBe('v0.1.0');
    expect(h.notices.current()).toMatchObject({ id: 1, severity: 'info', title: offerTitle('0.2.0'), action: { label: UPDATE_NOW } });
    expect(h.updater.updateState()).toEqual({ phase: 'none', noticeId: 1 });
    expect(h.logged.some((l) => l.startsWith('warn:') || l.startsWith('error:'))).toBe(false);
  });

  it('the cancelled version does not download on its own again in this process; dismissing the offer it left waves it off (UD-2, UD-3)', async () => {
    const h = harness({ holdAsset: true });
    const run = h.updater.activate({ windowId: 1 });
    await h.downloading();
    await h.updater.cancel();
    await run;
    // A second window's check in the same process, the offer replaced meanwhile: offered again, not downloaded.
    await h.notices.report({ severity: 'info', title: 'something else' });
    expect(await h.updater.activate({ windowId: 2 })).toBe('offered');
    expect(h.assetRequests()).toBe(1);
    expect(h.logged.some((l) => l.includes('cancelled, or failed on its transport, earlier in this process'))).toBe(true);
    // The offer a cancel leaves is REQ-STARTUP-116's: its Dismiss waves the version off, as REQ-STARTUP-117 states.
    const offer = h.notices.current()!;
    await h.updater.noticeDismissed(offer.id);
    expect(h.dismissed()).toBe('0.2.0');
  });

  it('a cancel with no download running cancels nothing and is not refused', async () => {
    const h = harness({ cost: 'metered' });
    await h.updater.activate({ windowId: 1 });
    expect(await h.updater.cancel()).toEqual({ ok: true, value: { cancelled: false, reason: 'no update download is running' } });
  });

  it('a transfer that has not ended 2 s after the cancel is answered at the bound and says so; it ends at its next piece and leaves nothing', async () => {
    const h = harness({ holdAsset: true, ignoreAbort: true });
    const run = h.updater.activate({ windowId: 1 });
    await h.downloading();
    const answer = h.updater.cancel();
    for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));
    h.clock.advance(CANCEL_BOUND_MS);
    expect(await answer).toEqual({ ok: true, value: { cancelled: true, ended: false } });
    expect(h.logged).toContain(`warn: update cancel: the download of Rotaris 0.2.0 had not ended ${CANCEL_BOUND_MS} ms after the cancel (REQ-STARTUP-170)`);
    h.release();
    expect(await run).toBe('download-ended');
    expect(h.disk.tree()).toEqual([]);
  });
});

describe('dismissing only hides — UD-3, OQ-552', () => {
  it('a Dismiss of the download notice records no `updates/dismissedVersion`, the download runs on, and the indicator stays', async () => {
    const h = harness({ holdAsset: true });
    const run = h.updater.activate({ windowId: 1 });
    await h.downloading();
    await h.updater.noticeDismissed(1);
    await h.notices.dismiss(1);
    expect(h.dismissed()).toBeUndefined();
    expect(h.updater.updateState()).toMatchObject({ phase: 'downloading', noticeId: 1 });
    expect(h.logged).toContain('info: update notice #1 dismissed in its downloading face: hidden only, nothing recorded (UD-3)');
    h.release();
    expect(await run).toBe('downloaded');
    // The ready state does not publish into the slot the user emptied (OQ-554): the indicator carries it.
    expect(h.notices.current()).toBeNull();
    expect(h.updater.updateState()).toEqual({ phase: 'ready', version: '0.2.0', inPlace: true, noticeId: 1 });
  });

  it('a Dismiss of the ready notice records nothing and keeps the pending update and `Restart now` (UD-3)', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    await h.updater.noticeDismissed(1);
    await h.notices.dismiss(1);
    expect(h.dismissed()).toBeUndefined();
    expect(h.record()).toMatchObject({ version: '0.2.0', state: 'swapped' });
    expect(h.updater.state().kind).toBe('applied');
    expect(await h.updater.restart()).toEqual({ ok: true, value: { outcome: 'handed-over' } });
  });
});

describe('which transitions take the banner back — OQ-554, PD-SHELL-005 rev. 3 "When the notice changes"', () => {
  /** Start a held download, then let another notice take the slot. */
  async function replaced(options: Options = {}) {
    const h = harness({ holdAsset: true, ...options });
    const run = h.updater.activate({ windowId: 1 });
    await h.downloading();
    await h.notices.report({ severity: 'warning', title: 'A run needs attention' });
    return { h, run };
  }

  it('progress repaints in place only: while another notice holds the slot it stays, and the indicator\'s figure moves', async () => {
    const { h, run } = await replaced();
    const before = h.states.at(-1)?.measured;
    h.release();
    await run;
    expect(h.notices.current()).toMatchObject({ id: 2, title: 'A run needs attention' });
    const figures = h.states.filter((s) => s.phase === 'downloading').map((s) => s.measured);
    expect(figures.at(-1)).not.toBe(before);
    expect(figures).toContain('100%');
  });

  it('ready while another notice holds the slot publishes nothing; the indicator alone carries it, with `Restart now`', async () => {
    const { h, run } = await replaced();
    h.release();
    expect(await run).toBe('downloaded');
    expect(h.notices.current()).toMatchObject({ id: 2, title: 'A run needs attention' });
    expect(h.updater.updateState()).toEqual({ phase: 'ready', version: '0.2.0', inPlace: true, noticeId: 1 });
    expect(h.logged.some((l) => l.includes('by the title-bar indicator alone'))).toBe(true);
  });

  it('a cancel while another notice holds the slot publishes nothing, and the version is held for the process (UD-2, OQ-554 (c))', async () => {
    const { h, run } = await replaced();
    await h.updater.cancel();
    await run;
    expect(h.notices.current()).toMatchObject({ id: 2, title: 'A run needs attention' });
    expect(h.updater.updateState().phase).toBe('none');
    expect(h.logged.some((l) => l.includes('another notice holds the banner, so the offer is not shown'))).toBe(true);
  });

  it('a cancel after the download notice was dismissed publishes the offer into the empty slot (OQ-554 (c))', async () => {
    const h = harness({ holdAsset: true });
    const run = h.updater.activate({ windowId: 1 });
    await h.downloading();
    await h.updater.noticeDismissed(1);
    await h.notices.dismiss(1);
    await h.updater.cancel();
    await run;
    expect(h.notices.current()).toMatchObject({ id: 2, title: offerTitle('0.2.0'), action: { label: UPDATE_NOW } });
  });

  it('a transport failure of a download the user did not start is silent: the offer in place while current (UD-4, OQ-552 (3))', async () => {
    const h = harness({ holdAsset: true });
    const run = h.updater.activate({ windowId: 1 });
    await h.downloading();
    h.fail('ECONNRESET');
    expect(await run).toBe('download-ended');
    expect(h.notices.current()).toMatchObject({ id: 1, severity: 'info', title: offerTitle('0.2.0'), action: { label: UPDATE_NOW } });
    expect(h.disk.tree()).toEqual([]);
    expect(h.updater.updateState().phase).toBe('none');
    expect(h.logged.some((l) => l.startsWith('warn: update download: Rotaris 0.2.0 failed on its transport') && l.includes('not shown (UD-4)'))).toBe(true);
  });

  it('…and nothing at all while another notice holds the slot', async () => {
    const { h, run } = await replaced();
    h.fail('ECONNRESET');
    await run;
    expect(h.notices.current()).toMatchObject({ id: 2, title: 'A run needs attention' });
  });

  it('a non-200 answer to the asset is a transport failure too, and silent for a download the user did not start', async () => {
    const h = harness({ assetStatus: 503 });
    expect(await h.updater.activate({ windowId: 1 })).toBe('download-ended');
    expect(h.notices.current()).toMatchObject({ title: offerTitle('0.2.0') });
  });

  it('an integrity refusal is shown, replacing whatever holds the slot, as `Update not installed` with no action (UD-4, OQ-555, OQ-554 (b))', async () => {
    const { h, run } = await replaced({ wrongDigest: true });
    h.release();
    expect(await run).toBe('download-ended');
    expect(h.notices.current()).toMatchObject({ id: 3, severity: 'error', title: NOT_INSTALLED_TITLE, message: REFUSED_MESSAGE, persistent: true });
    expect(h.notices.current()?.action).toBeUndefined();
    expect(h.notices.current()?.detail).toContain('does not match the published hash');
    expect(h.updater.updateState().phase).toBe('none');
  });

  it('a failed `Restart now` is always shown, replacing whatever holds the slot, with `Try again` (REQ-STARTUP-179, OQ-554 (b))', async () => {
    const h = harness({ successorFails: true });
    await h.updater.activate({ windowId: 1 });
    await h.notices.report({ severity: 'info', title: 'Something else' });
    expect(await h.updater.restart()).toMatchObject({ ok: false, code: 'update.restart' });
    expect(h.notices.current()).toMatchObject({ id: 3, severity: 'error', title: NOT_INSTALLED_TITLE, message: NOT_INSTALLED_MESSAGE, action: { label: TRY_AGAIN } });
  });
});

describe('channel 17 — PD-SHELL-018, the title-bar brief §3.1', () => {
  it('every publication parses against `UpdateStateSchema`, and the state goes out before the notice changes for the same transition', async () => {
    const h = harness();
    await h.updater.activate({ windowId: 1 });
    for (const state of h.states) expect(UpdateStateSchema.safeParse(state).success, JSON.stringify(state)).toBe(true);
    // downloading → its first notice; ready → the notice in place: each state precedes its notice.
    const firstDownloading = h.wire.indexOf('state:downloading:0%');
    const firstNotice = h.wire.findIndex((w) => w.startsWith(`notice:1:${downloadingTitle('0.2.0')}`));
    expect(firstDownloading).toBeGreaterThanOrEqual(0);
    expect(firstDownloading).toBeLessThan(firstNotice);
    const ready = h.wire.indexOf('state:ready');
    const readyNotice = h.wire.findIndex((w) => w === `notice:1:${INSTALLED_TITLE}`);
    expect(ready).toBeLessThan(readyNotice);
    expect(h.states.filter((s) => s.phase === 'downloading').map((s) => s.measured)).toEqual(expect.arrayContaining(['0%', '41%', '83%', '100%']));
  });

  it('is `none`, with no version and no figure, at rest', () => {
    expect(harness().updater.updateState()).toEqual({ phase: 'none', noticeId: null });
  });
});

describe('"Updated to" — UD-7, PD-SHELL-018 "The acknowledgement"', () => {
  it('the first check of the updated version shows one `Updated to Rotaris {version}` acknowledgement, once', async () => {
    const h = harness({ running: '0.2.0' });
    plantPending(h.disk, { version: '0.2.0', flavour: 'portable', platformKey: 'windows-x64', asset: { name: ASSET, size: 0, sha256: digest }, state: 'swapped', downloadedBy: '0.1.0', verifiedAt: '2026-11-21T00:00:00.000Z', applyAttempts: 0 }, payload);
    await h.updater.activate({ windowId: 1 });
    await h.notices.settled();
    expect(h.acknowledged).toEqual([`ok:${updatedToTitle('0.2.0')}`]);
    expect(updatedToTitle('0.2.0')).toBe('Updated to Rotaris 0.2.0');
    await h.updater.activate({ windowId: 2 });
    expect(h.acknowledged).toHaveLength(1);
  });

  it('a launch with no pending update, or with one it has not reached, shows none', async () => {
    const none = harness({ running: '0.2.0' });
    await none.updater.activate({ windowId: 1 });
    expect(none.acknowledged).toEqual([]);
  });
});
