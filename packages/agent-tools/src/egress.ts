/**
 * ADR-0023's pure classifier. Canonicalisation is a fixed function (REQ-SANDBOX-006..008, -013, -019,
 * REQ-TOOLS-086); the pattern grammar is exact-host or a single leading `*.` (REQ-TOOLS-085); the
 * consultation order is denied, allowed, default (REQ-SANDBOX-014, REQ-TOOLS-084); "local" is textual
 * loopback only and performs no name resolution (REQ-TOOLS-087, REQ-SANDBOX-018).
 *
 * Accepted OQ-36: REQ-SANDBOX-006 owns unbracketed canonical IPv6. URL authorities use brackets.
 */
import { isIP } from 'node:net';
import { hostPatternProblem } from '@rotaris/contracts';
export type Disposition = 'allow' | 'ask' | 'deny';

export interface EgressPolicy {
  readonly denied: readonly string[];
  readonly allowed: readonly string[];
  readonly defaultDisposition: Disposition;
}

/** REQ-SANDBOX-037: the permissive fallback for a call with no owning run — a real, tested path (ADR-0023 c.5). */
export const PERMISSIVE_EGRESS: EgressPolicy = Object.freeze({ denied: [], allowed: [], defaultDisposition: 'allow' as const });

/** The empty string is the "unknown host": denies, matches nothing, counts as remote. */
export function canonicalizeHost(input: string): string {
  const raw = String(input).trim();
  if (raw === '') return '';
  let host = '';
  try {
    const url = isIP(raw) === 6 ? `http://[${raw}]` : raw.includes('://') ? raw : `http://${raw}`;
    host = new URL(url).hostname;
  } catch {
    return '';
  }
  host = host.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host.endsWith('.')) host = host.slice(0, -1);
  return host;
}

/** REQ-TOOLS-085: exact host, or one leading `*.`; any other `*` is an error naming the pattern. */
export function compileHostPattern(pattern: string): { readonly exact: string | null; readonly suffix: string | null } {
  const p = pattern.trim().toLowerCase();
  // REQ-SANDBOX-114: the sentence is defined once, in contracts, so the settings control's problem
  // label and this refusal cannot drift apart.
  const problem = hostPatternProblem(pattern);
  if (problem !== null) throw new Error(problem);
  if (p.startsWith('*.')) return { exact: null, suffix: p.slice(2) };
  return { exact: canonicalizeHost(p) || p, suffix: null };
}

/** Whole DNS labels; `*.example.com` covers `api.example.com` and `a.b.example.com`, never bare `example.com`. */
export function matchHostPattern(pattern: string, host: string): boolean {
  if (host === '') return false;
  const c = compileHostPattern(pattern);
  if (c.exact !== null) return c.exact === host;
  const suffix = c.suffix as string;
  return host.length > suffix.length + 1 && host.endsWith(`.${suffix}`);
}

const LOOPBACK_NAMES: ReadonlySet<string> = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost']);

/** REQ-TOOLS-087 / REQ-SANDBOX-018: loopback only; private and link-local ranges are remote. */
export function isLocal(host: string): boolean {
  if (host === '') return false;
  if (LOOPBACK_NAMES.has(host)) return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  // IPv4-mapped or -compatible literals whose embedded address is loopback.
  const m = /^(?:::ffff:|::)(?:127\.\d{1,3}\.\d{1,3}\.\d{1,3}|7f[0-9a-f]{2}:[0-9a-f]{1,4})$/.exec(host);
  return m !== null;
}

/**
 * REQ-SANDBOX-026: a refusal names which policy input produced the verdict — the unknown host, a pattern on one
 * of the two lists (`runtime.network_denied_hosts` / `runtime.network_allowed_hosts`), or the default disposition
 * (`runtime.network_egress_policy`).
 */
export type ClassificationSource =
  | { readonly kind: 'unknown-host' }
  | { readonly kind: 'denied-list'; readonly pattern: string }
  | { readonly kind: 'allowed-list'; readonly pattern: string }
  | { readonly kind: 'default' };

export interface Classification {
  readonly disposition: Disposition;
  readonly source: ClassificationSource;
}

/** Denied list, then allowed list, then the default; a pattern that cannot be applied is an error (egress_policy_error). */
export function classifyExplained(policy: EgressPolicy, host: string): Classification {
  if (host === '') return { disposition: 'deny', source: { kind: 'unknown-host' } };
  for (const p of policy.denied) if (matchHostPattern(p, host)) return { disposition: 'deny', source: { kind: 'denied-list', pattern: p } };
  for (const p of policy.allowed) if (matchHostPattern(p, host)) return { disposition: 'allow', source: { kind: 'allowed-list', pattern: p } };
  return { disposition: policy.defaultDisposition, source: { kind: 'default' } };
}

/** The verdict alone — the same consultation order (REQ-SANDBOX-014). */
export function classify(policy: EgressPolicy, host: string): Disposition {
  return classifyExplained(policy, host).disposition;
}

/** The setting a classification source names, for a refusal's detail (REQ-SANDBOX-026, REQ-TOOLS-092). */
export function describeSource(source: ClassificationSource, disposition: Disposition): string {
  switch (source.kind) {
    case 'unknown-host': return 'the host could not be read from the URL, and an unknown host is denied (runtime.network_egress_policy is not consulted for it)';
    case 'denied-list': return `it matches '${source.pattern}' on runtime.network_denied_hosts`;
    case 'allowed-list': return `it matches '${source.pattern}' on runtime.network_allowed_hosts`;
    case 'default': return `the egress policy (runtime.network_egress_policy) resolves that host to '${disposition}'`;
  }
}

/** REQ-TOOLS-045 / REQ-SANDBOX-019: a hostless or unreadable URL counts as remote. */
export function isRemoteUrl(url: string): boolean {
  return !isLocal(canonicalizeHost(url));
}
