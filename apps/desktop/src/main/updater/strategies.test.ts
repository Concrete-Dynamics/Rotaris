import { describe, expect, it } from 'vitest';
import { applyInstaller, applyPortable, applyUpdate, cleanupPortableBackup, INSTALLER_HANDOFF_MESSAGE, NO_TARGET_SENTENCE, portableBackupPath, portableIncomingPath, REPLACED_MESSAGE, type StrategyFiles, type StrategySpawn } from './strategies.js';

const TARGET = 'E:\\Tools\\Rotaris-0.1.0-windows-x64-portable.exe';

/**
 * An in-memory volume: a map from path to content, with a script of operations that fail. After every operation it
 * records what the target path then holds (`null` for nothing), so a test can read off REQ-STARTUP-176's "at every
 * instant" — a process ended after any one of them leaves exactly that on disk. `copy-aside-partial` fails after
 * writing part of `<name>.old`, as a copy interrupted by a full medium does.
 *
 * It also models the machine losing power, on a file system that may journal a rename before the data of the file
 * renamed. Every file is an inode whose bytes reach the medium only by `flushFile`; the directory's entries reach it only
 * by `flushDirectory`, which snapshots them. After every operation `onPowerLoss` records what the target would hold
 * under either outcome for the unflushed entries — the latest names kept, or only the last flushed ones — with
 * `<unflushed>` for a name whose bytes never reached the medium. `durable()` reads what is on the medium now.
 */
type Failing = 'copy' | 'copy-aside' | 'copy-aside-exists' | 'copy-aside-partial' | 'rename-in' | 'remove-backup' | 'flush-update' | 'flush-old' | 'flush-dir-before-rename' | 'flush-dir-after-rename' | 'restore-copy';
function volume(initial: Record<string, string>, failing: Partial<Record<Failing, string>> = {}) {
  type Inode = { content: string; flushed: boolean };
  const entries = new Map<string, Inode>(Object.entries(initial).map(([p, content]) => [p, { content, flushed: true }]));
  let onMedium = new Map(entries);
  const files = { get: (p: string) => entries.get(p)?.content, has: (p: string) => entries.has(p) };
  const ops: string[] = [];
  const targetAfter: (string | null)[] = [];
  const onPowerLoss: (string | null)[] = [];
  const backupOnMedium: (string | null)[] = [];
  const held = (inode: Inode | undefined): string | null => (inode === undefined ? null : inode.flushed ? inode.content : '<unflushed>');
  const settle = () => {
    targetAfter.push(entries.get(TARGET)?.content ?? null);
    onPowerLoss.push(held(entries.get(TARGET)), held(onMedium.get(TARGET)));
    backupOnMedium.push(held(onMedium.get(`${TARGET}.old`)));
  };
  const durable = (): Record<string, string | null> => Object.fromEntries([...onMedium].map(([p, inode]) => [p, held(inode)]));
  const replacedTarget = () => ops.some((op) => op.endsWith(`→${TARGET}`) && op.startsWith('rename:'));
  const port: StrategyFiles = {
    pathKind: async (p) => (entries.has(p) ? 'file' : 'absent'),
    copyFile: async (from, to) => {
      ops.push(`copy:${from}→${to}`);
      try {
        if (failing.copy) throw new Error(failing.copy);
        if (failing['restore-copy'] && from.endsWith('.old')) throw new Error(failing['restore-copy']);
        entries.set(to, { content: entries.get(from)?.content ?? `<${from}>`, flushed: false });
      } finally { settle(); }
    },
    copyAside: async (from, to) => {
      ops.push(`copy-aside:${from}→${to}`);
      try {
        if (failing['copy-aside']) throw new Error(failing['copy-aside']);
        if (failing['copy-aside-exists']) {
          // The race this models: something else put a file at the backup name after `applyPortable` removed the previous
          // one and before this copy ran. The fake writes it, then reports the refusal a real `COPYFILE_EXCL` gives.
          entries.set(to, { content: 'someone else\u2019s file', flushed: true });
          const e = new Error(`EEXIST: file already exists, copyfile '${from}' -> '${to}'`); (e as { code?: string }).code = 'EEXIST'; throw e;
        }
        if (entries.has(to)) { const e = new Error(`EEXIST: file already exists, copyfile '${from}' -> '${to}'`); (e as { code?: string }).code = 'EEXIST'; throw e; }
        if (failing['copy-aside-partial']) { entries.set(to, { content: 'partial', flushed: false }); throw new Error(failing['copy-aside-partial']); }
        entries.set(to, { content: entries.get(from)!.content, flushed: false });
      } finally { settle(); }
    },
    flushFile: async (p) => {
      ops.push(`flush:${p}`);
      try {
        if (failing['flush-update'] && p.endsWith('.update')) throw new Error(failing['flush-update']);
        if (failing['flush-old'] && p.endsWith('.old')) throw new Error(failing['flush-old']);
        const inode = entries.get(p);
        if (inode === undefined) throw new Error(`ENOENT: ${p}`);
        inode.flushed = true;
      } finally { settle(); }
    },
    flushDirectory: async (d) => {
      ops.push(`flush-dir:${d}`);
      try {
        if (failing['flush-dir-before-rename'] && !replacedTarget()) throw new Error(failing['flush-dir-before-rename']);
        if (failing['flush-dir-after-rename'] && replacedTarget()) throw new Error(failing['flush-dir-after-rename']);
        onMedium = new Map(entries);
      } finally { settle(); }
    },
    rename: async (from, to) => {
      ops.push(`rename:${from}→${to}`);
      try {
        if (failing['rename-in'] && from.endsWith('.update')) throw new Error(failing['rename-in']);
        const inode = entries.get(from);
        if (inode === undefined) throw new Error(`ENOENT: ${from}`);
        entries.set(to, inode);
        entries.delete(from);
      } finally { settle(); }
    },
    removeFile: async (p) => {
      ops.push(`remove:${p}`);
      try {
        if (failing['remove-backup'] && p.endsWith('.old') && entries.has(p)) throw new Error(failing['remove-backup']);
        entries.delete(p);
      } finally { settle(); }
    },
  };
  return { files, ops, targetAfter, onPowerLoss, backupOnMedium, durable, port };
}
const STAGED = 'C:\\Users\\u\\AppData\\Local\\Temp\\rotaris-update-abc\\Rotaris-0.2.0-windows-x64-portable.exe';

