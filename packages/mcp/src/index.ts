/**
 * @rotaris/mcp — the MCP client (ADR-0033, ADR-0034, ADR-0035; ADR-0035, the bundled code-intelligence runtime, was
 * written here as owed until 2026-10-13 and has been built since 2026-09-06, Part T: `setup.ts` and the probe).
 *
 * Protocol behaviour — handshake, negotiation, request correlation, notification dispatch, schema
 * validation — is the official SDK's 2.x line (`@modelcontextprotocol/client` 2.3.0, pinned; 2.0.0 until R-081). Process
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
export * from './setup.js';

/** REQ-MCP-033 / REQ-STARTUP-015: the one reserved argument token the shipped executable recognises. */
export const CODE_INTELLIGENCE_TOKEN = 'builtin:code-intelligence' as const;
