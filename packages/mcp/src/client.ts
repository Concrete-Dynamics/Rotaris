import { Client, SdkError, SdkErrorCode, SSEClientTransport, StreamableHTTPClientTransport, SUPPORTED_PROTOCOL_VERSIONS, type Transport, type VersionNegotiationOptions } from '@modelcontextprotocol/client';
import { millis, type Millis, type MonotonicClock, type Timers } from '@rotaris/kernel';
import { OwnedStdioTransport } from './transport.js';
import type { CallOutcome, McpLog, ServerDescription, ToolInfo } from './types.js';

/**
 * The one connection factory every path uses (ADR-0034: launch behaviour identical everywhere, REQ-MCP-050):
 * ADR-0033's `OwnedStdioTransport` for `stdio`, the SDK's own transports for `http` (streamable HTTP) and `sse`.
 *
 * Negotiation (ESC-12, option (a), measured in `spikes/mcp-negotiation.md`): the 2.x line with the pre-2026
 * offered list retained — `SUPPORTED_PROTOCOL_VERSIONS` is the legacy `initialize` list, and the modern era is
 * reached by `server/discover`. The mode is `'auto'`: over OUR transport the probe runs in place on the one
 * connection (no sibling process — the SDK spawns one only for its own `StdioClientTransport`), a 2026 server
 * answers the probe and a 2025 server's -32601 falls back to the plain `initialize`, so both eras connect and
 * REQ-MCP-067's process count stays literally one. `'legacy'` is the pin a caller may pass to reach a server that
 * dies on any pre-`initialize` request (the spike's finding; the fixture's `--era` cases).
 */
export const CLIENT_INFO = { name: 'rotaris', version: '0.1.0' } as const;
export const DEFAULT_NEGOTIATION: VersionNegotiationOptions = { mode: 'auto' };

export interface OpenOptions {
  readonly description: ServerDescription;
  readonly label: string;
  readonly timers: Timers;
  readonly monotonic: MonotonicClock;
  readonly log: McpLog;
  /** ADR-0033: passed explicitly at every call site, never the SDK's 60 s default. */
  readonly connectTimeoutMs: Millis;
  readonly negotiation?: VersionNegotiationOptions;
  readonly signal?: AbortSignal;
}

export interface OpenedClient {
  readonly client: Client;
  readonly transport: Transport;
  /** The stdio child's pid, null for a remote transport or once the child has gone. */
  readonly pid: () => number | null;
  /** The transport's own account of a failure — the child's exit and redacted stderr tail (REQ-MCP-107). */
  readonly detail: () => string;
  readonly negotiatedVersion: () => string | undefined;
  /** Idempotent; kills the stdio child through `terminateTree`. */
  readonly close: () => Promise<void>;
  readonly onClosed: (fn: () => void) => void;
}

export function transportFor(description: ServerDescription, spec: { label: string; timers: Timers; log: McpLog }): Transport {
  if (description.transport === 'stdio') {
    return new OwnedStdioTransport({ command: description.command, args: description.args, cwd: description.cwd, env: description.env, timers: spec.timers, log: spec.log, label: spec.label });
  }
  const url = new URL(description.url);
  const requestInit = description.headers ? { headers: { ...description.headers } } : undefined;
  if (description.transport === 'http') return new StreamableHTTPClientTransport(url, requestInit ? { requestInit } : {});
  return new SSEClientTransport(url, requestInit ? { requestInit } : {});
}

/**
 * REQ-MCP-048 vs the strict legacy server (measured in the spike: a 2025 server that EXITS on any request before
 * `initialize` dies on the in-place `server/discover` probe — the case the SDK's disposable sibling exists for). When the
 * `'auto'` connect fails that way on a stdio transport, the connect is retried ONCE under `'legacy'` on a fresh transport,
 * sequentially — the first child is gone before the second is spawned, so no two processes ever coexist and REQ-MCP-067's
 * "exactly one process once served" holds; the cost is a second launch for that class of server only.
 */
function closedDuringProbe(error: unknown): boolean {
  return error instanceof SdkError && error.code === SdkErrorCode.EraNegotiationFailed && /closed during the server\/discover probe/.test(error.message);
}

/** Connect: `initialize` (or `server/discover` then the modern era) under one explicit timeout; every failure closes the transport. */
export async function openClient(opts: OpenOptions): Promise<OpenedClient> {
  try {
    return await openOnce(opts, opts.negotiation ?? DEFAULT_NEGOTIATION);
  } catch (cause) {
    const auto = (opts.negotiation ?? DEFAULT_NEGOTIATION).mode === 'auto';
    if (auto && opts.description.transport === 'stdio' && closedDuringProbe(cause)) {
      opts.log.debug(`mcp ${opts.label}: the server closed on the server/discover probe; connecting again under the legacy handshake (one launch at a time)`);
      return openOnce(opts, { mode: 'legacy' });
    }
    throw cause;
  }
}