describe('the Windows portable strategy — REQ-STARTUP-125, REQ-STARTUP-126', () => {
  it('names the backup and the incoming file beside the target, whatever the separator', () => {
    expect(portableBackupPath(TARGET)).toBe('E:\\Tools\\Rotaris-0.1.0-windows-x64-portable.exe.old');
    expect(portableIncomingPath(TARGET)).toBe('E:\\Tools\\Rotaris-0.1.0-windows-x64-portable.exe.update');
    expect(portableBackupPath('/media/stick/Rotaris.AppImage')).toBe('/media/stick/Rotaris.AppImage.old');
    expect(portableBackupPath('Rotaris.exe')).toBe('Rotaris.exe.old');
  });

  it('places the verified file beside the target, deletes any previous backup, copies the target aside and renames the new file onto it, in that order', async () => {
    const v = volume({ [TARGET]: 'v0.1.0', [`${TARGET}.old`]: 'v0.0.9', [STAGED]: 'v0.2.0' });
    const out = await applyPortable(TARGET, STAGED, v.port);
    expect(out).toEqual({ ok: true, outcome: 'replaced', message: REPLACED_MESSAGE });
    expect(v.ops).toEqual([
      `copy:${STAGED}→${TARGET}.update`,
      `flush:${TARGET}.update`,
      `remove:${TARGET}.old`,
      `copy-aside:${TARGET}→${TARGET}.old`,
      `flush:${TARGET}.old`,
      'flush-dir:E:\\Tools',
      `rename:${TARGET}.update→${TARGET}`,
      'flush-dir:E:\\Tools',
    ]);
    // REQ-STARTUP-176: after every step the target path names a complete executable, the previous one until the single
    // rename replaces it with the new one — never nothing. The target is never the source of a rename.
    expect(v.targetAfter).toEqual(['v0.1.0', 'v0.1.0', 'v0.1.0', 'v0.1.0', 'v0.1.0', 'v0.1.0', 'v0.2.0', 'v0.2.0']);
    expect(v.ops.some((op) => op.startsWith(`rename:${TARGET}→`))).toBe(false);
    expect(v.files.get(TARGET)).toBe('v0.2.0');
    // The backup remains until a later launch removes it (REQ-STARTUP-115).
    expect(v.files.get(`${TARGET}.old`)).toBe('v0.1.0');
    expect(v.files.has(`${TARGET}.update`)).toBe(false);
  });

  it('a power loss at any instant leaves the target naming flushed bytes, the backup is on the medium before the target is replaced, and the outcome is on it before the step reports', async () => {
    const v = volume({ [TARGET]: 'v0.1.0', [`${TARGET}.old`]: 'v0.0.9', [STAGED]: 'v0.2.0' });
    expect(await applyPortable(TARGET, STAGED, v.port)).toMatchObject({ ok: true, outcome: 'replaced' });
    // The incoming file's data is flushed before the rename onto the target: with that flush gone, the rename would name
    // `<unflushed>` bytes for a power loss that kept it.
    expect(v.onPowerLoss.every((held) => held === 'v0.1.0' || held === 'v0.2.0')).toBe(true);
    // The backup's bytes and its name reached the medium before the one rename that leaves it the only previous copy.
    const renamedAt = v.ops.indexOf(`rename:${TARGET}.update→${TARGET}`);
    expect(v.backupOnMedium[renamedAt]).toBe('v0.1.0');
    // And the directory was flushed after that rename: what the medium holds once the step reports is its outcome.
    expect(v.durable()).toEqual({ [TARGET]: 'v0.2.0', [`${TARGET}.old`]: 'v0.1.0', [STAGED]: 'v0.2.0' });
    expect(v.ops.lastIndexOf('flush-dir:E:\\Tools')).toBeGreaterThan(renamedAt);
  });

  it('a flush that fails before the rename fails the step: the target is untouched throughout, and no sibling of the attempt is left', async () => {
    for (const failing of [{ 'flush-update': 'EIO: i/o error, fsync' }, { 'flush-old': 'EIO: i/o error, fsync' }, { 'flush-dir-before-rename': 'EIO: i/o error, fsync' }] as const) {
      const v = volume({ [TARGET]: 'v0.1.0', [STAGED]: 'v0.2.0' }, failing);
      expect(await applyPortable(TARGET, STAGED, v.port)).toEqual({ ok: false, sentence: `could not install the update at ${TARGET}: EIO: i/o error, fsync` });
      expect(v.targetAfter.every((held) => held === 'v0.1.0')).toBe(true);
      expect(v.onPowerLoss.every((held) => held === 'v0.1.0')).toBe(true);
      expect(v.ops.some((op) => op.startsWith('rename:'))).toBe(false);
      expect(v.files.get(TARGET)).toBe('v0.1.0');
      expect(v.files.has(`${TARGET}.old`)).toBe(false);
      expect(v.files.has(`${TARGET}.update`)).toBe(false);
    }
  });

  it('a directory flush that fails after the rename puts the previous bytes back by the same order, and the target ends as it was', async () => {
    const v = volume({ [TARGET]: 'v0.1.0', [STAGED]: 'v0.2.0' }, { 'flush-dir-after-rename': 'EIO: i/o error, fsync' });
    expect(await applyPortable(TARGET, STAGED, v.port)).toEqual({ ok: false, sentence: `could not install the update at ${TARGET}: EIO: i/o error, fsync` });
    expect(v.ops.slice(v.ops.indexOf(`rename:${TARGET}.update→${TARGET}`))).toEqual([
      `rename:${TARGET}.update→${TARGET}`,
      'flush-dir:E:\\Tools',
      `copy:${TARGET}.old→${TARGET}.update`,
      `flush:${TARGET}.update`,
      `rename:${TARGET}.update→${TARGET}`,
      'flush-dir:E:\\Tools',
      `remove:${TARGET}.old`,
    ]);
    // Never empty and never unflushed, while the new bytes stood at the path and after they were put back.
    expect(v.targetAfter.every((held) => held === 'v0.1.0' || held === 'v0.2.0')).toBe(true);
    expect(v.onPowerLoss.every((held) => held === 'v0.1.0' || held === 'v0.2.0')).toBe(true);
    expect(v.ops.some((op) => op.startsWith(`rename:${TARGET}→`))).toBe(false);
    expect(v.files.get(TARGET)).toBe('v0.1.0');
    expect(v.files.has(`${TARGET}.old`)).toBe(false);
    expect(v.files.has(`${TARGET}.update`)).toBe(false);
  });

  it('when putting the previous bytes back fails too, the sentence says the new version is at the path, and the previous one is kept as `<name>.old`', async () => {
    const v = volume({ [TARGET]: 'v0.1.0', [STAGED]: 'v0.2.0' }, { 'flush-dir-after-rename': 'EIO: i/o error, fsync', 'restore-copy': 'ENOSPC: no space left on device' });
    expect(await applyPortable(TARGET, STAGED, v.port)).toEqual({ ok: false, sentence: `could not install the update at ${TARGET}: EIO: i/o error, fsync; putting the previous version back failed too (ENOSPC: no space left on device), so the new version is at the path and the previous one is kept beside it as ${TARGET}.old` });
    expect(v.onPowerLoss.every((held) => held === 'v0.1.0' || held === 'v0.2.0')).toBe(true);
    expect(v.files.get(TARGET)).toBe('v0.2.0');
    expect(v.files.get(`${TARGET}.old`)).toBe('v0.1.0');
    expect(v.files.has(`${TARGET}.update`)).toBe(false);
  });

  it('with no released-artifact target it fails with the fixed sentence and changes nothing on disk', async () => {
    const v = volume({ [STAGED]: 'v0.2.0', ['E:\\Tools']: 'dir' });
    const port: StrategyFiles = { ...v.port, pathKind: async (p) => (p === 'E:\\Tools' ? 'directory' : v.files.has(p) ? 'file' : 'absent') };
    expect(await applyPortable(TARGET, STAGED, port)).toEqual({ ok: false, sentence: NO_TARGET_SENTENCE });
    expect(v.ops).toEqual([]);
  });

  it('when the medium holding the artifact has been removed since launch, it fails naming the target and changes nothing', async () => {
    const v = volume({ [STAGED]: 'v0.2.0' });
    expect(await applyPortable(TARGET, STAGED, v.port)).toEqual({ ok: false, sentence: `could not install the update at ${TARGET}: the directory holding it cannot be reached (the medium may have been removed)` });
    expect(v.ops).toEqual([]);
  });

  it('when the medium cannot be written the step fails naming the target, and the original is byte-for-byte what it was', async () => {
    const v = volume({ [TARGET]: 'v0.1.0', [STAGED]: 'v0.2.0' }, { copy: 'EROFS: read-only file system' });
    expect(await applyPortable(TARGET, STAGED, v.port)).toEqual({ ok: false, sentence: `could not install the update at ${TARGET}: EROFS: read-only file system` });
    expect(v.targetAfter.every((held) => held === 'v0.1.0')).toBe(true);
    expect(v.files.get(TARGET)).toBe('v0.1.0');
    expect(v.files.has(`${TARGET}.update`)).toBe(false);
  });

  it('when the final rename fails the target was never moved and still holds the original; nothing is renamed back, and what the attempt added is removed', async () => {
    const v = volume({ [TARGET]: 'v0.1.0', [STAGED]: 'v0.2.0' }, { 'rename-in': 'EPERM: operation not permitted' });
    expect(await applyPortable(TARGET, STAGED, v.port)).toEqual({ ok: false, sentence: `could not install the update at ${TARGET}: EPERM: operation not permitted` });
    expect(v.ops.slice(-3)).toEqual([`rename:${TARGET}.update→${TARGET}`, `remove:${TARGET}.old`, `remove:${TARGET}.update`]);
    // No rollback rename: the only rename ever attempted is the one that failed.
    expect(v.ops.filter((op) => op.startsWith('rename:'))).toEqual([`rename:${TARGET}.update→${TARGET}`]);
    expect(v.targetAfter.every((held) => held === 'v0.1.0')).toBe(true);
    expect(v.files.get(TARGET)).toBe('v0.1.0');
    expect(v.files.has(`${TARGET}.old`)).toBe(false);
    expect(v.files.has(`${TARGET}.update`)).toBe(false);
  });

  it('a `<name>.update` left by an earlier interrupted attempt is the updater\'s own sibling: it is replaced, and the apply goes through', async () => {
    const v = volume({ [TARGET]: 'v0.1.0', [`${TARGET}.update`]: 'stale partial', [STAGED]: 'v0.2.0' });
    expect(await applyPortable(TARGET, STAGED, v.port)).toMatchObject({ ok: true, outcome: 'replaced' });
    expect(v.files.get(TARGET)).toBe('v0.2.0');
    expect(v.files.get(`${TARGET}.old`)).toBe('v0.1.0');
    expect(v.files.has(`${TARGET}.update`)).toBe(false);
  });

  it('a failure copying the target aside removes the partial backup and the placed sibling, and the target is untouched throughout', async () => {
    for (const failing of [{ 'copy-aside': 'EBUSY' }, { 'copy-aside-partial': 'ENOSPC: no space left on device' }] as const) {
      const aside = volume({ [TARGET]: 'v0.1.0', [STAGED]: 'v0.2.0' }, failing);
      expect(await applyPortable(TARGET, STAGED, aside.port)).toEqual({ ok: false, sentence: `could not install the update at ${TARGET}: ${Object.values(failing)[0]}` });
      expect(aside.targetAfter.every((held) => held === 'v0.1.0')).toBe(true);
      expect(aside.ops.some((op) => op.startsWith('rename:'))).toBe(false);
      expect(aside.files.get(TARGET)).toBe('v0.1.0');
      expect(aside.files.has(`${TARGET}.old`)).toBe(false);
      expect(aside.files.has(`${TARGET}.update`)).toBe(false);
    }
  });

  it('a file that appeared at the backup name since the previous backup was removed is refused, not deleted', async () => {
    // `copyAside` is exclusive (COPYFILE_EXCL): a foreign file at `<name>.old` is not this attempt's to remove, so the
    // step fails with EEXIST and leaves it exactly where it was, alongside the target it never touched.
    const v = volume({ [TARGET]: 'v0.1.0', [STAGED]: 'v0.2.0' }, { 'copy-aside-exists': 'EEXIST' });
    expect(await applyPortable(TARGET, STAGED, v.port)).toMatchObject({ ok: false });
    expect(v.targetAfter.every((held) => held === 'v0.1.0')).toBe(true);
    expect(v.files.get(`${TARGET}.old`)).toBe('someone else\u2019s file');
    expect(v.files.get(TARGET)).toBe('v0.1.0');
    expect(v.files.has(`${TARGET}.update`)).toBe(false);
    expect(v.ops.some((op) => op.startsWith('rename:'))).toBe(false);
  });

  it('a failure deleting the previous backup removes the placed sibling and changes nothing else', async () => {
    const backup = volume({ [TARGET]: 'v0.1.0', [`${TARGET}.old`]: 'held', [STAGED]: 'v0.2.0' }, { 'remove-backup': 'EBUSY: held by the OS' });
    expect(await applyPortable(TARGET, STAGED, backup.port)).toMatchObject({ ok: false, sentence: `could not install the update at ${TARGET}: EBUSY: held by the OS` });
    expect(backup.targetAfter.every((held) => held === 'v0.1.0')).toBe(true);
    expect(backup.ops.some((op) => op.startsWith('copy-aside:') || op.startsWith('rename:'))).toBe(false);
    expect(backup.files.get(TARGET)).toBe('v0.1.0');
    expect(backup.files.get(`${TARGET}.old`)).toBe('held');
    expect(backup.files.has(`${TARGET}.update`)).toBe(false);
  });
});

