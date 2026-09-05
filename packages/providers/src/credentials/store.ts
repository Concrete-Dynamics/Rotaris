import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, renameSync, rmSync, writeSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { err, failure, ok, type Failure, type Result } from '@rotaris/kernel';
import { guardedRead } from '@rotaris/platform';
import type { Protector } from './protect.js';
import { withLock, type LockDeps } from './lock.js';

/**
 * ADR-0029 — credentials are individual protected files: `<data>/tokens/<provider_id>.json`
 * (REQ-PROVIDER-014; the reserved name `credentials` in `platform/dirs.ts` was the wrong one and is
 * corrected beside its reason), five keys with two-space indentation (017), atomic writes staged as
 * `<id><random>.tmp` inside the directory and protected before a byte is written (018, 016), the lock of
 * 152 around every save and delete. Status is computed from the stored credential and the clock alone
 * (010/011/059) and cached nowhere. The directory holds nothing but `<id>.json` files once any operation
 * has finished — the lock file is adjacent per 152 and read together with 018 (OQ-19).
 */
export interface StoredCredential {
  readonly access_token: string;
  readonly refresh_token: string;
  /** Unix seconds; 0 means no expiry (API keys never expire). */
  readonly expires_at: number;
  readonly account_id: string | null;
  readonly extra: Readonly<Record<string, string>>;
}

export const CREDENTIAL_STATUSES = ['authenticated', 'unauthenticated', 'expired', 'refreshing'] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

/** REQ-PROVIDER-010/011: `refreshing` is in the vocabulary and never returned. */
export function credentialStatus(c: StoredCredential | null, nowUnixSeconds: number): CredentialStatus {
  if (c === null || c.access_token.length === 0) return 'unauthenticated';
  if (c.expires_at !== 0 && nowUnixSeconds >= c.expires_at) return 'expired';
  return 'authenticated';
}

/** REQ-PROVIDER-062: pure ASCII, no control characters. */
export const KEY_NOT_ASCII = 'API key must contain ASCII characters only. Re-enter its exact value.';
export const KEY_CONTROL = 'API key must not contain control characters. Re-enter its exact value.';
export function headerValidKey(key: string): Result<string, string> {
  const k = key.trim();
  for (const ch of k) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 0x7f) return err(KEY_NOT_ASCII);
  }
  for (const ch of k) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return err(KEY_CONTROL);
  }
  return ok(k);
}

const ID_SHAPE = /^[a-z0-9][a-z0-9-]*$/;

/** REQ-PROVIDER-017: tolerant of a missing expiry, account id or extras; anything else is no credential. */
export function decodeCredential(raw: string): StoredCredential {
  const v = JSON.parse(raw) as Record<string, unknown>;
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
  if (typeof v['access_token'] !== 'string' || typeof v['refresh_token'] !== 'string') throw new Error('access_token and refresh_token are required strings');
  const expires = v['expires_at'];
  const expiresAt = expires === undefined ? 0 : typeof expires === 'number' && Number.isFinite(expires) ? expires : NaN;
  if (Number.isNaN(expiresAt)) throw new Error('expires_at must be a number');
  const account = v['account_id'];
  if (account !== undefined && account !== null && typeof account !== 'string') throw new Error('account_id must be a string or null');
  const extra: Record<string, string> = {};
  const rawExtra = v['extra'];
  if (rawExtra !== undefined && rawExtra !== null) {
    if (typeof rawExtra !== 'object' || Array.isArray(rawExtra)) throw new Error('extra must be an object');
    for (const [k, val] of Object.entries(rawExtra as Record<string, unknown>)) {
      if (typeof val !== 'string') throw new Error(`extra.${k} must be a string`);
      extra[k] = val;
    }
  }
  return { access_token: v['access_token'], refresh_token: v['refresh_token'], expires_at: expiresAt, account_id: typeof account === 'string' ? account : null, extra };
}

export function encodeCredential(c: StoredCredential): string {
  return `${JSON.stringify({ access_token: c.access_token, refresh_token: c.refresh_token, expires_at: c.expires_at, account_id: c.account_id, extra: { ...c.extra } }, null, 2)}\n`;
}

export interface CredentialStoreDeps {
  /** `<data>/tokens`. */
  readonly dir: string;
  readonly protector: Protector;
  readonly lock: LockDeps;
  readonly random: () => string;
  readonly warn: (message: string) => void;
  readonly info: (message: string) => void;
}

export class CredentialStore {
  constructor(private readonly deps: CredentialStoreDeps) {}

  get directory(): string { return this.deps.dir; }

  fileFor(id: string): string { return join(this.deps.dir, `${id}.json`); }
  lockFor(id: string): string { return join(this.deps.dir, `${id}.lock`); }