async function openOnce(opts: OpenOptions, negotiation: VersionNegotiationOptions): Promise<OpenedClient> {
  const transport = transportFor(opts.description, { label: opts.label, timers: opts.timers, log: opts.log });
  const client = new Client(CLIENT_INFO, {
    versionNegotiation: negotiation,
    supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    capabilities: {},
  });
  let closed = false;
  const closedListeners: (() => void)[] = [];
  const previousOnClose = transport.onclose;
  transport.onclose = () => { previousOnClose?.(); if (!closed) { closed = true; for (const fn of closedListeners) fn(); } };
  const opened: OpenedClient = {
    client, transport,
    pid: () => (transport instanceof OwnedStdioTransport ? transport.pid : null),
    detail: () => (transport instanceof OwnedStdioTransport ? transport.detail : ''),
    negotiatedVersion: () => client.getNegotiatedProtocolVersion(),
    close: async () => {
      try { await client.close(); } catch { /* the transport's close is what matters */ }
      try { await transport.close(); } catch { /* idempotent */ }
    },
    onClosed: (fn) => { closedListeners.push(fn); },
  };
  try {
    await client.connect(transport, { timeout: opts.connectTimeoutMs, ...(opts.signal ? { signal: opts.signal } : {}) });
  } catch (cause) {
    await opened.close();
    const detail = opened.detail();
    const error = cause instanceof Error ? cause : new Error(String(cause));
    // REQ-MCP-107: the root cause's own text is kept; the transport's account (exit code, redacted stderr) is appended once.
    if (detail && !error.message.includes(detail)) error.message = `${error.message} (${detail})`;
    throw error;
  }
  return opened;
}

/** REQ-MCP-046/052: `tools/list` under an explicit timeout; entries with an empty or non-string name dropped, description `""` when missing. */
export async function listTools(client: Client, timeoutMs: Millis, signal?: AbortSignal): Promise<ToolInfo[]> {
  const result = await client.listTools(undefined, { timeout: timeoutMs, ...(signal ? { signal } : {}) });
  const out: ToolInfo[] = [];
  for (const t of result.tools) {
    if (typeof t.name !== 'string' || t.name === '') continue;
    out.push({ name: t.name, description: typeof t.description === 'string' ? t.description : '', inputSchema: (t.inputSchema as Record<string, unknown> | undefined) ?? { type: 'object', properties: {} } });
  }
  return out;
}

/** Render a tool result's content as text: text blocks verbatim, every other block as compact JSON. */
export function renderContent(content: unknown): string {
  if (!Array.isArray(content)) return content === undefined || content === null ? '' : typeof content === 'string' ? content : JSON.stringify(content);
  return content.map((block: unknown) => {
    if (block && typeof block === 'object' && (block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string') return (block as { text: string }).text;
    try { return JSON.stringify(block); } catch { return String(block); }
  }).join('\n');
}

/**
 * REQ-MCP-003: one call under its own allowance, measured from dispatch to result, no reset on progress; an
 * exhausted allowance or a transport failure rejects and the caller turns it into a failed tool result.
 */
export async function callTool(client: Client, monotonic: MonotonicClock, name: string, args: Readonly<Record<string, unknown>>, timeoutMs: Millis, signal?: AbortSignal): Promise<CallOutcome> {
  const started = monotonic.now();
  const result = await client.callTool({ name, arguments: { ...args } }, { timeout: timeoutMs, resetTimeoutOnProgress: false, maxTotalTimeout: timeoutMs, ...(signal ? { signal } : {}) });
  const r = result as { content?: unknown; isError?: boolean; structuredContent?: unknown };
  const text = renderContent(r.content) || (r.structuredContent === undefined ? '' : JSON.stringify(r.structuredContent));
  return { text, isError: r.isError === true, elapsedMs: monotonic.now() - started };
}

export const DISCOVERY_TIMEOUT_MS: Millis = millis(30_000);
export const DISCOVERY_BOUND_MS: Millis = millis(35_000);
export const PROBE_TIMEOUT_MS: Millis = millis(8_000);
export const HOOK_TIMEOUT_MS: Millis = millis(15_000);
export const CONNECT_AND_LIST_TIMEOUT_MS: Millis = millis(30_000);
export const CALL_TIMEOUT_DEFAULT_MS: Millis = millis(300_000);
