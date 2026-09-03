/**
 * ADR-0023's pure classifier. Canonicalisation is a fixed function (REQ-SANDBOX-006..008, -013, -019,
 * REQ-TOOLS-086); the pattern grammar is exact-host or a single leading `*.` (REQ-TOOLS-085); the
 * consultation order is denied, allowed, default (REQ-SANDBOX-014, REQ-TOOLS-084); "local" is textual
 * loopback only and performs no name resolution (REQ-TOOLS-087, REQ-SANDBOX-018).
 *
 * OQ-36 reading, said here: REQ-SANDBOX-006 governs and an IPv6 literal canonicalises UNBRACKETED
 * (`http://[::1]:9000/` → `::1`); REQ-TOOLS-086's "re-bracket" sentence is the one not followed.
 */
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
    host = new URL(raw).hostname;
  } catch {
    if (raw.includes('://')) return '';
    try {
      host = new URL(`http://${raw}`).hostname;
    } catch {
      return '';
    }
  }
  host = host.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  while (host.endsWith('.')) host = host.slice(0, -1);
  return host;
}

/** REQ-TOOLS-085: exact host, or one leading `*.`; any other `*` is an error naming the pattern. */
export function compileHostPattern(pattern: string): { readonly exact: string | null; readonly suffix: string | null } {
  const p = pattern.trim().toLowerCase();
  if (p.startsWith('*.')) {
    const rest = p.slice(2);
    if (rest.includes('*') || rest === '') throw new Error(`Host pattern '${pattern}' is not supported: the only wildcard form is a single leading '*.' as in '*.example.com'`);
    return { exact: null, suffix: rest };
  }
  if (p.includes('*')) throw new Error(`Host pattern '${pattern}' is not supported: the only wildcard form is a single leading '*.' as in '*.example.com'`);
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

/** Denied list, then allowed list, then the default; a pattern that cannot be applied is an error (egress_policy_error). */
export function classify(policy: EgressPolicy, host: string): Disposition {
  if (host === '') return 'deny';
  for (const p of policy.denied) if (matchHostPattern(p, host)) return 'deny';
  for (const p of policy.allowed) if (matchHostPattern(p, host)) return 'allow';
  return policy.defaultDisposition;
}

/** REQ-TOOLS-045 / REQ-SANDBOX-019: a hostless or unreadable URL counts as remote. */
export function isRemoteUrl(url: string): boolean {
  return !isLocal(canonicalizeHost(url));
}
