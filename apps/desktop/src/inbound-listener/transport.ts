import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createInboundSurface, type InboundSurfaceDeps } from './surface.js';

/**
 * THE LOOPBACK BIND (ADR-0067; REQ-MCP-119): the listener's socket, and nothing else. It binds `127.0.0.1` and, where the
 * platform supplies it, `::1`, on an EPHEMERAL port the operating system chooses — never a fixed port, never `0.0.0.0`,
 * never a LAN address. There is no `stdio` transport and no SSE transport.
 *
 * Kept apart from the process entry so a test can bind, read the port the OS chose, serve a request and unbind, all in
 * one process, without forking anything. The HTTP server holds no state of its own: every request goes through
 * `createInboundSurface`, whose two guards (the loopback `Host`/`Origin` check and the bearer token) run first.
 */

/** What is listening, once bound: the loopback addresses, and the port the OS chose. */
export interface InboundBinding {
  readonly addresses: readonly string[];
  readonly port: number;
}

export interface InboundListener {
  /** The address the socket is bound to, or null while it serves nothing. */
  readonly binding: () => InboundBinding | null;
  /** Bind the surface; answers the port the OS chose. A second call while bound is refused. */
  readonly bind: () => Promise<InboundBinding>;
  /** Unbind the surface and tear the handler down. Idempotent. */
  readonly unbind: () => Promise<void>;
}

/**
 * The loopback addresses this build binds, in the order they are tried: the IPv4 one is required, the IPv6 one is best-effort.
 */
export function loopbackAddresses(hasIpv6 = true): readonly string[] {
  return hasIpv6 ? ['127.0.0.1', '::1'] : ['127.0.0.1'];
}

export interface CreateInboundListenerDeps extends InboundSurfaceDeps {
  /** How the process knows whether `::1` is available. Tests pass a fixed answer; the process reads the platform. */
  readonly ipv6Available?: boolean | undefined;
}

/**
 * The listener over the surface. `bind` starts one HTTP server per loopback address on the same ephemeral port the OS
 * chose for the first — so `127.0.0.1:P` and `[::1]:P` are the same surface — and answers that port. A bind error is
 * raised to the caller, who reports it; nothing is left half-bound.
 */
