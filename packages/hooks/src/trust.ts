import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalPath, guardedRead, replaceDocument, WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { TRUSTED_HOOK_SCOPES, type HookTrustStatus } from '@rotaris/contracts';
import { type HookEntry } from '@rotaris/config';
import { err, ok, type Result } from '@rotaris/kernel';
import { withheldNotice } from './verdict.js';

/**
 * The workspace trust gate (REQ-HOOKS-090..102, REQ-WORKSPACE-116..121): a decision on declared
 * provenance, never on what a command does; keyed by the fingerprint of REQ-HOOKS-091 and the workspace
 * resolved by the product's one path rule (REQ-HOOKS-097 → REQ-STARTUP-163, platform's canonical path).
 */
export const TRUST_FILE = 'hook-trust.json' as const;
export const TRUST_VERSION = 1;

/** REQ-HOOKS-091: canonical JSON — keys sorted, compact separators, ASCII-escaped. */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): string => {
    if (v === null || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number') return Number.isFinite(v) ? JSON.stringify(v) : 'null';
    if (typeof v === 'string') return asciiString(v);
    if (Array.isArray(v)) return `[${v.map(walk).join(',')}]`;
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return `{${Object.keys(o).sort().map((k) => `${asciiString(k)}:${walk(o[k])}`).join(',')}}`;
    }
    return 'null';
  };
  return walk(value);
}
function asciiString(s: string): string {
  return JSON.stringify(s).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** REQ-HOOKS-091: over every workspace-scoped entry in declaration order, disabled ones included, resolved values, six keys. */
export function fingerprint(workspaceEntries: readonly HookEntry[]): string {
  const doc = {
    version: TRUST_VERSION,
    hooks: workspaceEntries.map((h) => ({ command: h.command, event: h.event, matcher: h.matcher, name: h.name, required: h.required, timeout_seconds: h.timeoutSeconds })),
  };
  return createHash('sha256').update(canonicalJson(doc), 'utf8').digest('hex');
}

const DIGEST = /^[0-9a-f]{64}$/;
export function isDigest(s: string): boolean {
  return DIGEST.test(s);
}

export interface TrustDecision {
  readonly digest: string;
  readonly trusted: boolean;
  readonly decidedAt: string;
}

export function resolveWorkspace(workspaceRoot: string): string {
  return canonicalPath(workspaceRoot);
}
export function trustFilePath(workspaceRoot: string): string {
  return join(resolveWorkspace(workspaceRoot), WORKSPACE_SCOPE_DIR, TRUST_FILE);
}

/** REQ-HOOKS-094: every malformed condition reads as "no decision"; never throws. */
export function readDecision(workspaceRoot: string): TrustDecision | null {
  const path = trustFilePath(workspaceRoot);
  try {
    if (existsSync(path) && statSync(path).isDirectory()) return null;
  } catch {
    return null;
  }
  const outcome = guardedRead(path, (raw) => JSON.parse(raw) as unknown);
  if (outcome.state !== 'readable') return null;
  const v = outcome.value;
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o['version'] !== TRUST_VERSION) return null;
  const digest = o['digest'];
  if (typeof digest !== 'string' || !isDigest(digest)) return null;
  const trusted = o['trusted'];
  if (typeof trusted !== 'boolean') return null;
  const decidedAt = o['decided_at'];
  if (typeof decidedAt !== 'string' || Number.isNaN(Date.parse(decidedAt))) return null;
  return { digest, trusted, decidedAt };
}

