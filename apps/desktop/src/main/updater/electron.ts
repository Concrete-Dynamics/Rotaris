import { spawn } from 'node:child_process';
import { constants as fsConstants, createWriteStream, promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, net } from 'electron';
import type { DownloadSink } from './download.js';
import { classifyInstallation, parseInstallDir, type Classification } from './classify.js';
import type { NetworkResponse, StagingArea, UpdateNetwork } from './install.js';
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

/** The installation this process runs from, classified once (REQ-STARTUP-106: stable across launches, no user input). */
export async function classifyThisInstallation(): Promise<Classification> {
  const packaged = app.isPackaged;
  const installDir = packaged ? await readInstallDir() : null;
  return classifyInstallation({ platform: process.platform, packaged, execPath: process.execPath, env: process.env, installDir });
}

export interface UpdaterPorts {
  readonly network: UpdateNetwork;
  readonly staging: StagingArea;
  readonly files: StrategyFiles;
  readonly spawn: StrategySpawn;
}

export function createUpdaterPorts(): UpdaterPorts {
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
          body: body === null ? (async function* () { /* no body */ })() : (body as unknown as AsyncIterable<Uint8Array>),
        };
        return result;
      },
    },
    staging: {
      // REQ-STARTUP-122: a fresh temporary directory whose name is prefixed `rotaris-update-`.
      create: () => fsp.mkdtemp(join(tmpdir(), 'rotaris-update-')),
      join: (dir, name) => join(dir, name),
      open: async (path) => {
        const stream = createWriteStream(path, { flags: 'wx' });
        await new Promise<void>((resolve, reject) => { stream.once('open', () => resolve()); stream.once('error', reject); });
        const sink: DownloadSink & { close(): Promise<void> } = {
          write: (chunk) => new Promise<void>((resolve, reject) => { stream.write(chunk, (error) => (error ? reject(error) : resolve())); }),
          close: () => new Promise<void>((resolve, reject) => { stream.end((error?: Error | null) => (error ? reject(error) : resolve())); }),
        };
        return sink;
      },
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
      // Exclusive: a sibling that already exists is somebody else's file, never overwritten (REQ-STARTUP-126).
      copyFile: (from, to) => fsp.copyFile(from, to, fsConstants.COPYFILE_EXCL),
      rename: (from, to) => fsp.rename(from, to),
      removeFile: (path) => fsp.rm(path, { force: true }),
    },
    spawn: {
      // REQ-STARTUP-125: a process that survives this application exiting; the installer shows its own window.
      spawnDetached: (executable, args) => new Promise<void>((resolve, reject) => {
        const child = spawn(executable, [...args], { detached: true, stdio: 'ignore', windowsHide: false });
        child.once('error', reject);
        child.once('spawn', () => { child.unref(); resolve(); });
      }),
    },
  };
}