export function createInboundListener(deps: CreateInboundListenerDeps): InboundListener {
  let servers: Server[] = [];
  let bound: InboundBinding | null = null;
  /** The bind in flight, if any — the serialisation of overlapping binds (see `bind` below). */
  let bindingAttempt: Promise<InboundBinding> | null = null;
  /**
   * The SDK handler of the CURRENT binding. It is built per bind and torn down per unbind, because `close()` shuts the
   * transport down for good: an `unbind`/`bind` pair (a disable then an enable) that reused one handler would serve the
   * second exposure through a closed one and a request would go unanswered (REQ-MCP-120/121). `null` while unbound.
   */
  let handler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | null = null;
  let surface: ReturnType<typeof createInboundSurface> | null = null;

  /**
   * REQ-MCP-121/119: tear the bound socket down and DETERMINISTICALLY end it. `server.close()` alone waits for every open
   * connection to end, and the SDK's streamable-HTTP leg holds one open for the life of a session — so a revocation could
   * report success while the socket stayed alive. `closeAllConnections()` destroys what still holds the server open, so
   * the close callback always fires and `unbind` answers only once nothing is listening.
   */
  const closeAll = async (): Promise<void> => {
    const closing = servers;
    servers = [];
    bound = null;
    const handlerToClose = surface;
    surface = null;
    handler = null;
    await Promise.all(closing.map((s) => new Promise<void>((done) => {
      s.close(() => { done(); });
      s.closeAllConnections();
    })));
    if (handlerToClose !== null) await handlerToClose.close();
  };

  const doBind = async (): Promise<InboundBinding> => {
    const addresses = loopbackAddresses(deps.ipv6Available ?? true);
    const started: Server[] = [];
    let port = 0;
    try {
      for (const [index, address] of addresses.entries()) {
        const server = createServer((req: IncomingMessage, res: ServerResponse) => {
          // REQ-MCP-119: loopback only. The socket is already bound to a loopback address; the surface's own guards
          // refuse a foreign `Host`/`Origin` and a token that does not match, before the exchange is served.
          const serve = handler;
          if (serve === null) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32_000, message: 'The inbound surface is not bound' }, id: null })); return; }
          void serve(req, res).catch((error: unknown) => {
            deps.log(`inbound surface: a request failed: ${error instanceof Error ? error.message : String(error)}`, 'warn');
            if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32_000, message: 'Internal error' }, id: null })); }
          });
        });
        try {
          await new Promise<void>((resolve, reject) => {
            const onError = (error: Error) => { server.removeListener('listening', onListening); reject(error); };
            const onListening = () => { server.removeListener('error', onError); resolve(); };
            server.once('error', onError);
            server.once('listening', onListening);
            // Port 0 on the first bind asks the OS; the second bind reuses the first's port so both addresses serve one surface.
            server.listen(index === 0 ? 0 : port, address);
          });
        } catch (error) {
          // `::1` unavailable is not a failure of the surface; `127.0.0.1` unavailable is.
          if (index === 0) throw error;
          deps.log(`inbound surface: IPv6 loopback unavailable (${error instanceof Error ? error.message : String(error)}); serving 127.0.0.1 only (REQ-MCP-119)`, 'info');
          break;
        }
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) port = addr.port;
        started.push(server);
      }
      if (port === 0 || started.length === 0) throw new Error('the inbound surface bound no loopback address');
      servers = started;
      bound = { addresses: started.map((s) => (s.address() as AddressInfo).address), port };
      deps.log(`inbound surface bound to ${bound.addresses.join(', ')}:${port} (ephemeral, loopback only; REQ-MCP-119)`, 'info');
      return bound;
    } catch (error) {
      if (surface !== null) { await surface.close(); surface = null; handler = null; }
      await Promise.all(started.map((s) => new Promise<void>((done) => { s.close(() => done()); s.closeAllConnections(); })));
      throw error;
    }
  };

  return {
    binding: () => bound,
    /**
     * REQ-MCP-119/121: bind the surface. The guard is taken SYNCHRONOUSLY, so two overlapping binds cannot both pass it
     * and bind two servers on the same deps (`bound` alone would be set only after the first `await`, which is exactly the
     * window two presses could race through). The surface and its SDK handler are built HERE, one per bind.
     */
    bind: (): Promise<InboundBinding> => {
      if (bindingAttempt !== null) return Promise.reject(new Error('the inbound surface is already bound'));
      surface = createInboundSurface(deps);
      // REQ-MCP-119: `toNodeHandler` reads the request body under the SDK's own 4 MiB bound and converts the Node request
      // to the web-standard one the surface's `fetch` takes; `onerror` reports an entry-internal failure without changing
      // the answer. The SDK's duck-typed request shape declares `method?: string` where Node's own spells
      // `string | undefined`; the two are the same object (this cast states what the SDK's structural type intends and
      // Node's `exactOptionalPropertyTypes` refuses).
      handler = toNodeHandler(surface, { onerror: (error: Error) => deps.log(`inbound surface: ${error.message}`, 'warn') }) as (req: IncomingMessage, res: ServerResponse) => Promise<void>;
      const attempt = doBind();
      bindingAttempt = attempt;
      attempt.catch(() => { if (bindingAttempt === attempt) bindingAttempt = null; });
      return attempt;
    },
    unbind: async (): Promise<void> => {
      // A bind still in flight is awaited first, so an unbind never races the bind it is meant to undo.
      const inFlight = bindingAttempt;
      if (inFlight !== null) { await inFlight.catch(() => undefined); }
      if (bindingAttempt === inFlight) bindingAttempt = null;
      await closeAll();
    },
  };
}
