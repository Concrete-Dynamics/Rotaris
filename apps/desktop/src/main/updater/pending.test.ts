import { describe, expect, it } from 'vitest';
import { memoryDisk, plantPending } from './memory-disk.test-support.js';
import {
  discardPending, formatPendingRecord, launchDisposition, loadPending, MAX_APPLY_ATTEMPTS, parsePendingRecord, PENDING_RECORD_NAME, PENDING_SCHEMA, platformKeyOf,
  settleAtLaunch, sweepUpdates, writePending, yieldToFeed, type PendingRecord,
} from './pending.js';

/** REQ-STARTUP-171, REQ-STARTUP-178 (PD-STARTUP-008 revision 2, R-117) — the pending update's record and its files. */
const ROOT = '/home/u/.local/share/rotaris/updates';
const IMAGE = '/home/u/Apps/Rotaris.AppImage';
const record = (over: Partial<PendingRecord> = {}): PendingRecord => ({
  version: '0.2.0', flavour: 'appimage', platformKey: 'linux-x86_64',
  asset: { name: 'Rotaris-0.2.0-linux-x86_64.AppImage', size: 6, sha256: 'c'.repeat(64) },
  state: 'verified', downloadedBy: '0.1.0', verifiedAt: '2026-11-21T12:00:00.000Z', applyAttempts: 0, ...over,
});

describe('the record — schema 1 (REQ-STARTUP-171)', () => {
  it('round-trips every field the requirement names, and names its schema', () => {
    const r = record();
    const text = formatPendingRecord(r);
    expect(JSON.parse(text)).toMatchObject({ schema: PENDING_SCHEMA, version: '0.2.0', flavour: 'appimage', platformKey: 'linux-x86_64', state: 'verified', downloadedBy: '0.1.0', applyAttempts: 0 });
    expect(parsePendingRecord(text)).toEqual(r);
  });

  it('a record of another schema, a missing or ill-typed field, or one naming a path is no record', () => {
    const json = JSON.parse(formatPendingRecord(record())) as Record<string, unknown>;
    const variant = (over: Record<string, unknown>) => JSON.stringify({ ...json, ...over });
    expect(parsePendingRecord('{')).toBeNull();
    expect(parsePendingRecord('[]')).toBeNull();
    expect(parsePendingRecord(variant({ schema: 2 }))).toBeNull();
    expect(parsePendingRecord(variant({ state: 'installed' }))).toBeNull();
    expect(parsePendingRecord(variant({ applyAttempts: -1 }))).toBeNull();
    expect(parsePendingRecord(variant({ version: '../../etc' }))).toBeNull();
    expect(parsePendingRecord(variant({ version: '0.3.0' }))).toBeNull(); // the asset is no longer that version's exact name
    expect(parsePendingRecord(variant({ asset: { name: '../x', size: 1, sha256: 'c'.repeat(64) } }))).toBeNull();
    expect(parsePendingRecord(variant({ asset: { name: 'Rotaris-0.2.0-linux-x86_64.AppImage', size: 1, sha256: 'not-hex' } }))).toBeNull();
    expect(parsePendingRecord(variant({ platformKey: 'windows-x64' }))).toBeNull();
    expect(parsePendingRecord(variant({ flavour: 'portable' }))).toBeNull();
  });

  it('a flavour has one platform key: its artifact is published under one alone (REQ-STARTUP-031)', () => {
    expect(platformKeyOf('installer')).toBe('windows-x64');
    expect(platformKeyOf('portable')).toBe('windows-x64');
    expect(platformKeyOf('appimage')).toBe('linux-x86_64');
    expect(platformKeyOf('app-bundle')).toBe('macos-arm64');
  });

  it('is written atomically: a same-directory temporary file, flushed, then renamed over the record, and the directory flushed', async () => {
    const disk = memoryDisk({ root: ROOT });
    await writePending(disk.area, record());
    expect(disk.ops).toEqual([`mkdir:${ROOT}`, `write:${ROOT}/pending.json.tmp`, `rename:${ROOT}/pending.json.tmp→${ROOT}/pending.json`, `flush-dir:${ROOT}`]);
    expect(disk.tree()).toEqual(['pending.json']);
  });

  it('a write that fails leaves the record as it was and no temporary file', async () => {
    const disk = memoryDisk({ root: ROOT });
    await writePending(disk.area, record({ version: '0.1.5', asset: { name: 'Rotaris-0.1.5-linux-x86_64.AppImage', size: 1, sha256: 'c'.repeat(64) } }));
    const before = disk.text(`${ROOT}/${PENDING_RECORD_NAME}`);
    disk.failAt('rename', 'EIO: input/output error');
    await expect(writePending(disk.area, record())).rejects.toThrow('EIO');
    expect(disk.text(`${ROOT}/${PENDING_RECORD_NAME}`)).toBe(before);
    expect(disk.tree()).toEqual(['pending.json']);
  });
});

