import type { DownloadSink } from './download.js';
import { CHECKSUM_MANIFEST_NAME, CHECKSUM_SIGNATURE_NAME } from '@rotaris/release-naming';
import { formatPendingRecord, PENDING_RECORD_NAME, type PendingRecord, type UpdatesArea } from './pending.js';
import type { StrategyFiles } from './strategies.js';

/**
 * One in-memory POSIX volume behind both of the updater's file ports — `UpdatesArea` (the per-user `updates` directory)
 * and `StrategyFiles` (the artifact's directory) — so a test sees the pending update and the artifact on the same disk,
 * and an interruption injected at one port call is seen by both.
 *
 * `crashAt(match)` is a process ended at a port call (the background-update plan's part 4): the first call whose
 * operation matches throws and the process is dead from then on — every later call throws and changes nothing, which is
 * what a killed process does to the disk, cleanup paths included. `revive()` is the next launch, over what the disk
 * holds. `failAt(match, message)` is one failure the process survives. Every call is recorded in `ops` as `<op>:<path>`.
 */
export const KILLED = 'the process was ended';

type Match = string | RegExp | ((op: string) => boolean);
const matches = (m: Match, op: string): boolean => (typeof m === 'string' ? op === m || op.startsWith(`${m}:`) : m instanceof RegExp ? m.test(op) : m(op));

