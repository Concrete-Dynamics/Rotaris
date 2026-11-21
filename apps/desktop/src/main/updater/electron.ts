import { execFile, spawn } from 'node:child_process';
import { constants as fsConstants, createReadStream, createWriteStream, promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { app, net } from 'electron';
import type { ArtifactVariables } from '@rotaris/platform';
import type { DownloadSink } from './download.js';
import { classifyInstallation, parseInstallDir, type Classification } from './classify.js';
import { flushDirectory, flushFile } from './flush.js';
import type { HandOffRecordFile, NetworkResponse, UpdateNetwork } from './install.js';
import { METERED_QUERY_TIMEOUT_MS, NM_METERED_ARGS, parseNetworkManagerMetered, type ConnectionCost } from './metered.js';
import { LEGACY_HANDOFF_RECORD_NAME, type UpdatesArea } from './pending.js';
import type { StrategyFiles, StrategySpawn } from './strategies.js';

/**
 * The updater's ports over Electron and Node — the ONE file of the updater that touches the network, the disk, a
 * process or the registry. Everything else in this directory is pure over these and is decided in tests with fakes;
 * this file is exercised by the built application alone (and, for the apply and restart steps, only on a Windows
 * host, IC-3), which is why it holds no logic beyond the calls.
 */

/**
 * REQ-STARTUP-121 / ADR-0055: the successor is started "on the sentinel branch that already exists" — a reserved token
 * first on the command line, marking a launch the product itself started rather than a user's. OQ-43 covers the
 * sentinel's composition with the single-instance gate for this case as for the other two. Electron refuses a
 * scheme-looking positional followed by another positional (measured for `builtin:code-intelligence`, `sentinel.ts`),
 * so the predecessor's endpoint follows a `--`, which the reader drops.
 */
export const UPDATE_SUCCESSOR_TOKEN = 'builtin:update-successor';

export function successorArguments(predecessorEndpoint: string): string[] {
  return [UPDATE_SUCCESSOR_TOKEN, '--', predecessorEndpoint];
}

/** The predecessor's endpoint a successor launch carries, or null for every other launch. */
export function successorEndpointFromArgv(argv: readonly string[], tokenAt: number): string | null {
  if (argv[tokenAt] !== UPDATE_SUCCESSOR_TOKEN) return null;
  const rest = argv.slice(tokenAt + 1);
  if (rest[0] === '--') rest.shift();
  const endpoint = rest[0];
  return endpoint === undefined || endpoint === '' ? null : endpoint;
}

/**
 * REQ-STARTUP-106 / REQ-STARTUP-016: the installer's own registry record, `InstallDir` under `HKCU\Software\Rotaris`,
 * read once through `reg.exe` — the one Windows-specific code path ADR-0054 names as unavoidable. Absent, unreadable
 * or not on Windows is null, which the classification reads as "not installed".
 */
async function readInstallDir(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  return new Promise((resolve) => {
    let out = '';
    const child = spawn('reg.exe', ['query', 'HKCU\\Software\\Rotaris', '/v', 'InstallDir'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { out += chunk; });
    child.once('error', () => resolve(null));
    child.once('close', (code) => resolve(code === 0 ? parseInstallDir(out) : null));
  });
}

/**
 * The installation this process runs from, classified once (REQ-STARTUP-106: stable across launches, no user input).
 * `artifact` is what main took out of its environment at its first statement (`takeArtifactVariables`), before any
 * child was started — never `process.env`, which no longer carries either variable by the time this runs.
 */
export async function classifyThisInstallation(artifact: ArtifactVariables): Promise<Classification> {
  const packaged = app.isPackaged;
  const installDir = packaged ? await readInstallDir() : null;
  return classifyInstallation({ platform: process.platform, packaged, execPath: process.execPath, env: artifact, installDir });
}

/**
 * UD-1 (PD-STARTUP-008, R-117): whether the platform reports the connection as metered. Linux asks NetworkManager over the
 * system bus with `gdbus`, bounded by `METERED_QUERY_TIMEOUT_MS` (Node's own `timeout` ends the child); no `gdbus`, no
 * NetworkManager, a timeout or an answer this build does not recognise is `unknown`, which the updater reads as not metered.
 * Windows answers `unknown` for now: its connection cost is a WinRT API (`NetworkInformation`'s `ConnectionCost`) Electron
 * does not expose, and reaching it from main is its own piece of work; macOS publishes no release (IC-3). Measured on the
 * Linux agent host, 2026-11-21: `(<uint32 4>,)`, guess-no, in a few milliseconds.
 */
export function readConnectionCost(): Promise<ConnectionCost> {
  if (process.platform !== 'linux') return Promise.resolve('unknown');
  return new Promise((resolve) => {
    try {
      execFile('gdbus', [...NM_METERED_ARGS], { timeout: METERED_QUERY_TIMEOUT_MS, windowsHide: true, encoding: 'utf8' }, (error, stdout) => {
        resolve(error ? 'unknown' : parseNetworkManagerMetered(stdout));
      });
    } catch {
      resolve('unknown');
    }
  });
}

export interface UpdaterPorts {
  readonly network: UpdateNetwork;
  readonly updates: UpdatesArea;
  readonly files: StrategyFiles;
  readonly spawn: StrategySpawn;
  readonly handOffRecord: HandOffRecordFile;
}

/** `updatesDir` is `dataLayout`'s `updates`, under the per-user data directory (REQ-STARTUP-145), never the temporary one. */
export function createUpdaterPorts(updatesDir: string): UpdaterPorts {
  const handOffFile = join(updatesDir, LEGACY_HANDOFF_RECORD_NAME);
  return {
    network: {
      /**
       * Chromium's network stack (`net.fetch`) rather than Node's: the system proxy and the operating system's
       * certificate store apply, as they do to every other request a desktop application makes, and redirects are
       * followed (REQ-STARTUP-105: asset URLs answer 302 to a storage host). The caller's timeout and abort signals are
       * combined; the check's is 10.0 s (REQ-STARTUP-105).
       */
      get: async (url, options) => {
        const signals: AbortSignal[] = [];
        if (options.signal !== undefined) signals.push(options.signal);
        if (options.timeoutMs !== undefined) signals.push(AbortSignal.timeout(options.timeoutMs));
        const response = await net.fetch(url, {
          method: 'GET',
          redirect: 'follow',
          headers: options.accept === undefined ? {} : { Accept: options.accept },
          ...(signals.length === 0 ? {} : { signal: AbortSignal.any(signals) }),
        });
        const body = response.body;
        const result: NetworkResponse = {
          status: response.status,
          body: body === null ? (async function* () { /* no body */ })() : body,
        };
        return result;
      },
    },
    /**
     * REQ-STARTUP-171: the pending update and the download in flight, under `<data>/updates/` and never the platform's
     * temporary directory (PD-STARTUP-008, narrowing REQ-STARTUP-122's fresh `rotaris-update-` directory). Every write that
     * a later step relies on reaches the medium before it resolves: `writeFile` and the partial's sink are flushed
     * (`flush: true`, fsync before close), and `flushDirectory` is `flush.ts`'s.
     */
    updates: {
      root: updatesDir,
      join: (dir, name) => join(dir, name),
      list: (dir) => fsp.readdir(dir).catch((cause: NodeJS.ErrnoException) => { if (cause.code === 'ENOENT') return []; throw cause; }),
      makeDirectory: async (dir) => { await fsp.mkdir(dir, { recursive: true }); },
      readFile: (path) => fsp.readFile(path).catch((cause: NodeJS.ErrnoException) => { if (cause.code === 'ENOENT') return null; throw cause; }),
      readStream: (path) => createReadStream(path),
      fileSize: async (path) => {
        try {
          const stat = await fsp.stat(path);
          return stat.isFile() ? stat.size : null;
        } catch {
          return null;
        }
      },
      writeFile: (path, bytes) => fsp.writeFile(path, bytes, { flush: true }),
      open: async (path) => {
        // Exclusive: the caller removed an earlier attempt's partial first, so a file here is not this attempt's.
        const stream = createWriteStream(path, { flags: 'wx', flush: true });
        await new Promise<void>((resolve, reject) => { stream.once('open', () => resolve()); stream.once('error', reject); });
        const sink: DownloadSink & { close(): Promise<void> } = {
          write: (chunk) => new Promise<void>((resolve, reject) => { stream.write(chunk, (error) => (error ? reject(error) : resolve())); }),
          close: () => new Promise<void>((resolve, reject) => { stream.end((error?: Error | null) => (error ? reject(error) : resolve())); }),
        };
        return sink;
      },
      rename: (from, to) => fsp.rename(from, to),
      flushDirectory: (dir) => flushDirectory(dir),
      removeFile: (path) => fsp.rm(path, { force: true }),
      removeDirectory: (dir) => fsp.rm(dir, { recursive: true, force: true }),
    },
    files: {
      pathKind: async (path) => {
        try {
          const stat = await fsp.stat(path);
          return stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'absent';
        } catch {
          return 'absent';
        }
      },
      // Overwriting: `<name>.update` is the updater's own name beside the artifact, so a file already there is the
      // leftover of an earlier interrupted attempt, and `applyPortable` removes a partial one when the copy fails.
      // Nothing of the installation is touched by it (REQ-STARTUP-126).
      copyFile: (from, to) => fsp.copyFile(from, to),
      // REQ-STARTUP-176: the target copied to `<name>.old` beside it, the target itself left in place; exclusive, so a
      // file that appeared there since `applyPortable` removed the previous backup is refused, never replaced.
      copyAside: (from, to) => fsp.copyFile(from, to, fsConstants.COPYFILE_EXCL),
      // REQ-STARTUP-176's power loss: fsync(2) of the file and of its directory on POSIX, measured on the Linux agent host;
      // `FlushFileBuffers` for the file and nothing for the directory on Windows, not measured there (`flush.ts`).
      flushFile: (path) => flushFile(path),
      flushDirectory: (dir) => flushDirectory(dir),
      // Node's rename overwrites an existing `to` (its documentation; on Windows libuv's MoveFileExW with
      // MOVEFILE_REPLACE_EXISTING): onto the existing target, one step. Not yet measured on a Windows host.
      rename: (from, to) => fsp.rename(from, to),
      removeFile: (path) => fsp.rm(path, { force: true }),
      // REQ-STARTUP-125's AppImage clause: the placed file is left with mode 0755.
      makeExecutable: (path) => fsp.chmod(path, 0o755),
    },
    spawn: {
      // REQ-STARTUP-125: a process that survives this application exiting; the installer shows its own window.
      spawnDetached: (executable, args) => new Promise<void>((resolve, reject) => {
        const child = spawn(executable, [...args], { detached: true, stdio: 'ignore', windowsHide: false });
        child.once('error', reject);
        child.once('spawn', () => { child.unref(); resolve(); });
      }),
    },
    // The installer hand-off record an earlier build wrote (`removeHandedOffStaging`); nothing writes it any more.
    handOffRecord: {
      read: () => fsp.readFile(handOffFile, 'utf8').catch(() => null),
      clear: () => fsp.rm(handOffFile, { force: true }),
    },
  };
}
