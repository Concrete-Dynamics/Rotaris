/**
 * @rotaris/mcp — the MCP client (ADR-0033, ADR-0034, ADR-0035).
 *
 * Protocol behaviour — handshake, negotiation pinned to an explicit mode
 * (REQ-MCP-067), request correlation, notification dispatch, schema
 * validation — is the official SDK's 2.x line. Process behaviour — who
 * spawns, with which stdio, which environment, hidden window, how it is
 * killed — is ours, through `@rotaris/platform`'s spawn helper.
 *
 * `Transport` is the seam: stdio today, HTTP/SSE later.
 */
export interface Transport {
  send(message: Uint8Array): Promise<void>;
  onMessage(fn: (message: Uint8Array) => void): () => void;
  close(): Promise<void>;
}

/** REQ-MCP-033 / REQ-STARTUP-015: the one reserved argument token the shipped executable recognises. */
export const CODE_INTELLIGENCE_TOKEN = 'builtin:code-intelligence' as const;
