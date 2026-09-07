import { createServer, type Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import { getGlobalDispatcher, ProxyAgent, setGlobalDispatcher } from 'undici';
import { directFetch } from './direct-fetch.js';

const listen = (server: Server): Promise<number> => new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => { const address = server.address(); if (address && typeof address === 'object') resolve(address.port); });
});
const close = (server: Server): Promise<void> => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });

describe('OQ-37 direct fetch transport', () => {
  it('selects the target directly even when the process global dispatcher routes through a proxy', async () => {
    let targetRequests = 0;
    let proxyConnections = 0;
    const target = createServer((_req, res) => { targetRequests += 1; res.end('direct'); });
    const proxy = createServer();
    proxy.on('connect', (_req, socket) => { proxyConnections += 1; socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n'); });
    const targetPort = await listen(target);
    const proxyPort = await listen(proxy);
    const previous = getGlobalDispatcher();
    const proxyAgent = new ProxyAgent(`http://127.0.0.1:${proxyPort}`);
    setGlobalDispatcher(proxyAgent);
    try {
      const url = `http://127.0.0.1:${targetPort}/`;
      expect(await (await directFetch(url)).text()).toBe('direct');
      expect(targetRequests).toBe(1);
      expect(proxyConnections).toBe(0);
      await expect(fetch(url)).rejects.toThrow();
      expect(proxyConnections).toBeGreaterThan(0);
      expect(targetRequests).toBe(1);
    } finally {
      setGlobalDispatcher(previous);
      await proxyAgent.close();
      await Promise.all([close(target), close(proxy)]);
    }
  });
});
