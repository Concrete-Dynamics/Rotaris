/**
 * `pnpm mockup` serves the design material from the repository on every platform. Until 2026-10-02 its two roots were
 * URL pathnames with the leading slash stripped, which on Linux and macOS made them relative to the working directory, so
 * started from the repository (as `AGENTS.md` and `docs/design/README.md` §7 say) every request answered `not found: /`
 * (docs/defects/fixed/pnpm-mockup-serves-not-found-on-linux-unless-started-from-the-root.md). The server here is started
 * with the repository as the working directory, which is where vitest runs.
 */
import { request } from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { isAbsolute } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { design, icons, serve } from './mockup.mjs';

let server: Server;
let port: number;

beforeAll(async () => {
  server = (await serve(0)) as Server;
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((done) => { server.close(() => done()); }));

/** A raw GET: the path is sent as written, so `..` reaches the server rather than being folded by a URL parser. */
function get(path: string): Promise<{ status: number; body: string }> {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => done({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', fail);
    req.end();
  });
}

describe('pnpm mockup — served from the repository root', () => {
  it('builds both roots as absolute platform paths', () => {
    expect(process.cwd()).not.toBe('/');
    expect(isAbsolute(design as string)).toBe(true);
    expect(isAbsolute(icons as string)).toBe(true);
  });

  it('answers / with the mockup and the injected shim', async () => {
    const { status, body } = await get('/');
    expect(status).toBe(200);
    expect(body).toContain('#mockup-picker');
    expect(body).toContain('<link rel="stylesheet" href="/icons/regular/style.css">');
  });

  it('serves the icon font\'s stylesheet', async () => {
    const { status } = await get('/icons/regular/style.css');
    expect(status).toBe(200);
  });

  it('refuses a path that climbs out of either root', async () => {
    expect((await get('/../package.json')).status).toBe(403);
    expect((await get('/icons/../../../../package.json')).status).toBe(403);
    expect((await get('/%2e%2e/package.json')).status).toBe(403);
  });
});