describe('the Windows installer strategy — REQ-STARTUP-125, REQ-STARTUP-127', () => {
  it('starts the verified setup executable as a surviving process, edits nothing itself, and hands off with quit required', async () => {
    const spawned: string[] = [];
    const spawn: StrategySpawn = { spawnDetached: async (exe, args) => { spawned.push(`${exe} ${args.join(' ')}`.trim()); } };
    const setup = 'C:\\Temp\\rotaris-update-x\\Rotaris-0.2.0-windows-x64-setup.exe';
    expect(await applyInstaller(setup, spawn)).toEqual({ ok: true, outcome: 'handed-off', quitRequired: true, message: INSTALLER_HANDOFF_MESSAGE });
    expect(spawned).toEqual([setup]);
  });

  it('reports a process that cannot be started with the fixed sentence', async () => {
    const spawn: StrategySpawn = { spawnDetached: async () => { throw new Error('EACCES: permission denied'); } };
    expect(await applyInstaller('C:\\x\\setup.exe', spawn)).toEqual({ ok: false, sentence: 'could not start the installer at C:\\x\\setup.exe: EACCES: permission denied' });
  });
});

describe('strategy selection — REQ-STARTUP-125 under PD-STARTUP-001', () => {
  it('selects by flavour, and the two unbuilt strategies refuse with one sentence changing nothing', async () => {
    const v = volume({});
    const spawn: StrategySpawn = { spawnDetached: async () => undefined };
    expect(await applyUpdate('appimage', '/a.AppImage', '/tmp/x', v.port, spawn)).toEqual({ ok: false, sentence: 'the AppImage strategy is not built while PD-STARTUP-001 stands; nothing was changed' });
    expect(await applyUpdate('app-bundle', '/Applications/rotaris.app', '/tmp/x', v.port, spawn)).toEqual({ ok: false, sentence: 'the disk-image strategy is not built while PD-STARTUP-001 stands; nothing was changed' });
    expect(v.ops).toEqual([]);
    expect(await applyUpdate('installer', 'C:\\Rotaris', 'C:\\t\\setup.exe', v.port, spawn)).toMatchObject({ outcome: 'handed-off' });
  });
});

