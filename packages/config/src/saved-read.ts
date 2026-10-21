import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Result } from '@rotaris/kernel';
import { loadConfiguration, scopeFiles, type LoadedConfiguration } from './load.js';
import { PROJECT_SETTINGS_FILE } from './project-settings.js';
import type { FatalLoadReport } from './validate.js';

/**
 * What a reader of the SAVED configuration takes: the whole load less the tool servers' resolution. That resolution
 * asks PATH whether each server's command exists (REQ-MCP-037), which no file records and no fingerprint below covers,
 * so a kept answer would hold an availability PATH may since have changed. A reader that needs the servers loads afresh.
 */
export type SavedConfiguration = Omit<LoadedConfiguration, 'mcp' | 'mcpInputs'>;

export interface SavedReadOptions {
  readonly globalDir: string;
  readonly workspaceRoot: string;
  /** ADR-0006: the caller's monotonic clock, for `loadMs`; null without one. */
  readonly now?: () => number;
  /** The environment the discovery locations and `${env:VAR}` read; `process.env` by default. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/**
 * REQ-SANDBOX-038 / REQ-SANDBOX-118: the configuration as the files on disk state it NOW, read for a caller that asks again
 * and again (the `fetch` tool's egress policy at each call, the requirements queue at each claim). A load is about a
 * dozen file opens and the PATH lookups of the shipped servers; what it reads rarely changes between two calls. So the
 * answer — a fatal report included — is kept per global directory and workspace, beside a fingerprint of every input
 * it was computed from: each file the load opened or looked for (modification time, size, file id; absent is recorded
 * too) and the environment. A later read takes one `stat` of each and returns the kept answer only when all are
 * unchanged; otherwise it loads again. A saved edit therefore still reaches the very next read.
 *
 * An answer is not kept when a fingerprint differs before and after the load (a file changed while it was read), nor
 * when any file's time has no fraction of a millisecond, where a filesystem's coarse clock could hide a second write in
 * the same tick (the rule `findExecutable`'s listings follow). The load never writes here (REQ-CONFIG-013's ignore
 * lines are the run start's), and the tool servers are left out (`SavedConfiguration`).
 */
export function readSavedConfiguration(opts: SavedReadOptions): Result<SavedConfiguration, FatalLoadReport> {
  const started = opts.now?.() ?? null;
  const env = opts.env ?? process.env;
  const key = `${resolve(opts.globalDir)}\u0000${resolve(opts.workspaceRoot)}`;
  const environment = environmentPrint(env);
  const kept = answers.get(key);
  if (kept !== undefined && kept.environment === environment && kept.files.every((f) => fingerprint(f.path) === f.print)) {
    answers.delete(key);
    answers.set(key, kept);
    return withLoadMs(kept.answer, started, opts.now);
  }
  answers.delete(key);
  // Each input's fingerprint is taken BEFORE it is read, so a write landing after the read shows as a change below.
  const before = new Map(fixedInputs(opts.globalDir, opts.workspaceRoot).map((p) => [p, fingerprint(p)]));
  const loaded = loadConfiguration({
    globalDir: opts.globalDir, workspaceRoot: opts.workspaceRoot, keepIgnored: false, env,
    // The servers' resolution is dropped from the answer, so its PATH lookups are not paid for.
    onPath: () => true,
    // Every file the discovery and secrets stages read passes through here (REQ-MCP-027's read-only reader), the envFiles a discovery file names among them.
    readFile: (path) => {
      if (!before.has(path)) before.set(path, fingerprint(path));
      return readIfPresent(path);
    },
  });
  const answer: Result<SavedConfiguration, FatalLoadReport> = loaded.ok ? { ok: true, value: withoutServers(loaded.value) } : loaded;
  const files: { path: string; print: string }[] = [];
  let steady = environmentPrint(env) === environment;
  for (const [path, print] of before) {
    if (print === null || fingerprint(path) !== print) { steady = false; break; }
    files.push({ path, print });
  }
  if (steady) {
    answers.set(key, { environment, files, answer });
    if (answers.size > KEPT_WORKSPACES) answers.delete(answers.keys().next().value!);
  }
  return withLoadMs(answer, started, opts.now);
}

/** The files a load looks for whatever they say: both scopes' two files and the discovery snapshot. */
function fixedInputs(globalDir: string, workspaceRoot: string): string[] {
  const files = scopeFiles(globalDir, workspaceRoot);
  return [files.global.agents, files.global.models, files.workspace.agents, files.workspace.models, join(globalDir, PROJECT_SETTINGS_FILE)];
}

/** A file's identity and contents' proxy, `absent` when nothing is there; null when the time is too coarse to trust. */
function fingerprint(path: string): string | null {
  try {
    const s = statSync(path, { bigint: true, throwIfNoEntry: false });
    if (s === undefined) return 'absent';
    const mtime = String(s.mtimeNs);
    return mtime.endsWith('000000') ? null : `${mtime}:${s.size}:${s.ino}:${s.isFile() ? 'f' : 'o'}`;
  } catch {
    return null;
  }
}

function environmentPrint(env: Readonly<Record<string, string | undefined>>): string {
  return JSON.stringify(Object.entries(env));
}

function readIfPresent(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw cause;
  }
}

function withoutServers(cfg: LoadedConfiguration): SavedConfiguration {
  const { mcp: _mcp, mcpInputs: _inputs, ...rest } = cfg;
  return rest;
}

function withLoadMs(answer: Result<SavedConfiguration, FatalLoadReport>, started: number | null, now: (() => number) | undefined): Result<SavedConfiguration, FatalLoadReport> {
  if (!answer.ok) return answer;
  return { ok: true, value: { ...answer.value, loadMs: started === null || !now ? null : now() - started } };
}

const KEPT_WORKSPACES = 16;
const answers = new Map<string, { readonly environment: string; readonly files: readonly { readonly path: string; readonly print: string }[]; readonly answer: Result<SavedConfiguration, FatalLoadReport> }>();