describe('reading it — missing, unreadable, unknown or naming absent files is no pending update (REQ-STARTUP-171)', () => {
  it('a record and its three files are a pending update', async () => {
    const disk = memoryDisk({ root: ROOT });
    const planted = plantPending(disk, record(), Buffer.from('image!'));
    expect(await loadPending(disk.area)).toEqual({ record: planted, readAsAbsent: null });
  });

  it('no record is none, and nothing is removed', async () => {
    const disk = memoryDisk({ root: ROOT, files: { [`${ROOT}/0.2.0/x`]: 'x' } });
    expect(await loadPending(disk.area)).toEqual({ record: null, readAsAbsent: null });
    expect(disk.tree()).toEqual(['0.2.0/x']);
  });

  it.each([
    ['unreadable', 'not json', 'unreadable'],
    ['of an unknown schema', JSON.stringify({ schema: 9 }), 'unknown'],
    ['saying `downloading`', formatPendingRecord(record({ state: 'downloading' })), 'downloading'],
  ] as const)('a record %s reads as none, and it and every version directory go', async (_what, text, why) => {
    const disk = memoryDisk({ root: ROOT });
    plantPending(disk, record(), Buffer.from('image!'));
    disk.plant(`${ROOT}/${PENDING_RECORD_NAME}`, text);
    disk.plant(`${ROOT}/installer-handoff.json`, '{}');
    expect(await loadPending(disk.area)).toEqual({ record: null, readAsAbsent: why });
    expect(disk.tree()).toEqual(['installer-handoff.json']);
  });

  it.each([
    ['the manifest', 'SHA256SUMS.txt'],
    ['the signature', 'SHA256SUMS.txt.sig'],
    ['the asset', 'Rotaris-0.2.0-linux-x86_64.AppImage'],
  ] as const)('a record naming %s that is absent reads as none, and its files go', async (_what, name) => {
    const disk = memoryDisk({ root: ROOT });
    plantPending(disk, record(), Buffer.from('image!'));
    disk.files.delete(`${ROOT}/0.2.0/${name}`);
    expect(await loadPending(disk.area)).toEqual({ record: null, readAsAbsent: 'files-absent' });
    expect(disk.tree()).toEqual([]);
  });

  it('an asset whose size is not the recorded one (cut short) is not the file the record names', async () => {
    const disk = memoryDisk({ root: ROOT });
    plantPending(disk, record(), Buffer.from('image!'));
    disk.plant(`${ROOT}/0.2.0/Rotaris-0.2.0-linux-x86_64.AppImage`, 'ima');
    expect((await loadPending(disk.area)).readAsAbsent).toBe('files-absent');
  });
});

describe('the sweep and the discard — REQ-STARTUP-178', () => {
  it('keeps the one pending update\'s three files and removes every other version directory, a partial of its own, and the temporary record', async () => {
    const disk = memoryDisk({ root: ROOT });
    const kept = plantPending(disk, record(), Buffer.from('image!'));
    disk.plant(`${ROOT}/0.2.0/Rotaris-0.2.0-linux-x86_64.AppImage.partial`, 'p');
    disk.plant(`${ROOT}/0.1.5/SHA256SUMS.txt`, 'old');
    disk.plant(`${ROOT}/0.3.0/Rotaris-0.3.0-linux-x86_64.AppImage.partial`, 'p');
    disk.plant(`${ROOT}/pending.json.tmp`, '{');
    disk.plant(`${ROOT}/apply.lock`, '{}');
    disk.plant(`${ROOT}/installer-handoff.json`, '{}');
    disk.plant(`${ROOT}/not-ours/file`, 'x');
    const removed = await sweepUpdates(disk.area, kept);
    expect([...removed].sort()).toEqual(['0.1.5', '0.2.0/Rotaris-0.2.0-linux-x86_64.AppImage.partial', '0.3.0', 'pending.json.tmp']);
    expect(disk.tree()).toEqual(['0.2.0/Rotaris-0.2.0-linux-x86_64.AppImage', '0.2.0/SHA256SUMS.txt', '0.2.0/SHA256SUMS.txt.sig', 'apply.lock', 'installer-handoff.json', 'not-ours/file', 'pending.json']);
  });

  it('a removal that fails is left for a later launch, not reported, and never rejects', async () => {
    const disk = memoryDisk({ root: ROOT, files: { [`${ROOT}/0.1.5/x`]: 'x' } });
    disk.failAt('rmdir', 'EBUSY: resource busy or locked');
    expect(await sweepUpdates(disk.area, null)).toEqual([]);
    expect(disk.tree()).toEqual(['0.1.5/x']);
    disk.revive();
    expect(await sweepUpdates(disk.area, null)).toEqual(['0.1.5']);
  });

  it('a discard removes the record first, then the directory, so an interruption between them leaves only files the sweep removes', async () => {
    const disk = memoryDisk({ root: ROOT });
    plantPending(disk, record(), Buffer.from('image!'));
    disk.crashAt('rmdir');
    expect(await discardPending(disk.area, '0.2.0')).toBe('kept');
    expect(disk.tree()).not.toContain('pending.json');
    disk.revive();
    expect(await loadPending(disk.area)).toEqual({ record: null, readAsAbsent: null });
    await sweepUpdates(disk.area, null);
    expect(disk.tree()).toEqual([]);
  });
});

