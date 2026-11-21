import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakeClock, millis } from '@rotaris/kernel';
import { formatChecksumManifest } from '@rotaris/release-naming';
import { createNoticeStore } from '../notices.js';
import type { Classification } from './classify.js';
import { FEED_ENDPOINT } from './feed.js';
import type { NetworkResponse, UpdateNetwork } from './install.js';
import { KILLED, memoryDisk, type MemoryDisk } from './memory-disk.test-support.js';
import { loadPending, PENDING_RECORD_NAME, readRetained } from './pending.js';
import { revalidatePending } from './revalidate.js';
import { createUpdater } from './updater.js';

/**
 * The background-update plan's part 4 — "Crash, cancel and failure: what each interruption leaves" — for the rows this
 * stage builds (REQ-STARTUP-171, 176, 178; PD-STARTUP-008 revision 2, R-117), on the Linux AppImage first. Each row
 * injects the interruption at one port call of a real click-flow install (`memoryDisk`'s `crashAt`: the process ends
 * there, and every later call of it changes nothing), then starts the next launch over what the disk holds — a fresh
 * updater, running whichever version the artifact's path now names — and asserts what that launch leaves. The
 * installer rows (an installer running or killed) belong to the next-start apply, a later stage, and are not here.
 */
const IMAGE = '/home/u/Apps/Rotaris.AppImage';
const OLD = `${IMAGE}.old`;
const HIDDEN = '/home/u/Apps/.Rotaris.AppImage.update';
const ROOT = '/home/u/.local/share/rotaris/updates';
const ASSET = 'Rotaris-0.2.0-linux-x86_64.AppImage';
const DIR = `${ROOT}/0.2.0`;
const PREVIOUS = Buffer.from('the 0.1.0 AppImage');
const payload = Buffer.alloc(2_500_000, 7);
const digest = createHash('sha256').update(payload).digest('hex');
const appimage: Classification = { updatable: true, flavour: 'appimage', target: IMAGE };

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const KEY = publicKey.export({ type: 'spki', format: 'pem' });
const manifest = Buffer.from(formatChecksumManifest([{ name: ASSET, sha256: digest }]));
const signature = sign(null, manifest, privateKey);

/** The release server; `kill` ends the process at the request whose URL ends with it, as `crashAt` does on the disk. */
function server(disk: MemoryDisk, kill?: string) {
  const feed = JSON.stringify({
    tag_name: 'v0.2.0', draft: false, prerelease: false, body: '',
    assets: [ASSET, 'SHA256SUMS.txt', 'SHA256SUMS.txt.sig'].map((name) => ({ name, browser_download_url: `https://dl/${name}`, size: name === ASSET ? payload.byteLength : 0 })),
  });
  const serve = (bytes: Buffer): NetworkResponse => ({ status: 200, body: (async function* () { for (let at = 0; at < bytes.byteLength; at += 700_000) yield bytes.subarray(at, Math.min(bytes.byteLength, at + 700_000)); })() });
  const network: UpdateNetwork = {
    get: async (url) => {
      if (kill !== undefined && url.endsWith(kill)) { disk.crashAt(() => true); throw new Error(KILLED); }
      if (url === FEED_ENDPOINT) return serve(Buffer.from(feed));
      if (url.endsWith('/SHA256SUMS.txt')) return serve(manifest);
      if (url.endsWith('/SHA256SUMS.txt.sig')) return serve(signature);
      if (url.endsWith(`/${ASSET}`)) return serve(payload);
      throw new Error(`unexpected ${url}`);
    },
  };
  return network;
}

