import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { err, failure, ok, REDACTION_MARK, type Failure, type Result } from '@rotaris/kernel';
import { guardedRead, replaceDocument, type Protector } from '@rotaris/platform';

/**
 * PD-CONFIG-010 — the dictation endpoint's bearer: one protected file, `<data>/dictation/credential.json`, in its own
 * directory **beside** the credential store and never within it. That is REQ-PROVIDER-063's shape for a bearer token that
 * is not a provider credential, and for the reason it states there: a bearer token must not sit where a file-synchronising
 * client reaches it, and the per-user data directory REQ-STARTUP-145 fixes is local to this machine.
 *
 * The write is ADR-0004's `replaceDocument` with REQ-PROVIDER-016's protection, so the staged file is created at
 * `STAGED_FILE_MODE`, protected and read back BEFORE a byte of content is written, and the protection travels with the
 * rename; a refusal leaves the previous file and reports it. The directory is created and protected the same way, because
 * `replaceDocument`'s `createParent` would leave it at the umask's mode.
 *
 * The value is never logged, never returned to a surface, and never written to a configuration file. What a surface may
 * show of it is `maskedBearer`'s answer alone (REQ-TOOLS-171's one mask, which REQ-MCP-081 applies to a stored secret).
 */
export const DICTATION_CREDENTIAL_FILE = 'credential.json';

export interface DictationCredentialDeps {
  /** `<data>/dictation` (PD-CONFIG-010). */
  readonly dir: string;
  readonly protector: Protector;
  readonly warn: (message: string) => void;
}

export function dictationCredentialFile(deps: Pick<DictationCredentialDeps, 'dir'>): string {
  return join(deps.dir, DICTATION_CREDENTIAL_FILE);
}

/** REQ-PROVIDER-017's tolerance, for this file: anything that is not a non-empty bearer is no credential. */
export function decodeDictationCredential(raw: string): string {
  const v = JSON.parse(raw) as Record<string, unknown>;
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
  const bearer = v['bearer'];
  if (typeof bearer !== 'string' || bearer.length === 0) throw new Error('bearer must be a non-empty string');
  return bearer;
}

export function encodeDictationCredential(bearer: string): string {
  return `${JSON.stringify({ bearer }, null, 2)}\n`;
}

/** The stored bearer, or null. A file that cannot be read or does not parse warns naming no value and is treated as absent. */
export function readDictationCredential(deps: DictationCredentialDeps): string | null {
  const r = guardedRead(dictationCredentialFile(deps), decodeDictationCredential);
  if (r.state === 'readable') return r.value;
  if (r.state === 'unreadable') deps.warn('The stored dictation credential could not be read and is treated as absent');
  return null;
}

/** REQ-PROVIDER-016: the directory at `0700` (or the equivalent ACL), established before the file is staged into it. */
async function ensureDirectory(deps: DictationCredentialDeps): Promise<Result<void, Failure>> {
  try {
    mkdirSync(deps.dir, { recursive: true });
  } catch (cause) {
    return err(failure('dictation.credential-dir', `No dictation credential was stored: the directory at ${deps.dir} could not be created`, String(cause), cause));
  }
  const r = await deps.protector.protect(deps.dir, 'directory');
  return r.ok ? ok(undefined) : err(failure('dictation.credential-protect', `No dictation credential was stored: the directory at ${deps.dir} could not be protected`, r.error.detail ?? r.error.headline, r.error));
}

/** Stores (or replaces) the bearer. A refusal writes nothing and leaves the previous file in place. */
export async function writeDictationCredential(deps: DictationCredentialDeps, bearer: string): Promise<Result<void, Failure>> {
  const dirReady = await ensureDirectory(deps);
  if (!dirReady.ok) return dirReady;
  const r = await replaceDocument(dictationCredentialFile(deps), encodeDictationCredential(bearer), { protector: deps.protector });
  return r.ok ? ok(undefined) : err(r.error);
}

/** Removes the file if present; a file that is not there is not an error. */
export async function clearDictationCredential(deps: DictationCredentialDeps): Promise<Result<{ removed: boolean }, Failure>> {
  const file = dictationCredentialFile(deps);
  if (!existsSync(file)) return ok({ removed: false });
  try {
    rmSync(file, { force: true });
    return ok({ removed: true });
  } catch (cause) {
    return err(failure('dictation.credential-delete', 'The stored dictation credential could not be removed', String(cause), cause));
  }
}

/**
 * What a surface may show of a stored bearer, and never the bearer: REQ-TOOLS-171's one stored-secret display mask, which
 * REQ-MCP-081 applies to a stored secret and which carries no character of the value and no indication of its length. This
 * file holds no second definition of it.
 */
export function maskedBearer(bearer: string | null): string | null {
  return bearer === null ? null : REDACTION_MARK;
}
