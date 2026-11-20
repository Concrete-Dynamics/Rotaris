import { createServer, type Server } from 'node:http';
import { err, ok, type Result, type Timers } from '@rotaris/kernel';
import { CANCELLED_BY_USER, cancellableWait } from './oauth.js';

/**
 * ADR-0030 consequence 3 / REQ-PROVIDER-029..031 — the loopback listener: a real HTTP server bound to
 * `127.0.0.1` only, on a port from the build-declared ordered list (never any other; an empty list asks the system
 * for an ephemeral one, the hosted provider's form), serving ONE callback path. Every other path is a 404. A state
 * mismatch is treated as cross-site request forgery: logged, and no code. However the wait ends — a code, a
 * cancellation, the timeout — `close()` is awaited before the sign-in call returns, so the port is released and a
 * sign-in started immediately afterwards binds the first port again.
 */
export const CALLBACK_WAIT_MS = 300_000;
export const AUTHENTICATION_TIMED_OUT = 'Authentication timed out';

export interface LoopbackOptions {
  /** Tried in order; empty means one ephemeral port. */
  readonly ports: readonly number[];
  readonly path: string;
  readonly state: string;
  readonly timers: Timers;
  readonly warn: (m: string) => void;
}

export interface LoopbackListener {
  readonly port: number;
  readonly redirectUri: string;
  /** The authorization code, or the reason there is none. Never rejects. */
  wait(signal?: AbortSignal, timeoutMs?: number): Promise<Result<string, string>>;
  /** Closes the listener and resolves once the port is released. Idempotent. */
  close(): Promise<void>;
}

function page(heading: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${heading}</title></head><body><h1>${heading}</h1><p>${body}</p></body></html>`;
}

function listen(server: Server, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const onError = (): void => { server.removeListener('listening', onListening); resolve(false); };
    const onListening = (): void => { server.removeListener('error', onError); resolve(true); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

export async function openLoopback(opts: LoopbackOptions): Promise<Result<LoopbackListener, string>> {
  let code: string | null = null;
  let failure: string | null = null;
  let settle: (() => void) | null = null;
  const arrived = new Promise<void>((resolve) => { settle = resolve; });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== opts.path) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
    const html = (status: number, heading: string, body: string): void => { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' }); res.end(page(heading, body)); };
    const error = url.searchParams.get('error');
    if (error !== null) {
      failure = url.searchParams.get('error_description') || error;
      html(400, 'Authentication Failed', 'You can close this tab.');
      settle?.();
      return;
    }
    const received = url.searchParams.get('code');
    if (received === null || received.length === 0) { html(400, 'Error', 'No code received.'); return; }
    if (url.searchParams.get('state') !== opts.state) {
      // REQ-PROVIDER-030: treated as CSRF — logged, and the flow yields no code.
      opts.warn('sign-in callback carried a state that does not match this sign-in; treated as cross-site request forgery and ignored');
      html(400, 'Error', 'No code received.');
      return;
    }
    code = received;
    html(200, 'Success!', 'You can close this tab.');
    settle?.();
  });

  const candidates = opts.ports.length > 0 ? opts.ports : [0];
  let bound = false;
  for (const port of candidates) {
    if (await listen(server, port)) { bound = true; break; }
  }
  if (!bound) return err(`Sign-in could not listen for the provider's answer: every port it may use is busy (tried ${candidates.join(', ')}). One of them must be free for sign-in to complete.`);
  const address = server.address();
  const port = address !== null && typeof address === 'object' ? address.port : 0;

  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closing ??= new Promise<void>((resolve) => {
      server.close(() => resolve());
      // A browser keeps its connection alive; without this the close waits for it.
      server.closeAllConnections();
    });
    return closing;
  };

  return ok({
    port,
    redirectUri: `http://localhost:${port}${opts.path}`,
    close,
    wait: async (signal, timeoutMs = CALLBACK_WAIT_MS) => {
      const abort = new AbortController();
      const onOuter = (): void => abort.abort();
      signal?.addEventListener('abort', onOuter, { once: true });
      if (signal?.aborted) abort.abort();
      const elapsed = cancellableWait(opts.timers, timeoutMs, abort.signal);
      await Promise.race([arrived, elapsed]);
      const cancelled = signal?.aborted === true;
      abort.abort();
      signal?.removeEventListener('abort', onOuter);
      await elapsed;
      if (code !== null) return ok(code);
      if (failure !== null) return err(failure);
      return err(cancelled ? CANCELLED_BY_USER : AUTHENTICATION_TIMED_OUT);
    },
  });
}