/** One launch of the AppImage over `disk`: running `version`, its first window shown. */
function launch(disk: MemoryDisk, version: string, kill?: string) {
  const clock = new FakeClock();
  const logged: string[] = [];
  const notices = createNoticeStore({ broadcast: () => undefined, pushAcknowledgement: () => undefined, record: async () => true, log: () => undefined, focusedSession: () => 's1' });
  const updater = createUpdater({
    classification: appimage, runningVersion: version, network: server(disk, kill), updates: disk.area, files: disk.strategy,
    spawn: { spawnDetached: async () => undefined }, handOffRecord: { read: async () => null, clear: async () => undefined }, keys: [KEY],
    dismissedVersion: { read: () => undefined, write: async () => undefined }, notices, log: (level, message) => { logged.push(`${level}: ${message}`); },
    timers: clock.timers, wall: clock.wall, startSuccessor: async () => undefined, closeWindows: () => undefined, activeRuns: async () => 0,
    confirmClose: async () => true, confirmUnsaved: async () => true, integrationAllows: async () => true,
    // UD-1: a metered connection keeps these launches on the offer and its `Update now`, the click this file interrupts.
    connectionCost: async () => 'metered', publishState: () => undefined,
  });
  return { updater, logged, notices, clock };
}

/** The 0.1.0 AppImage on disk, launched, offered 0.2.0, and `Update now` pressed with the process ending at `crash`. */
async function interruptedInstall(crash: Parameters<MemoryDisk['crashAt']>[0] | null, kill?: string) {
  const disk = memoryDisk({ root: ROOT, files: { [IMAGE]: PREVIOUS }, dirs: [ROOT] });
  const first = launch(disk, '0.1.0', kill);
  expect(await first.updater.activate({ windowId: 1 })).toBe('offered');
  if (crash !== null) disk.crashAt(crash);
  await first.updater.install();
  return disk;
}

/** The version the artifact's path names — what the next start runs. */
const runs = (disk: MemoryDisk): string => {
  const bytes = disk.files.get(IMAGE);
  if (bytes?.equals(payload)) return '0.2.0';
  if (bytes?.equals(PREVIOUS)) return '0.1.0';
  throw new Error(`the artifact's path names no complete executable: ${bytes === undefined ? 'absent' : `${bytes.byteLength} bytes`}`);
};

/** The next launch: a fresh process over the disk, its first window shown, which is where the launch-time step runs. */
async function nextLaunch(disk: MemoryDisk) {
  disk.revive();
  const version = runs(disk);
  const next = launch(disk, version);
  await next.updater.activate({ windowId: 1 });
  return { version, ...next };
}

