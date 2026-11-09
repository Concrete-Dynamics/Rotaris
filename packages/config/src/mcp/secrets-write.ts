import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMap, type Document, type YAMLMap } from 'yaml';
import { err, ok, type Result } from '@rotaris/kernel';
import { createProtector, type Protector, replaceDocument, WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { parseConfig } from '../document.js';
import { CONFIG_WRITE_LADDER, type WriterDeps } from '../writers.js';
import { SECRETS_FILE, type SecretScope } from './environment.js';

/**
 * REQ-MCP-084 and REQ-MCP-110/111's write half — the side ADR-0034's part S left owed ("the settings surface reads
 * and masks only", `environment.ts`). One file per scope, shape `server → key → value` (REQ-MCP-082), written
 * atomically through ADR-0004's `replaceDocument` exactly as the sibling per-field writer does (`writers.ts`), with
 * REQ-CONFIG-216's protection rather than REQ-CONFIG-444's ordinary `0644`: `secrets.yaml` is the one file of the
 * configuration set that holds credentials by design (REQ-CONFIG-007), so it is protected by what it carries.
 *
 * The protection is the SAME mechanism REQ-CONFIG-216 cites — REQ-PROVIDER-016's adapter, one protection path for
 * this file and the credential store (slice-B rework round 1, 2026-11-09): the staged sibling is created empty, the
 * adapter PROTECTS IT AND READS THE PROTECTION BACK BEFORE A BYTE OF CONTENT IS WRITTEN, and only then is the content
 * written and renamed over the target — so the protection travels with the rename and no instant exists in which the
 * file's content is observable at a weaker protection (the ordering `credentials/store.ts` keeps; the adapter lives
 * in `packages/platform/src/protection.ts` because `config` may not import `providers` and both need the one).
 *
 * Three mutations, REQ-CONFIG-217's own list:
 *  - a set creates the server's sub-map when absent;
 *  - an unset reports whether anything was removed and writes NOTHING when the key was not there, and removing a
 *    server's last key removes the server entry entirely;
 *  - a clear reports the number of removed keys and writes NOTHING when none were removed.
 *
 * Refusals, each writing nothing (REQ-MCP-084, REQ-MCP-110): an empty server, an empty key and an empty value — a
 * value can neither be created empty nor cleared by one — and a target that cannot be read or does not parse to a
 * mapping. The last one is REQ-CONFIG-442's ground read for this file: a writer must never discard content it could
 * not parse, so the file is left exactly as it stands and the fault is reported. Everything the write did not touch —
 * every other server, every other key, every comment — is preserved (REQ-CONFIG-252's discipline).
 */

/**
 * REQ-CONFIG-216: every secrets write leaves the file at mode `0600` — established by REQ-PROVIDER-016's adapter on
 * the staged file before a byte is written and read back there (the primitive's `protector` option), rather than by a
 * post-rename chmod. This is deliberately NOT `CONFIG_FILE_MODE`'s `0644` (REQ-CONFIG-444): a different file,
 * protected by what it carries. The constant states the requirement's own number; the adapter applies it.
 */
export const SECRETS_FILE_MODE = 0o600;

export type SecretsWriteRefusal = {
  readonly code: 'unreadable' | 'not-a-mapping' | 'empty-server' | 'empty-key' | 'empty-value' | 'protection' | 'write-failed';
  readonly file: string;
  readonly fault: string;
};

export interface SecretMutationOutcome {
  readonly file: string;
  /** The document's text as written, or the file's own text when nothing was written. */
  readonly text: string;
  /** False when the mutation found nothing to change and wrote nothing (REQ-CONFIG-217). */
  readonly wrote: boolean;
  /** Keys removed: 0 from a set, 0 or 1 from an unset, the count from a clear (REQ-CONFIG-217, REQ-MCP-084). */
  readonly removed: number;
}

/**
 * REQ-MCP-082's two places, one function: `<globalDir>/secrets.yaml` for the global scope and
 * `<workspaceRoot>/.rotaris/secrets.yaml` for the workspace scope — the same `.rotaris` directory the scope's
 * `agents.yaml` sits in (`scopeFiles`), so the reader (`environment.ts`) and this writer agree by construction.
 */
export function secretsPathFor(scope: SecretScope, globalDir: string, workspaceRoot: string): string {
  return scope === 'global' ? join(globalDir, SECRETS_FILE) : join(workspaceRoot, WORKSPACE_SCOPE_DIR, SECRETS_FILE);
}

interface OpenedSecrets {
  readonly doc: Document.Parsed;
  /** The target's own bytes; null when it did not exist. The text a no-op mutation reports unchanged (REQ-CONFIG-217). */
  readonly text: string | null;
}

/** REQ-MCP-110's refusals, each naming the requirement unmet and writing nothing: no server, an empty key, an empty value. */
function refusalFor(file: string, server: string, key: string | null, value: string | null): SecretsWriteRefusal | null {
  if (server === '') return { code: 'empty-server', file, fault: 'no server was named; a write names the server it stores for (REQ-MCP-110)' };
  if (key === '') return { code: 'empty-key', file, fault: 'the key is empty; a key is required and nothing was written (REQ-MCP-084, REQ-MCP-110)' };
  if (value === '') return { code: 'empty-value', file, fault: 'the value is empty; a value is required and nothing was written (REQ-MCP-084, REQ-MCP-110)' };
  return null;
}

/**
 * Read and parse one scope's file, or answer why it cannot be written to. An absent file opens as an empty document
 * (the write creates it, REQ-CONFIG-216); undecodable bytes, a YAML error and a non-mapping top level refuse with the
 * file left exactly as it stands (REQ-CONFIG-442's ground, same codes as the sibling writer's `openDocument`).
 */
function openSecrets(file: string): Result<OpenedSecrets, SecretsWriteRefusal> {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      const empty = parseConfig('');
      return empty.ok ? ok({ doc: empty.value.doc, text: null }) : err({ code: 'unreadable', file, fault: empty.error.reason });
    }
    if (code === undefined) return err({ code: 'unreadable', file, fault: 'the file is not UTF-8 text' });
    return err({ code: 'unreadable', file, fault: String(cause) });
  }
  const parsed = parseConfig(text);
  if (!parsed.ok) return err({ code: 'unreadable', file, fault: `YAML syntax error: ${parsed.error.reason}` });
  if (parsed.value.root === null && parsed.value.topLevelType !== 'null') return err({ code: 'not-a-mapping', file, fault: `top-level content is a ${parsed.value.topLevelType}, not a mapping` });
  return ok({ doc: parsed.value.doc, text });
}

