/**
 * @rotaris/mcp — the MCP client (ADR-0033, ADR-0034; ADR-0035 owed).
 *
 * Protocol behaviour — handshake, negotiation, request correlation, notification dispatch, schema
 * validation — is the official SDK's 2.x line (`@modelcontextprotocol/client` 2.0.0, pinned). Process
 * behaviour — who spawns, with which stdio, which environment, hidden window, how it is killed — is ours,
 * through `@rotaris/platform`'s spawn helper (`OwnedStdioTransport`). Three connection paths over that one
 * factory: `ToolDiscovery` (memoised per process by the nine-value identity), `HealthProbe` (never cached),
 * `SessionConnections` (one shared connection per server per session under a keyed single-flight).
 *
 * No Electron import and no process assumption: the run host instantiates everything here (ADR-0034's
 * placement, as read on first execution — see the ADR-0034 note).
 */
export * from './order.js';
export * from './types.js';
export * from './transport.js';
export * from './client.js';
export * from './identity.js';
export * from './discovery.js';
export * from './probe.js';
export * from './sessions.js';

/** REQ-MCP-033 / REQ-STARTUP-015: the one reserved argument token the shipped executable recognises. */
export const CODE_INTELLIGENCE_TOKEN = 'builtin:code-intelligence' as const;