describe('launch-time cleanup of the portable backup — REQ-STARTUP-115', () => {
  it('deletes a leftover <name>.old beside the artifact for the portable flavour, and nothing for every other flavour', async () => {
    const v = volume({ [TARGET]: 'v', [`${TARGET}.old`]: 'old' });
    expect(await cleanupPortableBackup('portable', TARGET, v.port)).toBe('removed');
    expect(v.files.has(`${TARGET}.old`)).toBe(false);
    const other = volume({ ['C:\\Rotaris\\Rotaris.exe.old']: 'x' });
    expect(await cleanupPortableBackup('installer', 'C:\\Rotaris', other.port)).toBe('nothing');
    expect(other.ops).toEqual([]);
  });

  it('a deletion failure is tolerated silently and left for a later launch; an unreachable directory is nothing to do', async () => {
    const held = volume({ [`${TARGET}.old`]: 'old' }, { 'remove-backup': 'EBUSY' });
    expect(await cleanupPortableBackup('portable', TARGET, held.port)).toBe('kept');
    const gone: StrategyFiles = { pathKind: async () => { throw new Error('ENOENT: the medium is gone'); }, copyFile: async () => undefined, copyAside: async () => undefined, flushFile: async () => undefined, flushDirectory: async () => undefined, rename: async () => undefined, removeFile: async () => undefined };
    expect(await cleanupPortableBackup('portable', TARGET, gone)).toBe('kept');
    expect(await cleanupPortableBackup('portable', TARGET, volume({}).port)).toBe('nothing');
  });
});
