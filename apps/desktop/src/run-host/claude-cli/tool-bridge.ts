import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { ToolSpec } from '@rotaris/model';

/**
 * PD-PROVIDER-002 clause 3 — the tools a Claude Code session is offered are the product's own, and the product runs
 * them. The external tool's built-in tools are switched off; this endpoint is the one tool server it is given
 * (`--strict-mcp-config`), a Model Context Protocol server on the loopback interface speaking the streamable HTTP
 * transport's request/response form. A `tools/call` is NOT executed here: it is handed to the session's handler,
 * which gives the call to the run loop as any model's tool call is given (the approval flow, the tool events and the
 * transcript rows are the loop's), and answers the request when the loop has the result.
 *
 * Bound to `127.0.0.1` on an ephemeral port. Each session has its own path segment and its own bearer, both random,
 * so one session cannot reach another's tools and nothing else on the machine can call either without the header.
 */
export const BRIDGE_SERVER_NAME = 'rotaris';
/** The prefix the external tool gives a tool of this server: `mcp__<server>__<tool>`. */
export const BRIDGE_TOOL_PREFIX = `mcp__${BRIDGE_SERVER_NAME}__`;

export interface BridgeToolCall {
  /** The external tool's own id for the call, which its stream names the same call by. */
  readonly callId: string;
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface BridgeToolResult { readonly text: string; readonly isError: boolean }

export interface BridgeSessionHandlers {
  readonly tools: () => readonly ToolSpec[];
  readonly call: (call: BridgeToolCall) => Promise<BridgeToolResult>;
}

export interface BridgeRegistration {
  /** The `mcpServers` document handed to the external tool. */
  readonly config: { readonly mcpServers: Readonly<Record<string, { readonly type: 'http'; readonly url: string; readonly headers: Readonly<Record<string, string>> }>> };
  release(): void;
}

export interface ToolBridge {
  register(handlers: BridgeSessionHandlers): Promise<BridgeRegistration>;
  close(): Promise<void>;
}

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BODY_BYTES = 8 * 1024 * 1024;

async function readBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buf.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function reply(res: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) { res.writeHead(status); res.end(); return; }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export class LoopbackToolBridge implements ToolBridge {
  private server: Server | null = null;
  private listening: Promise<number> | null = null;
  private readonly sessions = new Map<string, { readonly bearer: string; readonly handlers: BridgeSessionHandlers }>();

  constructor(private readonly warn: (m: string) => void = () => undefined) {}

  private listen(): Promise<number> {
    this.listening ??= new Promise<number>((resolve, reject) => {
      const server = createServer((req, res) => { void this.handle(req, res).catch((cause: unknown) => { this.warn(`claude code tool bridge: ${cause instanceof Error ? cause.message : String(cause)}`); if (!res.headersSent) reply(res, 500); else res.end(); }); });
      // A tool call's answer waits on the run loop — an approval may stand for a long time.
      server.requestTimeout = 0;
      server.timeout = 0;
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        this.server = server;
        resolve(address !== null && typeof address === 'object' ? address.port : 0);
      });
    });
    return this.listening;
  }

  async register(handlers: BridgeSessionHandlers): Promise<BridgeRegistration> {
    const port = await this.listen();
    const id = randomBytes(16).toString('hex');
    const bearer = randomBytes(24).toString('base64url');
    this.sessions.set(id, { bearer, handlers });
    return {
      config: { mcpServers: { [BRIDGE_SERVER_NAME]: { type: 'http', url: `http://127.0.0.1:${port}/mcp/${id}`, headers: { Authorization: `Bearer ${bearer}` } } } },
      release: () => { this.sessions.delete(id); },
    };
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const match = /^\/mcp\/([0-9a-f]{32})$/.exec(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    const session = match ? this.sessions.get(match[1]!) : undefined;
    if (!session) { reply(res, 404); return; }
    if (req.headers.authorization !== `Bearer ${session.bearer}`) { reply(res, 401); return; }
    // No server-initiated stream is offered, and a session ends with its process.
    if (req.method !== 'POST') { reply(res, 405); return; }
    const raw = await readBody(req);
    if (raw === null) { reply(res, 413); return; }
    let message: { id?: unknown; method?: unknown; params?: unknown };
    try { message = JSON.parse(raw) as typeof message; } catch { reply(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
    const { id, method } = message;
    // A notification is acknowledged and asks for nothing.
    if (id === undefined || id === null) { reply(res, 202); return; }
    const result = (value: unknown): void => reply(res, 200, { jsonrpc: '2.0', id, result: value });
    const params = message.params !== null && typeof message.params === 'object' ? (message.params as Record<string, unknown>) : {};
    switch (method) {
      case 'initialize': {
        const asked = typeof params['protocolVersion'] === 'string' ? params['protocolVersion'] : '';
        result({ protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0], capabilities: { tools: {} }, serverInfo: { name: BRIDGE_SERVER_NAME, version: '1' } });
        return;
      }
      case 'ping': result({}); return;
      case 'tools/list':
        result({ tools: session.handlers.tools().map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters })) });
        return;
      case 'tools/call': {
        const name = typeof params['name'] === 'string' ? params['name'] : '';
        const args = params['arguments'] !== null && typeof params['arguments'] === 'object' ? (params['arguments'] as Record<string, unknown>) : {};
        const meta = params['_meta'] !== null && typeof params['_meta'] === 'object' ? (params['_meta'] as Record<string, unknown>) : {};
        const callId = typeof meta['claudecode/toolUseId'] === 'string' ? meta['claudecode/toolUseId'] : '';
        const answer = await session.handlers.call({ callId, name, args });
        result({ content: [{ type: 'text', text: answer.text }], isError: answer.isError });
        return;
      }
      default:
        reply(res, 200, { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${typeof method === 'string' ? method : ''}` } });
    }
  }

  async close(): Promise<void> {
    this.sessions.clear();
    const server = this.server;
    this.server = null;
    this.listening = null;
    if (!server) return;
    await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
  }
}