export function memoryDisk(options: { root?: string; files?: Record<string, string | Buffer>; dirs?: readonly string[] } = {}) {
  const root = options.root ?? '/home/u/.local/share/rotaris/updates';
  const files = new Map<string, Buffer>();
  const dirs = new Set<string>(['/']);
  const ops: string[] = [];
  let dead = false;
  let crash: Match | null = null;
  const failures: { match: Match; message: string }[] = [];

  const parentOf = (path: string): string => {
    const at = path.lastIndexOf('/');
    return at <= 0 ? '/' : path.slice(0, at);
  };
  const addDirs = (dir: string): void => {
    for (let d = dir; d !== '/' && !dirs.has(d); d = parentOf(d)) dirs.add(d);
  };
  for (const dir of options.dirs ?? []) addDirs(dir);
  for (const [path, bytes] of Object.entries(options.files ?? {})) {
    addDirs(parentOf(path));
    files.set(path, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  }

  /** Every port call passes here first: recorded, then killed or failed as the test arranged. */
  const step = (op: string): void => {
    if (dead) throw new Error(KILLED);
    ops.push(op);
    if (crash !== null && matches(crash, op)) {
      dead = true;
      throw new Error(KILLED);
    }
    const failure = failures.findIndex((f) => matches(f.match, op));
    if (failure >= 0) {
      const { message } = failures[failure]!;
      failures.splice(failure, 1);
      throw Object.assign(new Error(message), { code: message.split(':')[0] });
    }
  };
  const needParent = (path: string): void => {
    if (!dirs.has(parentOf(path))) throw Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), { code: 'ENOENT' });
  };
  const removeTree = (dir: string): void => {
    for (const path of [...files.keys()]) if (path.startsWith(`${dir}/`)) files.delete(path);
    for (const d of [...dirs]) if (d === dir || d.startsWith(`${dir}/`)) dirs.delete(d);
  };

  const area: UpdatesArea = {
    root,
    join: (dir, name) => `${dir}/${name}`,
    list: async (dir) => {
      step(`list:${dir}`);
      const names = new Set<string>();
      for (const path of [...files.keys(), ...dirs]) {
        if (path !== dir && parentOf(path) === dir) names.add(path.slice(dir.length + 1));
      }
      return [...names].sort();
    },
    makeDirectory: async (dir) => { step(`mkdir:${dir}`); addDirs(dir); },
    readFile: async (path) => { step(`read:${path}`); return files.get(path) ?? null; },
    readStream: (path) => (async function* () {
      step(`stream:${path}`);
      const bytes = files.get(path);
      if (bytes === undefined) throw Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), { code: 'ENOENT' });
      for (let at = 0; at < bytes.byteLength; at += 600_000) yield bytes.subarray(at, Math.min(bytes.byteLength, at + 600_000));
    })(),
    fileSize: async (path) => { step(`size:${path}`); return files.get(path)?.byteLength ?? null; },
    writeFile: async (path, bytes) => { step(`write:${path}`); needParent(path); files.set(path, Buffer.from(bytes)); },
    open: async (path) => {
      step(`open:${path}`);
      needParent(path);
      if (files.has(path)) throw Object.assign(new Error(`EEXIST: file already exists, '${path}'`), { code: 'EEXIST' });
      files.set(path, Buffer.alloc(0));
      const sink: DownloadSink & { close(): Promise<void> } = {
        write: async (chunk) => { step(`append:${path}`); files.set(path, Buffer.concat([files.get(path) ?? Buffer.alloc(0), chunk])); },
        close: async () => { step(`close:${path}`); },
      };
      return sink;
    },
    rename: async (from, to) => {
      step(`rename:${from}→${to}`);
      const bytes = files.get(from);
      if (bytes === undefined) throw Object.assign(new Error(`ENOENT: no such file or directory, '${from}'`), { code: 'ENOENT' });
      needParent(to);
      files.set(to, bytes);
      files.delete(from);
    },
    flushDirectory: async (dir) => { step(`flush-dir:${dir}`); },
    removeFile: async (path) => { step(`remove:${path}`); files.delete(path); },
    removeDirectory: async (dir) => { step(`rmdir:${dir}`); removeTree(dir); },
  };

  /** The artifact's side of the same volume. A copy carries the source's bytes, as Node's `copyFile` does. */
  const strategy: StrategyFiles = {
    pathKind: async (path) => { step(`kind:${path}`); return files.has(path) ? 'file' : dirs.has(path) ? 'directory' : 'absent'; },
    copyFile: async (from, to) => {
      step(`copy:${from}→${to}`);
      const bytes = files.get(from);
      if (bytes === undefined) throw Object.assign(new Error(`ENOENT: no such file or directory, '${from}'`), { code: 'ENOENT' });
      needParent(to);
      files.set(to, bytes);
    },
    copyAside: async (from, to) => {
      step(`copy-aside:${from}→${to}`);
      if (files.has(to)) throw Object.assign(new Error(`EEXIST: file already exists, '${to}'`), { code: 'EEXIST' });
      const bytes = files.get(from);
      if (bytes === undefined) throw Object.assign(new Error(`ENOENT: no such file or directory, '${from}'`), { code: 'ENOENT' });
      files.set(to, bytes);
    },
    flushFile: async (path) => { step(`flush:${path}`); },
    flushDirectory: async (dir) => { step(`flush-dir:${dir}`); },
    rename: async (from, to) => area.rename(from, to),
    removeFile: async (path) => { step(`remove:${path}`); files.delete(path); },
    makeExecutable: async (path) => { step(`chmod:${path}`); },
  };

  return {
    area, strategy, files, dirs, ops, root,
    /** The process ends at the first call matching `match`. */
    crashAt: (match: Match) => { crash = match; },
    /** One call matching `match` fails with `message` (its code is the text before the first colon); the process lives on. */
    failAt: (match: Match, message: string) => { failures.push({ match, message }); },
    /** The next launch: the process is alive again, over what the disk holds; nothing is armed. */
    revive: () => { dead = false; crash = null; failures.length = 0; ops.length = 0; },
    isDead: () => dead,
    /** Put a file on the disk as a previous process left it, recording no call. */
    plant: (path: string, bytes: string | Buffer) => { addDirs(parentOf(path)); files.set(path, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)); },
    text: (path: string) => files.get(path)?.toString('utf8') ?? null,
    /** Every path under `dir`, files only, relative and sorted. */
    tree: (dir: string = root) => [...files.keys()].filter((p) => p.startsWith(`${dir}/`)).map((p) => p.slice(dir.length + 1)).sort(),
  };
}
export type MemoryDisk = ReturnType<typeof memoryDisk>;

/**
 * A pending update as an earlier process left it (REQ-STARTUP-171): the record, and the version's directory with the
 * manifest, the signature and the asset. `record.asset.size` is set from `asset`.
 */
export function plantPending(disk: MemoryDisk, record: PendingRecord, asset: Buffer, manifest: Buffer = Buffer.from('manifest\n'), signature: Buffer = Buffer.alloc(64, 1)): PendingRecord {
  const full: PendingRecord = { ...record, asset: { ...record.asset, size: asset.byteLength } };
  const dir = `${disk.root}/${full.version}`;
  disk.plant(`${dir}/${CHECKSUM_MANIFEST_NAME}`, manifest);
  disk.plant(`${dir}/${CHECKSUM_SIGNATURE_NAME}`, signature);
  disk.plant(`${dir}/${full.asset.name}`, asset);
  disk.plant(`${disk.root}/${PENDING_RECORD_NAME}`, formatPendingRecord(full));
  return full;
}
