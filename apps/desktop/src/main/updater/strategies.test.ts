import { describe, expect, it } from 'vitest';
import { applyInstaller, applyPortable, applyUpdate, cleanupPortableBackup, INSTALLER_HANDOFF_MESSAGE, NO_TARGET_SENTENCE, portableBackupPath, portableIncomingPath, REPLACED_MESSAGE, type StrategyFiles, type StrategySpawn } from './strategies.js';

/** An in-memory volume: a map from path to content, with a script of operations that fail. */
function volume(initial: Record<string, string>, failing: Partial<Record<'copy' | 'rename-aside' | 'rename-in' | 'remove-backup', string>> = {}) {
  const files = new Map(Object.entries(initial));
  const ops: string[] = [];
  const port: StrategyFiles = {
    pathKind: async (p) => (files.has(p) ? 'file' : 'absent'),
    copyFile: async (from, to) => {
      ops.push(`copy:${from}→${to}`);
      if (failing.copy) throw new Error(failing.copy);
      files.set(to, files.get(from) ?? `<${from}>`);
    },
    rename: async (from, to) => {
      ops.push(`rename:${from}→${to}`);
      if (failing['rename-aside'] && to.endsWith('.old')) throw new Error(failing['rename-aside']);
      if (failing['rename-in'] && from.endsWith('.update')) throw new Error(failing['rename-in']);
      if (!files.has(from)) throw new Error(`ENOENT: ${from}`);
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    removeFile: async (p) => {
      ops.push(`remove:${p}`);
      if (failing['remove-backup'] && p.endsWith('.old') && files.has(p)) throw new Error(failing['remove-backup']);
      files.delete(p);
    },
  };
  return { files, ops, port };
}

const TARGET = 'E:\\Tools\\Rotaris-0.1.0-windows-x64-portable.exe';
const STAGED = 'C:\\Users\\u\\AppData\\Local\\Temp\\rotaris-update-abc\\Rotaris-0.2.0-windows-x64-portable.exe';

describe('the Windows portable strategy — REQ-STARTUP-125, REQ-STARTUP-126', () => {
  it('names the backup and the incoming file beside the target, whatever the separator', () => {
    expect(portableBackupPath(TARGET)).toBe('E:\\Tools\\Rotaris-0.1.0-windows-x64-portable.exe.old');
    expect(portableIncomingPath(TARGET)).toBe('E:\\Tools\\Rotaris-0.1.0-windows-x64-portable.exe.update');
    expect(portableBackupPath('/media/stick/Rotaris.AppImage')).toBe('/media/stick/Rotaris.AppImage.old');
    expect(portableBackupPath('Rotaris.exe')).toBe('Rotaris.exe.old');
  });

  it('places the verified file beside the target, deletes any previous backup, renames the target aside and moves the new file in, in that order', async () => {
    const v = volume({ [TARGET]: 'v0.1.0', [`${TARGET}.old`]: 'v0.0.9', [STAGED]: 'v0.2.0' });
    const out = await applyPortable(TARGET, STAGED, v.port);
    expect(out).toEqual({ ok: true, outcome: 'replaced', message: REPLACED_MESSAGE });
    expect(v.ops).toEqual([
      `copy:${STAGED}→${TARGET}.update`,
      `remove:${TARGET}.old`,
      `rename:${TARGET}→${TARGET}.old`,
      `rename:${TARGET}.update→${TARGET}`,
    ]);
    expect(v.files.get(TARGET)).toBe('v0.2.0');
    // The backup remains until a later launch removes it (REQ-STARTUP-115).
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
    expect(v.files.get(TARGET)).toBe('v0.1.0');
    expect(v.files.has(`${TARGET}.update`)).toBe(false);
  });

  it('when the final move fails the backup is renamed back before the step reports, so the executable present is the original', async () => {
    const v = volume({ [TARGET]: 'v0.1.0', [STAGED]: 'v0.2.0' }, { 'rename-in': 'EPERM: operation not permitted' });
    expect(await applyPortable(TARGET, STAGED, v.port)).toEqual({ ok: false, sentence: `could not install the update at ${TARGET}: EPERM: operation not permitted` });
    expect(v.ops.slice(-2)).toEqual([`rename:${TARGET}.old→${TARGET}`, `remove:${TARGET}.update`]);
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

  it('a failure renaming the target aside, or deleting the previous backup, removes the placed sibling and changes nothing else', async () => {
    const aside = volume({ [TARGET]: 'v0.1.0', [STAGED]: 'v0.2.0' }, { 'rename-aside': 'EBUSY' });
    expect(await applyPortable(TARGET, STAGED, aside.port)).toMatchObject({ ok: false, sentence: expect.stringContaining('EBUSY') });
    expect(aside.files.get(TARGET)).toBe('v0.1.0');
    expect(aside.files.has(`${TARGET}.update`)).toBe(false);
    const backup = volume({ [TARGET]: 'v0.1.0', [`${TARGET}.old`]: 'held', [STAGED]: 'v0.2.0' }, { 'remove-backup': 'EBUSY: held by the OS' });
    expect(await applyPortable(TARGET, STAGED, backup.port)).toMatchObject({ ok: false, sentence: `could not install the update at ${TARGET}: EBUSY: held by the OS` });
    expect(backup.files.get(TARGET)).toBe('v0.1.0');
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
    const gone: StrategyFiles = { pathKind: async () => { throw new Error('ENOENT: the medium is gone'); }, copyFile: async () => undefined, rename: async () => undefined, removeFile: async () => undefined };
    expect(await cleanupPortableBackup('portable', TARGET, gone)).toBe('kept');
    expect(await cleanupPortableBackup('portable', TARGET, volume({}).port)).toBe('nothing');
  });
});