  private validId(id: string): Result<string, Failure> {
    return ID_SHAPE.test(id) ? ok(id) : err(failure('credential.id', `'${id}' is not a provider identifier`));
  }

  /** REQ-PROVIDER-019: a pure existence test. */
  exists(id: string): boolean { return ID_SHAPE.test(id) && existsSync(this.fileFor(id)); }

  /** REQ-PROVIDER-019: sorted basenames of `*.json`. */
  list(): string[] {
    try {
      return readdirSync(this.deps.dir).filter((f) => f.endsWith('.json')).map((f) => basename(f, '.json')).sort();
    } catch {
      return [];
    }
  }

  /** REQ-PROVIDER-017: a corrupt or key-missing file warns naming the id only and is no credential. ADR-0004 rule 1: open-read-close. */
  load(id: string): StoredCredential | null {
    if (!ID_SHAPE.test(id)) return null;
    const r = guardedRead(this.fileFor(id), decodeCredential);
    if (r.state === 'readable') return r.value;
    if (r.state === 'unreadable') this.deps.warn(`The stored credential for ${id} could not be read and is treated as absent`);
    return null;
  }

  /** REQ-PROVIDER-016/018: the directory and the staged file protected before content is written; failure leaves the previous file. */
  async save(id: string, credential: StoredCredential): Promise<Result<void, Failure>> {
    const v = this.validId(id);
    if (!v.ok) return v;
    const dirReady = await this.ensureDirectory();
    if (!dirReady.ok) return dirReady;
    return withLock(this.lockFor(id), this.deps.lock, async () => {
      const target = this.fileFor(id);
      const staged = join(this.deps.dir, `${id}${this.deps.random()}.tmp`);
      try {
        const fd = openSync(staged, 'w');
        closeSync(fd);
        const protectedTmp = await this.deps.protector.protect(staged, 'file');
        if (!protectedTmp.ok) {
          rmSync(staged, { force: true });
          return err(failure('credential.protect', `No credential was stored: the credential store at ${this.deps.dir} could not be protected`, protectedTmp.error.detail ?? protectedTmp.error.headline));
        }
        const fd2 = openSync(staged, 'w');
        try {
          writeSync(fd2, encodeCredential(credential));
          fsyncSync(fd2);
        } finally {
          closeSync(fd2);
        }
        renameSync(staged, target);
        return ok(undefined);
      } catch (cause) {
        rmSync(staged, { force: true });
        return err(failure('credential.write', `No credential was stored: the credential store at ${this.deps.dir} could not be written`, String(cause), cause));
      }
    });
  }

  /** REQ-PROVIDER-019: removes the file if present; logs the deletion. */
  async delete(id: string): Promise<Result<{ removed: boolean }, Failure>> {
    const v = this.validId(id);
    if (!v.ok) return v;
    if (!existsSync(this.deps.dir)) return ok({ removed: false });
    return withLock<{ removed: boolean }>(this.lockFor(id), this.deps.lock, async () => {
      const target = this.fileFor(id);
      if (!existsSync(target)) return ok({ removed: false });
      try {
        rmSync(target, { force: true });
        this.deps.info(`Deleted stored tokens for ${id}`);
        return ok({ removed: true });
      } catch (cause) {
        return err(failure('credential.delete', `The stored credential for ${id} could not be deleted`, String(cause), cause));
      }
    });
  }

  /** The directory: created with its protection, verified by read-back on every save (REQ-PROVIDER-016). */
  async ensureDirectory(): Promise<Result<void, Failure>> {
    try {
      mkdirSync(this.deps.dir, { recursive: true });
    } catch (cause) {
      return err(failure('credential.dir', `No credential was stored: the credential store at ${this.deps.dir} could not be created`, String(cause), cause));
    }
    const r = await this.deps.protector.protect(this.deps.dir, 'directory');
    return r.ok ? ok(undefined) : err(failure('credential.protect', `No credential was stored: the credential store at ${this.deps.dir} could not be protected`, r.error.detail ?? r.error.headline));
  }

  /** REQ-PROVIDER-018's post-condition, exposed for the test: what the directory holds besides `<id>.json`. */
  strayEntries(): string[] {
    try {
      return readdirSync(this.deps.dir).filter((f) => !f.endsWith('.json'));
    } catch {
      return [];
    }
  }
}

/** `<data>/tokens` (REQ-PROVIDER-014); the scratch for the protector's read-back is the data directory itself. */
export function tokensDirectory(dataDir: string): { dir: string; scratch: string } {
  return { dir: join(dataDir, 'tokens'), scratch: dataDir };
}
export function parentOf(path: string): string { return dirname(path); }