/** The document's top-level mapping, created empty when the file was absent or held nothing (the sibling `rootOf`). */
function rootOf(doc: Document.Parsed): YAMLMap {
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as never;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- tsc does not narrow `doc.contents` across the assignment above.
  return doc.contents as YAMLMap;
}

/** REQ-CONFIG-217: the server's sub-map, created when absent — REQ-CONFIG-257's discipline for a pre-existing non-mapping. */
function serverMapOf(doc: Document.Parsed, root: YAMLMap, server: string): YAMLMap {
  const existing = root.get(server, true);
  // The read path skips a non-mapping block (REQ-MCP-082), so replacing it loses nothing readable; refusal instead
  // would leave a set unable to ever succeed against a hand-edited stray value.
  if (isMap(existing)) return existing;
  const fresh = doc.createNode({}) as YAMLMap;
  root.set(server, fresh);
  return fresh;
}

/**
 * REQ-CONFIG-216: the one commit both mutations share — ADR-0004's atomic replace with the protection adapter
 * (REQ-PROVIDER-016, one path for this file and the credential store), which protects the STAGED sibling and reads the
 * protection back BEFORE a byte of content is written, so the protection travels with the rename and no window exists
 * in which the target's content is observable at a weaker protection.
 *
 * "Where the required protection cannot be established the write does not happen" holds BY CONSTRUCTION here: the
 * adapter's refusal — and every other failure of the write — answers before the rename, with the staged file removed
 * and the target untouched (a file this write would have created is never created, and an existing file keeps its own
 * bytes and mode). No put-back step is needed, and there is none.
 *
 * The dependencies the commit takes: the caller's timers (ADR-0006's retry ladder) and, for a test or an alternate
 * host, the protection adapter itself. The default is the platform's own: POSIX `chmod 0600` with a read-back, or on
 * Windows the explicit owner-only access-control list with its read-back — the ACL scratch file is staged in the OS
 * temporary directory (never beside `secrets.yaml`: a workspace's `.rotaris` is watched for configuration changes,
 * and a transient sibling appearing there would read as one; the adapter removes the scratch on every path).
 */