describe('part 4 of the background-update plan, row by row — REQ-STARTUP-171, REQ-STARTUP-176, REQ-STARTUP-178 (the AppImage)', () => {
  it.each([
    ['the manifest fetch', null, 'SHA256SUMS.txt'],
    ['the signature fetch', null, 'SHA256SUMS.txt.sig'],
    ['writing the retained manifest', `write:${DIR}/SHA256SUMS.txt`, undefined],
    ['writing the retained signature', `write:${DIR}/SHA256SUMS.txt.sig`, undefined],
  ] as const)('row 1 — interrupted at %s: nothing, or a version directory no record names; the next launch removes it, the installation untouched', async (_at, crash, kill) => {
    const disk = await interruptedInstall(crash, kill);
    expect(disk.files.has(`${ROOT}/${PENDING_RECORD_NAME}`)).toBe(false);
    const next = await nextLaunch(disk);
    expect(next.version).toBe('0.1.0');
    expect(disk.tree()).toEqual([]);
    expect(disk.files.get(IMAGE)).toEqual(PREVIOUS);
  });

  it('row 2 — interrupted while streaming the asset: the `.partial` survives the kill, and the next launch removes it before any new download (REQ-STARTUP-175)', async () => {
    let appends = 0;
    const disk = await interruptedInstall((op) => op.startsWith('append:') && ++appends === 2);
    expect(disk.tree()).toEqual([`0.2.0/${ASSET}.partial`]);
    const next = await nextLaunch(disk);
    // Removed by the launch-time step, which runs before the check's feed request and so before any new download.
    expect(disk.tree()).toEqual([]);
    expect(next.logged.some((l) => l.includes(`removed what no pending update names under the updates directory: 0.2.0`))).toBe(true);
    expect(disk.files.get(IMAGE)).toEqual(PREVIOUS);
  });

  it('row 2 — a quit while streaming abandons the download and removes the partial at once (REQ-STARTUP-046, REQ-SHELL-121)', async () => {
    const disk = memoryDisk({ root: ROOT, files: { [IMAGE]: PREVIOUS }, dirs: [ROOT] });
    const first = launch(disk, '0.1.0');
    await first.updater.activate({ windowId: 1 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let appends = 0;
    const append = disk.area.open.bind(disk.area);
    disk.area.open = async (path) => {
      const sink = await append(path);
      return { write: async (chunk) => { if (++appends === 2) await gate; await sink.write(chunk); }, close: () => sink.close() };
    };
    const installing = first.updater.install();
    while (appends < 2) await new Promise((resolve) => { setImmediate(resolve); });
    // The quit's bound elapses while the download is still streaming: it is abandoned, then the stream resumes and ends.
    const quiesced = first.updater.quiesce(millis(5_000));
    first.clock.advance(5_000);
    await quiesced;
    release();
    await installing;
    expect(disk.tree()).toEqual([]);
    expect(disk.files.get(IMAGE)).toEqual(PREVIOUS);
  });

  it.each([
    ['renaming the partial to the asset', `rename:${DIR}/${ASSET}.partial→${DIR}/${ASSET}`],
    ['writing the record\'s temporary file', `write:${ROOT}/pending.json.tmp`],
    ['renaming the record into place', `rename:${ROOT}/pending.json.tmp→${ROOT}/pending.json`],
  ] as const)('row 3 — between the digest match and the record, interrupted at %s: no record, so the next launch removes the files (REQ-STARTUP-171)', async (_at, crash) => {
    const disk = await interruptedInstall(crash);
    expect(disk.files.has(`${ROOT}/${PENDING_RECORD_NAME}`)).toBe(false);
    expect(disk.tree().length).toBeGreaterThan(0);
    const next = await nextLaunch(disk);
    expect(next.version).toBe('0.1.0');
    expect(disk.tree()).toEqual([]);
    expect(disk.files.get(IMAGE)).toEqual(PREVIOUS);
  });

  it('row 4 — `verified`, never applied: the next launch keeps the record and its files, which revalidate from the retained bytes alone', async () => {
    const disk = await interruptedInstall(`copy:${DIR}/${ASSET}→${HIDDEN}`);
    const next = await nextLaunch(disk);
    expect(next.version).toBe('0.1.0');
    const { record } = await loadPending(disk.area);
    expect(record).toMatchObject({ version: '0.2.0', flavour: 'appimage', platformKey: 'linux-x86_64', state: 'verified', asset: { name: ASSET, size: payload.byteLength, sha256: digest } });
    const retained = await readRetained(disk.area, record!);
    expect(await revalidatePending({ record: record!, retained: retained!, runningVersion: '0.1.0', installation: { flavour: 'appimage', platformKey: 'linux-x86_64' }, keys: [KEY] })).toEqual({ ok: true });
    expect(disk.files.get(IMAGE)).toEqual(PREVIOUS);
  });

  /** Every call the AppImage swap makes (`applyAppImage`), then the record's `swapped` write: each a call and which occurrence of it since `Update now`. */
  const swapCalls: readonly (readonly [string, number])[] = [
    [`copy:${DIR}/${ASSET}→${HIDDEN}`, 1], [`chmod:${HIDDEN}`, 1], [`flush:${HIDDEN}`, 1], [`remove:${OLD}`, 1], [`copy-aside:${IMAGE}→${OLD}`, 1], [`flush:${OLD}`, 1],
    ['flush-dir:/home/u/Apps', 1], [`rename:${HIDDEN}→${IMAGE}`, 1], ['flush-dir:/home/u/Apps', 2], [`write:${ROOT}/pending.json.tmp`, 2], [`rename:${ROOT}/pending.json.tmp→${ROOT}/pending.json`, 2],
  ];
  it.each(swapCalls.map(([call, nth]) => [call, nth] as const))('row 5 — the atomic swap interrupted at %s (occurrence %i): the path names a complete executable, and `.old` goes only once the replaced artifact has painted (REQ-STARTUP-176, UD-11)', async (call, nth) => {
    let seen = 0;
    const disk = await interruptedInstall((op) => op === call && ++seen === nth);
    expect(disk.isDead()).toBe(true);
    const version = runs(disk);
    // The new bytes at the path always come with the previous ones kept beside it.
    if (version === '0.2.0') expect(disk.files.get(OLD)).toEqual(PREVIOUS);
    else if (disk.files.has(OLD)) expect(disk.files.get(OLD)).toEqual(PREVIOUS);
    const next = await nextLaunch(disk);
    // A killed swap's sibling never outlives the next launch (REQ-STARTUP-178).
    expect(disk.files.has(HIDDEN)).toBe(false);
    if (next.version === '0.2.0') {
      // The replaced artifact has painted: its backup, the record and the pending files go.
      expect(disk.files.has(OLD)).toBe(false);
      expect(disk.tree()).toEqual([]);
    } else {
      // Still the previous version: the record, `verified`, is kept with its files; the update is not yet taken.
      expect((await loadPending(disk.area)).record).toMatchObject({ version: '0.2.0', state: 'verified' });
      expect(disk.tree()).toEqual([`0.2.0/${ASSET}`, '0.2.0/SHA256SUMS.txt', '0.2.0/SHA256SUMS.txt.sig', 'pending.json']);
    }
  });

  it('row 5 — uninterrupted: the record says `swapped` and `.old` stays through the process that swapped; the next start of the artifact runs 0.2.0 and removes both', async () => {
    const disk = await interruptedInstall(null);
    expect(runs(disk)).toBe('0.2.0');
    expect((await loadPending(disk.area)).record?.state).toBe('swapped');
    expect(disk.files.get(OLD)).toEqual(PREVIOUS);
    const next = await nextLaunch(disk);
    expect(next.version).toBe('0.2.0');
    expect(disk.files.has(OLD)).toBe(false);
    expect(disk.tree()).toEqual([]);
  });

  it.each([
    ['one byte of the retained asset', `${DIR}/${ASSET}`, 'digest'],
    ['one byte of the retained manifest', `${DIR}/SHA256SUMS.txt`, 'signature'],
    ['one byte of the retained signature', `${DIR}/SHA256SUMS.txt.sig`, 'signature'],
  ] as const)('row 8 — revalidation fails on %s: refused before anything is applied, and the discard leaves the installation as it was (REQ-STARTUP-172)', async (_what, path, check) => {
    const disk = await interruptedInstall(`copy:${DIR}/${ASSET}→${HIDDEN}`);
    disk.revive();
    const bytes = Buffer.from(disk.files.get(path)!);
    const at = Math.floor(bytes.byteLength / 2);
    bytes.writeUInt8(bytes.readUInt8(at) ^ 0x01, at);
    disk.plant(path, bytes);
    const { record } = await loadPending(disk.area);
    const verdict = await revalidatePending({ record: record!, retained: (await readRetained(disk.area, record!))!, runningVersion: '0.1.0', installation: { flavour: 'appimage', platformKey: 'linux-x86_64' }, keys: [KEY] });
    expect(verdict).toMatchObject({ ok: false, check, silent: false });
    expect(disk.files.get(IMAGE)).toEqual(PREVIOUS);
  });

  it('row 9 — the updated build does not start: no automatic rollback (UD-11); the backup is the previous executable, and a launch of it restored by hand changes nothing', async () => {
    const disk = await interruptedInstall(null);
    expect(disk.files.get(OLD)).toEqual(PREVIOUS);
    // The documented recovery by hand: the backup put back over the artifact.
    disk.revive();
    disk.plant(IMAGE, disk.files.get(OLD)!);
    disk.files.delete(OLD);
    const next = await nextLaunch(disk);
    expect(next.version).toBe('0.1.0');
    expect(disk.files.get(IMAGE)).toEqual(PREVIOUS);
    expect(disk.ops.some((op) => op.includes(IMAGE) && !op.startsWith('kind:'))).toBe(false);
  });
});