describe('which pending update stays — REQ-STARTUP-178, UD-5, UD-9', () => {
  const running = { version: '0.1.0', flavour: 'appimage', platformKey: 'linux-x86_64' } as const;
  it('a launch running the same or a newer version, another flavour or platform, or spent attempts discards it; otherwise it stays', () => {
    expect(launchDisposition(record(), running)).toBe('keep');
    expect(launchDisposition(record(), { ...running, version: '0.2.0' })).toBe('applied');
    expect(launchDisposition(record(), { ...running, version: '0.3.0' })).toBe('applied');
    expect(launchDisposition(record(), { ...running, flavour: 'portable', platformKey: 'windows-x64' })).toBe('other-installation');
    expect(launchDisposition(record({ state: 'applying', applyAttempts: MAX_APPLY_ATTEMPTS - 1 }), running)).toBe('keep');
    expect(launchDisposition(record({ state: 'applying', applyAttempts: MAX_APPLY_ATTEMPTS }), running)).toBe('exhausted');
    expect(MAX_APPLY_ATTEMPTS).toBe(2);
  });

  it('UD-5: the feed wins — a newer release replaces it once verified, an older one (withdrawn) discards it, the same keeps it', () => {
    expect(yieldToFeed({ version: '0.2.0' }, '0.3.0')).toBe('newer');
    expect(yieldToFeed({ version: '0.2.0' }, '0.1.9')).toBe('withdrawn');
    expect(yieldToFeed({ version: '0.2.0' }, '0.2.0')).toBe('keep');
  });
});

describe('the launch-time step — REQ-STARTUP-176, REQ-STARTUP-178, REQ-STARTUP-115', () => {
  const installation = { flavour: 'appimage', target: IMAGE } as const;
  it('a `swapped` pending update whose version is not yet running keeps its backup; once that version runs, both go', async () => {
    const disk = memoryDisk({ root: ROOT, files: { [IMAGE]: 'new', [`${IMAGE}.old`]: 'old' } });
    plantPending(disk, record({ state: 'swapped' }), Buffer.from('image!'));
    const early = await settleAtLaunch(disk.area, disk.strategy, installation, '0.1.0');
    expect(early).toMatchObject({ pending: { version: '0.2.0' }, discarded: null, backup: 'nothing' });
    expect(disk.files.has(`${IMAGE}.old`)).toBe(true);
    const painted = await settleAtLaunch(disk.area, disk.strategy, installation, '0.2.0');
    expect(painted).toMatchObject({ pending: null, discarded: { version: '0.2.0', why: 'applied', outcome: 'removed' }, backup: 'removed' });
    expect(disk.files.has(`${IMAGE}.old`)).toBe(false);
    expect(disk.tree()).toEqual([]);
  });

  it('with no pending update a leftover backup and a killed swap\'s sibling are removed', async () => {
    const disk = memoryDisk({ root: ROOT, files: { [IMAGE]: 'v', [`${IMAGE}.old`]: 'old', ['/home/u/Apps/.Rotaris.AppImage.update']: 'half' } });
    expect(await settleAtLaunch(disk.area, disk.strategy, installation, '0.1.0')).toMatchObject({ pending: null, backup: 'removed', incoming: 'removed' });
    expect([...disk.files.keys()]).toEqual([IMAGE]);
  });
});