export interface SecretsWriteDeps extends WriterDeps {
  /** REQ-CONFIG-216 / REQ-PROVIDER-016: overridden by tests and by a host that supplies its own adapter. */
  readonly protector?: Protector;
}

async function commitSecrets(file: string, doc: Document.Parsed, removed: number, deps: SecretsWriteDeps): Promise<Result<SecretMutationOutcome, SecretsWriteRefusal>> {
  const text = doc.toString({ lineWidth: 0 });
  const r = await replaceDocument(file, text, {
    protector: deps.protector ?? createProtector({ scratchDir: tmpdir() }),
    createParent: true,
    ...(deps.timers ? { ladder: CONFIG_WRITE_LADDER, timers: deps.timers } : {}),
  });
  if (r.ok) return ok({ file, text, wrote: true, removed });
  return err({ code: r.error.code === 'document.protect' ? 'protection' : 'write-failed', file, fault: r.error.detail ?? r.error.headline });
}

function unchanged(file: string, opened: OpenedSecrets, removed: number): SecretMutationOutcome {
  return { file, text: opened.text ?? '', wrote: false, removed };
}

/**
 * REQ-MCP-084/110: store (or replace) one secret. An empty server, key or value is refused with nothing written; the
 * server's sub-map is created when absent (REQ-CONFIG-217); everything else in the file is left as it stands.
 */
export async function setServerSecret(file: string, server: string, key: string, value: string, deps: SecretsWriteDeps = {}): Promise<Result<SecretMutationOutcome, SecretsWriteRefusal>> {
  const refused = refusalFor(file, server, key, value);
  if (refused) return err(refused);
  const opened = openSecrets(file);
  if (!opened.ok) return opened;
  const doc = opened.value.doc;
  serverMapOf(doc, rootOf(doc), server).set(key, doc.createNode(value));
  return commitSecrets(file, doc, 0, deps);
}

/**
 * REQ-CONFIG-217: remove one secret. A key (or server) that is not there reports not-found and writes NOTHING; the
 * server entry is removed with its last key; a non-mapping block holds no key of this store's shape and is left be.
 */
export async function unsetServerSecret(file: string, server: string, key: string, deps: SecretsWriteDeps = {}): Promise<Result<SecretMutationOutcome, SecretsWriteRefusal>> {
  const refused = refusalFor(file, server, key, null);
  if (refused) return err(refused);
  const opened = openSecrets(file);
  if (!opened.ok) return opened;
  const doc = opened.value.doc;
  const root = rootOf(doc);
  const existing = root.get(server, true);
  if (!isMap(existing) || !existing.has(key)) return ok(unchanged(file, opened.value, 0));
  existing.delete(key);
  if (existing.items.length === 0) root.delete(server);
  return commitSecrets(file, doc, 1, deps);
}

/**
 * REQ-MCP-084: remove every secret of one server, reporting how many keys were removed — and writing nothing when the
 * server holds none. Every key of the block is removed and counted: a hand-edited entry the read path skips is still
 * a key the block holds.
 */
export async function clearServerSecrets(file: string, server: string, deps: SecretsWriteDeps = {}): Promise<Result<SecretMutationOutcome, SecretsWriteRefusal>> {
  const refused = refusalFor(file, server, null, null);
  if (refused) return err(refused);
  const opened = openSecrets(file);
  if (!opened.ok) return opened;
  const doc = opened.value.doc;
  const root = rootOf(doc);
  const existing = root.get(server, true);
  if (!isMap(existing) || existing.items.length === 0) return ok(unchanged(file, opened.value, 0));
  const removed = existing.items.length;
  root.delete(server);
  return commitSecrets(file, doc, removed, deps);
}
