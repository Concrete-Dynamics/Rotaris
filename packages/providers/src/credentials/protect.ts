import { chmodSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { err, failure, ok, type Failure, type Result } from '@rotaris/kernel';
import { spawnChild } from '@rotaris/platform';

/**
 * REQ-PROVIDER-016 — the protection adapter (ADR-0029): applied explicitly on every platform and never
 * inherited, and READ BACK, because "no group or other bit is ever set" and "to no one else" are
 * observables. Failure anywhere aborts the caller's write before the target is touched.
 *
 * Windows, as the spike settled (`spikes/credential-protection.md`): `icacls /reset` (one call — it takes
 * no companion), then `/inheritance:r /grant:r` for the system account and the owner by SID literal, then
 * `/save` and parse the SDDL for exactly `D:P…` and two allow ACEs with full access for exactly those two
 * trustees. `/grant:r` alone leaves a foreign explicit ACE in place; `/restore` needs a privilege the
 * unelevated product lacks. POSIX: `chmod` then `stat`.
 */
export type ProtectKind = 'directory' | 'file';

export interface Protector {
  /** Apply and read back; ok only when the read-back is exact. */
  protect(path: string, kind: ProtectKind): Promise<Result<void, Failure>>;
}

export interface ExecResult { readonly status: number | null; readonly stdout: string; readonly stderr: string }
export type Exec = (command: string, args: readonly string[]) => Promise<ExecResult>;

export const SYSTEM_SID = 'S-1-5-18';
const ICACLS = 'icacls.exe';
const WHOAMI = 'whoami.exe';

function systemTool(name: string, env: Readonly<Record<string, string | undefined>>): string {
  const root = env['SystemRoot'] ?? env['SYSTEMROOT'] ?? 'C:\\Windows';
  return join(root, 'System32', name);
}

/** Run a system tool with no window, collecting both streams. */
export function spawnExec(env: Readonly<Record<string, string | undefined>>): Exec {
  return (command, args) => new Promise((resolve) => {
    const child = spawnChild({ command, args, env: Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => typeof e[1] === 'string')), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (c: string) => { stdout += c; });
    child.stderr?.on('data', (c: string) => { stderr += c; });
    child.on('error', (e) => resolve({ status: null, stdout, stderr: `${stderr}${String(e)}` }));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

export interface DaclAce { readonly type: string; readonly flags: string; readonly rights: string; readonly sid: string }
export interface Dacl { readonly protected: boolean; readonly aces: readonly DaclAce[] }

/** The DACL part of an SDDL string; `null` when none is present. */
export function parseDacl(sddl: string): Dacl | null {
  const m = /D:([A-Z]*)((?:\([^)]*\))*)/.exec(sddl);
  if (!m) return null;
  const flags = m[1] ?? '';
  const aces = [...(m[2] ?? '').matchAll(/\(([^)]*)\)/g)].map((a) => {
    const f = (a[1] ?? '').split(';');
    return { type: f[0] ?? '', flags: f[1] ?? '', rights: f[2] ?? '', sid: f[5] ?? '' };
  });
  return { protected: flags.includes('P'), aces };
}

/**
 * An ACE's trustee as a SID. SDDL writes a few well-known accounts as two-letter aliases: SYSTEM as `SY`, and the
 * machine's built-in Administrator and Guest (relative identifiers 500 and 501) as `LA` and `LG` — so on that account
 * the owner's own entry reads back as `LA`, never as its SID, and every save was refused
 * (docs/defects/fixed/on-the-built-in-administrator-account-every-credential-save-is-refused-at-the-read-back.md).
 * An alias is read as the owner only when the owner's SID carries that relative identifier. A domain account with
 * identifier 500 is written as its SID, not `LA`, so for it an `LA` entry (the machine's Administrator) is read as the
 * owner too: the one reading the alias leaves open, and an account that can take ownership of the file regardless.
 */
function trusteeSid(sid: string, ownerSid: string): string {
  if (sid === 'SY') return SYSTEM_SID;
  if ((sid === 'LA' && /^S-1-5-21-\d+-\d+-\d+-500$/.test(ownerSid)) || (sid === 'LG' && /^S-1-5-21-\d+-\d+-\d+-501$/.test(ownerSid))) return ownerSid;
  return sid;
}

/** REQ-PROVIDER-016's exact check: protected, two allow ACEs, full access, the two trustees, nothing inherited. */
export function isExactDacl(dacl: Dacl | null, ownerSid: string): string | null {
  if (!dacl) return 'no DACL could be read back';
  if (!dacl.protected) return 'inheritance from the parent is not disabled';
  if (dacl.aces.length !== 2) return `expected exactly two access-control entries, found ${dacl.aces.length}`;
  const trustees = new Set<string>();
  for (const a of dacl.aces) {
    if (a.type !== 'A') return `an entry is not an allow entry (${a.type})`;
    if (a.rights !== 'FA') return `an entry grants ${a.rights || 'nothing'} rather than full control`;
    if (/ID/.test(a.flags)) return 'an inherited entry survived';
    trustees.add(trusteeSid(a.sid, ownerSid));
  }
  if (!trustees.has(SYSTEM_SID) || !trustees.has(ownerSid)) return `the trustees are ${[...trustees].join(', ')}`;
  return null;
}

export interface WindowsProtectorDeps {
  readonly exec: Exec;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Where the `/save` file is staged: never the credential directory (REQ-PROVIDER-018's contents rule). */
  readonly scratchDir: string;
  readonly random: () => string;
}

export function windowsProtector(deps: WindowsProtectorDeps): Protector {
  const icacls = systemTool(ICACLS, deps.env);
  let owner: string | null = null;
  const ownerSid = async (): Promise<Result<string, Failure>> => {
    if (owner) return ok(owner);
    const r = await deps.exec(systemTool(WHOAMI, deps.env), ['/user', '/fo', 'csv', '/nh']);
    const m = /"(S-1-[0-9-]+)"/.exec(r.stdout);
    if (r.status !== 0 || !m || !m[1]) return err(failure('credential.protect', 'The owning account could not be identified', r.stderr.trim() || r.stdout.trim()));
    owner = m[1];
    return ok(owner);
  };
  const readBack = async (path: string): Promise<Result<string, Failure>> => {
    const save = join(deps.scratchDir, `.acl-${deps.random()}.txt`);
    try {
      const r = await deps.exec(icacls, [path, '/save', save]);
      if (r.status !== 0) return err(failure('credential.protect', 'The protection could not be read back', r.stderr.trim() || r.stdout.trim()));
      const text = readFileSync(save).toString('utf16le').replace(/^\uFEFF/, '');
      const line = text.split(/\r?\n/).filter((l) => l.length > 0)[1] ?? '';
      return ok(line);
    } catch (cause) {
      return err(failure('credential.protect', 'The protection could not be read back', String(cause), cause));
    } finally {
      rmSync(save, { force: true });
    }
  };
  return {
    async protect(path, kind) {
      const sid = await ownerSid();
      if (!sid.ok) return sid;
      const inherit = kind === 'directory' ? '(OI)(CI)F' : 'F';
      const reset = await deps.exec(icacls, [path, '/reset']);
      if (reset.status !== 0) return err(failure('credential.protect', `The protection could not be applied to ${path}`, reset.stderr.trim() || reset.stdout.trim()));
      const apply = await deps.exec(icacls, [path, '/inheritance:r', '/grant:r', `*${SYSTEM_SID}:${inherit}`, `*${sid.value}:${inherit}`]);
      if (apply.status !== 0) return err(failure('credential.protect', `The protection could not be applied to ${path}`, apply.stderr.trim() || apply.stdout.trim()));
      const sddl = await readBack(path);
      if (!sddl.ok) return sddl;
      const problem = isExactDacl(parseDacl(sddl.value), sid.value);
      return problem === null ? ok(undefined) : err(failure('credential.protect', `The protection read back from ${path} is not the one required`, problem));
    },
  };
}

/** POSIX: set the mode, then verify by reading it back — umask and filesystem behaviour vary. */
export function posixProtector(): Protector {
  return {
    async protect(path, kind) {
      const mode = kind === 'directory' ? 0o700 : 0o600;
      try {
        chmodSync(path, mode);
        const got = statSync(path).mode & 0o777;
        if (got !== mode) return err(failure('credential.protect', `The protection read back from ${path} is not the one required`, `mode ${got.toString(8)} rather than ${mode.toString(8)}`));
        return ok(undefined);
      } catch (cause) {
        return err(failure('credential.protect', `The protection could not be applied to ${path}`, String(cause), cause));
      }
    },
  };
}

export interface ProtectorOptions {
  readonly platform?: NodeJS.Platform;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly exec?: Exec;
  readonly scratchDir: string;
  readonly random?: () => string;
}

export function createProtector(opts: ProtectorOptions): Protector {
  const platform = opts.platform ?? process.platform;
  if (platform !== 'win32') return posixProtector();
  const env = opts.env ?? process.env;
  return windowsProtector({ exec: opts.exec ?? spawnExec(env), env, scratchDir: opts.scratchDir, random: opts.random ?? (() => Math.random().toString(36).slice(2, 10)) });
}
