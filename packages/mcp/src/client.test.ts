import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { nodeClocks } from '@rotaris/platform';
import { transportFor } from './client.js';
import type { McpLog, RemoteDescription } from './types.js';

/**
 * A remote entry's configured `headers` (REQ-MCP-001, REQ-MCP-020, REQ-MCP-043) reach the origin of its `url` and no
 * other. Until `@modelcontextprotocol/client` 2.3.0 the SDK's two HTTP transports followed a cross-origin redirect and
 * sent the request again, headers and body included, to whatever origin the server named (GHSA-6prh-2h8m-c8cw,
 * Dependabot alerts #2, #15 and #47; R-081). These cases fail on 2.0.0, where the second origin receives the header.
 * What the product does with a refused redirect is OQ-451.
 */
const clocks = nodeClocks();
const quiet: McpLog = { info: () => undefined, warn: () => undefined, debug: () => undefined };
const SECRET = 'redirect-probe-not-a-credential';

type Seen = { readonly method: string | undefined; readonly headers: IncomingHttpHeaders };
const seenBySecondOrigin: Seen[] = [];
let first: Server;
let second: Server;
let firstUrl = '';

const listen = (server: Server): Promise<string> => new Promise((done) => {
  server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
});

beforeAll(async () => {
  second = createServer((req, res) => {
    seenBySecondOrigin.push({ method: req.method, headers: req.headers });
    req.resume();
    res.writeHead(500).end();
  });
  const secondUrl = await listen(second);
  // Another port is another origin; 307 keeps the method, so only the origin decides whether it is followed.
  first = createServer((req, res) => {
    req.resume();
    res.writeHead(307, { location: `${secondUrl}/mcp` }).end();
  });
  firstUrl = await listen(first);
});

afterAll(async () => {
  for (const server of [first, second]) {
    server.closeAllConnections();
    await new Promise((done) => server.close(() => done(undefined)));
  }
});

const remote = (transport: RemoteDescription['transport']): RemoteDescription => ({ transport, url: `${firstUrl}/mcp`, headers: { 'X-Auth': SECRET } });
const initialize = { jsonrpc: '2.0' as const, id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'rotaris', version: '0.0.0' } } };

describe('a remote server that redirects to another origin (GHSA-6prh-2h8m-c8cw)', () => {
  it('http: the request is refused and the configured header never reaches the second origin', async () => {
    seenBySecondOrigin.length = 0;
    const transport = transportFor(remote('http'), { label: 'redirect-http', timers: clocks.timers, log: quiet });
    await transport.start();
    await expect(transport.send(initialize)).rejects.toThrow();
    await transport.close();
    expect(seenBySecondOrigin).toEqual([]);
  });

  it('sse: the stream is refused and the configured header never reaches the second origin', async () => {
    seenBySecondOrigin.length = 0;
    const transport = transportFor(remote('sse'), { label: 'redirect-sse', timers: clocks.timers, log: quiet });
    await expect(transport.start()).rejects.toThrow();
    await transport.close();
    expect(seenBySecondOrigin).toEqual([]);
  });
});
