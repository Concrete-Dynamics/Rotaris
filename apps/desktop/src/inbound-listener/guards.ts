/**
 * The MCP INBOUND SURFACE's guards (ADR-0067; REQ-MCP-119/121/122): the bearer token that separates a caller from a
 * bystander, and the `Origin`/`Host` checks that close DNS rebinding from the user's own browser.
 *
 * These are pure functions over the header values the SDK's own helpers read, kept here rather than inline in the
 * listener so they are testable with no HTTP server and no process. The SDK ships equivalents
 * (`validateHostHeader`/`validateOriginHeader`, `localhostAllowedHostnames`/`localhostAllowedOrigins`) and they are
 * read for their allowlists; the header rules themselves are stated here because REQ-MCP-122 fixes three cases the
 * SDK's helpers leave to the caller to combine — a missing `Origin` from a native client is ALLOWED, a foreign
 * `Origin` is refused, and the `Host` is checked against loopback.
 */

/** REQ-MCP-119/122: the hostnames loopback is — the same set the SDK's own localhost allowlist names. */
export const LOOPBACK_HOSTNAMES: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

/** Why a request was refused, or that it was not. The strings are for the log line and the test; the HTTP answer is the caller's. */
export type InboundGuardOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'missing-host' | 'bad-host' | 'bad-origin'; readonly detail: string };

/**
 * REQ-MCP-122: the `Host` header, checked against loopback (`validateHostHeader`'s rule, port-agnostic). A missing or
 * unparsable `Host` is refused: a request that cannot say which host it was addressed to is not served.
 */
export function checkInboundHost(hostHeader: string | null | undefined): InboundGuardOutcome {
  if (hostHeader === null || hostHeader === undefined || hostHeader === '') {
    return { ok: false, reason: 'missing-host', detail: 'the request carries no Host header' };
  }
  let hostname: string;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname;
  } catch {
    return { ok: false, reason: 'bad-host', detail: 'the Host header could not be read as an address' };
  }
  if (!LOOPBACK_HOSTNAMES.includes(hostname)) return { ok: false, reason: 'bad-host', detail: `the Host names ${hostname}, which is not loopback` };
  return { ok: true };
}

/**
 * REQ-MCP-122, the header rule the spec fixes: a MISSING `Origin` is allowed (a native MCP client sends none — only a
 * browser does, and the check defends against the browser); a PRESENT `Origin` whose hostname is not loopback is
 * refused; a present `Origin` that cannot be parsed (the literal `null` an opaque context sends, among them) is refused.
 */
export function checkInboundOrigin(originHeader: string | null | undefined): InboundGuardOutcome {
  if (originHeader === null || originHeader === undefined || originHeader === '') return { ok: true };
  let hostname: string;
  try {
    hostname = new URL(originHeader).hostname;
  } catch {
    return { ok: false, reason: 'bad-origin', detail: 'the Origin header could not be read as an origin' };
  }
  if (hostname === '' || !LOOPBACK_HOSTNAMES.includes(hostname)) {
    return { ok: false, reason: 'bad-origin', detail: `the Origin names ${hostname || 'an empty host'}, which is not loopback` };
  }
  return { ok: true };
}

/** Both checks in the order REQ-MCP-122 states: the request is refused BEFORE it is served, on either mismatch. */
export function checkInboundRequest(headers: { readonly host: string | null | undefined; readonly origin: string | null | undefined }): InboundGuardOutcome {
  const host = checkInboundHost(headers.host);
  if (!host.ok) return host;
  return checkInboundOrigin(headers.origin);
}

/**
 * REQ-MCP-121: the per-exposure bearer token. Main mints it when the exposure is switched on and shows it once; the
 * listener holds it for that exposure alone and compares a request's `Authorization: Bearer …` against it. Revoking
 * the exposure drops the token with it, so a stale token is refused exactly as a wrong one is.
 *
 * A comparison in constant time is not the point here — the token is not a long-lived secret and an attacker who can
 * time a loopback request can read the port anyway — but it is cheap and it keeps a wrong-length token from being read
 * as "close enough", so it is done.
 */
export class InboundToken {
  private current: string | null = null;

  /** The token in force, or null while no exposure is on (then every request is refused). */
  get value(): string | null {
    return this.current;
  }

  /** REQ-MCP-121: replace the token — a fresh exposure shows a fresh one and the old one dies with the call. */
  rotate(token: string): void {
    this.current = token;
  }

  /** REQ-MCP-121: revoking the exposure invalidates the token with it. */
  revoke(): void {
    this.current = null;
  }

  /**
   * Whether an `Authorization` header authorizes this request. A missing, malformed or non-`Bearer` header is refused,
   * and a wrong token is refused — all without reaching the run host (REQ-MCP-121).
   */
  accepts(authorizationHeader: string | null | undefined): boolean {
    const token = this.current;
    if (token === null) return false;
    if (authorizationHeader === null || authorizationHeader === undefined) return false;
    const [type, value] = authorizationHeader.split(' ');
    if (type?.toLowerCase() !== 'bearer' || value === undefined) return false;
    return constantTimeEqual(value, token);
  }
}

/** A fixed-length, no-early-exit string comparison (the SDK's own bearer check compares with `===`; this is stricter for no cost). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let acc = 0;
  for (let i = 0; i < a.length; i += 1) acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return acc === 0;
}

/** REQ-MCP-121: the per-exposure bearer token main mints — 32 random bytes, base64url, shown once and never logged. */
export function mintInboundToken(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(32);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