/** REQ-HOOKS-096: shape check first, directory created, atomic write, failures reported. */
export async function writeDecision(workspaceRoot: string, digest: string, trusted: boolean, nowIso: string): Promise<Result<void, { readonly reason: string }>> {
  if (!isDigest(digest)) return err({ reason: `Not a hook-set digest: ${digest}` });
  const dir = join(resolveWorkspace(workspaceRoot), WORKSPACE_SCOPE_DIR);
  try {
    mkdirSync(dir, { recursive: true });
  } catch (cause) {
    return err({ reason: `could not create ${dir}: ${String(cause)}` });
  }
  const decidedAt = nowIso.endsWith('Z') ? `${nowIso.slice(0, -1)}+00:00` : nowIso;
  const content = `${JSON.stringify({ decided_at: decidedAt, digest, trusted, version: TRUST_VERSION }, null, 2)}\n`;
  const r = await replaceDocument(join(dir, TRUST_FILE), content);
  if (!r.ok) return err({ reason: r.error.headline });
  return ok(undefined);
}

/** REQ-HOOKS-093/136: an absent file is success; any other failure is surfaced. */
export function clearDecision(workspaceRoot: string): Result<void, { readonly reason: string }> {
  const path = trustFilePath(workspaceRoot);
  try {
    unlinkSync(path);
    return ok(undefined);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return ok(undefined);
    return err({ reason: `could not remove ${path}: ${String(cause)}` });
  }
}

export interface GateResult {
  /** Originally permitted, then reinstated, declaration order within each (REQ-HOOKS-098). */
  readonly permitted: readonly HookEntry[];
  readonly withheld: readonly HookEntry[];
  readonly reinstated: readonly HookEntry[];
  readonly notice: string;
  readonly status: HookTrustStatus;
  readonly fingerprint: string;
  readonly decision: TrustDecision | null;
  readonly workspace: string;
}

const TRUSTED: ReadonlySet<string> = new Set(TRUSTED_HOOK_SCOPES);

function sameRun(a: HookEntry, b: HookEntry): boolean {
  return a.event === b.event && a.matcher === b.matcher && a.command === b.command && a.required === b.required && a.timeoutSeconds === b.timeoutSeconds;
}

/**
 * REQ-HOOKS-090/092/095/097/098/099: the gate over the in-memory resolved set — the set that was
 * fingerprinted is the set that runs, with no reload between. `superseded` is consulted only for
 * reinstatement of always-trusted entries a withheld workspace list displaced.
 */
export function applyGate(resolved: { readonly entries: readonly HookEntry[]; readonly superseded: readonly HookEntry[] }, workspaceRoot: string): GateResult {
  const workspace = resolveWorkspace(workspaceRoot);
  const workspaceEntries = resolved.entries.filter((h) => h.source === 'workspace');
  const digest = fingerprint(workspaceEntries);
  const decision = workspaceEntries.length > 0 ? readDecision(workspace) : null;
  const approved = decision !== null && decision.trusted && decision.digest === digest;
  const permitted: HookEntry[] = [];
  const withheld: HookEntry[] = [];
  for (const h of resolved.entries) {
    const scope = h.source === '' ? 'default' : h.source;
    if (scope === 'default' || scope === 'global') permitted.push(h);
    else if (scope === 'workspace') (approved ? permitted : withheld).push(h);
    else if (TRUSTED.has(scope)) permitted.push(h);
    else withheld.push(h);
  }
  const reinstated: HookEntry[] = [];
  if (withheld.some((h) => h.source === 'workspace')) {
    for (const s of resolved.superseded) {
      if (s.source !== 'default' && s.source !== 'global') continue;
      if (permitted.some((p) => p.id === s.id || sameRun(p, s)) || reinstated.some((p) => p.id === s.id || sameRun(p, s))) continue;
      reinstated.push(s);
    }
  }
  const status: HookTrustStatus = workspaceEntries.length === 0 ? 'none' : decision === null || decision.digest !== digest ? 'review' : decision.trusted ? 'trusted' : 'refused';
  return {
    permitted: [...permitted, ...reinstated], withheld, reinstated,
    notice: withheldNotice(withheld.filter((h) => h.source === 'workspace').length, reinstated.length),
    status, fingerprint: digest, decision, workspace,
  };
}
