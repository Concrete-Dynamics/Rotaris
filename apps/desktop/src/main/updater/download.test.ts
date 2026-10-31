import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CHUNK_BYTES, measuredLabel, streamInChunks, type DownloadProgress } from './download.js';

async function* pieces(...parts: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const p of parts) yield p;
}
const bytes = (n: number, fill = 7) => Buffer.alloc(n, fill);

function sink(failAtWrite?: number) {
  const written: Uint8Array[] = [];
  return {
    written,
    sink: {
      write: async (chunk: Uint8Array) => {
        if (failAtWrite !== undefined && written.length === failAtWrite) throw new Error('ENOSPC: no space left on device');
        written.push(chunk);
      },
    },
  };
}

describe('download staging — REQ-STARTUP-124', () => {
  it('streams in 1 MiB chunks, whatever the size of the pieces the body arrives in, and hashes what it wrote', async () => {
    expect(CHUNK_BYTES).toBe(1_048_576);
    const body = Buffer.concat([bytes(700_000, 1), bytes(700_000, 2), bytes(1_000_000, 3)]);
    const progress: DownloadProgress[] = [];
    const s = sink();
    const out = await streamInChunks(pieces(body.subarray(0, 700_000), body.subarray(700_000, 1_400_000), body.subarray(1_400_000)), body.byteLength, s.sink, (p) => progress.push(p));
    expect(out).toEqual({ ok: true, bytes: body.byteLength, sha256: createHash('sha256').update(body).digest('hex') });
    expect(s.written.map((c) => c.byteLength)).toEqual([CHUNK_BYTES, CHUNK_BYTES, body.byteLength - 2 * CHUNK_BYTES]);
    expect(Buffer.concat(s.written).equals(body)).toBe(true);
    // Progress once per MiB received, plus the final settle report.
    expect(progress).toEqual([
      { bytesSoFar: CHUNK_BYTES, claimedTotal: body.byteLength },
      { bytesSoFar: 2 * CHUNK_BYTES, claimedTotal: body.byteLength },
      { bytesSoFar: body.byteLength, claimedTotal: body.byteLength },
    ]);
  });

  it('a body that arrives in one large piece is still written in 1 MiB chunks', async () => {
    const body = bytes(3 * CHUNK_BYTES + 5);
    const s = sink();
    const out = await streamInChunks(pieces(body), 0, s.sink, () => undefined);
    expect(out.ok).toBe(true);
    expect(s.written.map((c) => c.byteLength)).toEqual([CHUNK_BYTES, CHUNK_BYTES, CHUNK_BYTES, 5]);
  });

  it('a write failure ends the download as a write failure carrying the platform\'s error, and reports what was written so far', async () => {
    const s = sink(1);
    const progress: DownloadProgress[] = [];
    const out = await streamInChunks(pieces(bytes(2 * CHUNK_BYTES)), 2 * CHUNK_BYTES, s.sink, (p) => progress.push(p));
    expect(out).toEqual({ ok: false, why: 'write', error: 'ENOSPC: no space left on device' });
    expect(progress).toEqual([{ bytesSoFar: CHUNK_BYTES, claimedTotal: 2 * CHUNK_BYTES }]);
  });

  it('a body that fails mid-stream is a read failure; an aborted signal is an abort', async () => {
    async function* failing(): AsyncGenerator<Uint8Array> { yield bytes(10); throw new Error('ECONNRESET'); }
    expect(await streamInChunks(failing(), 0, sink().sink, () => undefined)).toEqual({ ok: false, why: 'read', error: 'ECONNRESET' });
    const controller = new AbortController();
    async function* slow(): AsyncGenerator<Uint8Array> { yield bytes(10); controller.abort(); yield bytes(10); }
    expect(await streamInChunks(slow(), 0, sink().sink, () => undefined, controller.signal)).toMatchObject({ ok: false, why: 'aborted' });
  });

  it('an empty body reports zero once and hashes the empty input', async () => {
    const progress: DownloadProgress[] = [];
    const out = await streamInChunks(pieces(), 0, sink().sink, (p) => progress.push(p));
    expect(out).toEqual({ ok: true, bytes: 0, sha256: createHash('sha256').digest('hex') });
    expect(progress).toEqual([{ bytesSoFar: 0, claimedTotal: 0 }]);
  });
});

describe('the size bound — REQ-STARTUP-169, REQ-STARTUP-179', () => {
  it('a body longer than a non-zero claimed size fails as oversized, and not one byte past the bound is written', async () => {
    const claimed = 2 * CHUNK_BYTES + 100;
    const s = sink();
    const progress: DownloadProgress[] = [];
    // Two whole chunks within the bound, then a piece that crosses it, then more the server would keep sending.
    const out = await streamInChunks(pieces(bytes(CHUNK_BYTES), bytes(CHUNK_BYTES), bytes(101), bytes(CHUNK_BYTES)), claimed, s.sink, (p) => progress.push(p));
    expect(out).toEqual({ ok: false, why: 'oversized', error: `the server sent more than the ${claimed} bytes the release feed states` });
    const writtenBytes = s.written.reduce((n, c) => n + c.byteLength, 0);
    expect(writtenBytes).toBe(2 * CHUNK_BYTES);
    expect(writtenBytes).toBeLessThanOrEqual(claimed);
    expect(progress.map((p) => p.bytesSoFar)).toEqual([CHUNK_BYTES, 2 * CHUNK_BYTES]);
  });

  it('a single piece already past the bound writes nothing, and the body is not read further', async () => {
    let yielded = 0;
    async function* endless(): AsyncGenerator<Uint8Array> { for (;;) { yielded += 1; yield bytes(CHUNK_BYTES + 1); } }
    const s = sink();
    expect(await streamInChunks(endless(), CHUNK_BYTES, s.sink, () => undefined)).toMatchObject({ ok: false, why: 'oversized' });
    expect(s.written).toEqual([]);
    expect(yielded).toBe(1);
  });

  it('a body of exactly the claimed size succeeds with its digest', async () => {
    const body = bytes(CHUNK_BYTES + 7, 5);
    const s = sink();
    const out = await streamInChunks(pieces(body.subarray(0, 500_000), body.subarray(500_000)), body.byteLength, s.sink, () => undefined);
    expect(out).toEqual({ ok: true, bytes: body.byteLength, sha256: createHash('sha256').update(body).digest('hex') });
    expect(Buffer.concat(s.written).equals(body)).toBe(true);
  });

  it('a transfer this function ends keeps its own reason when the body rejects as it is closed', async () => {
    // A cancelled web stream — what `electron.ts` hands in — reports `net::ERR_CONNECTION_RESET` from its close, and
    // closing the body is exactly how the bound is enforced. The refusal must not be relabelled a transport failure:
    // REQ-STARTUP-179 counts a bound refusal differently from one, and its sentence comes from that reason alone.
    function bodyThatRejectsOnClose(parts: Uint8Array[], message: string): AsyncIterable<Uint8Array> {
      let i = 0;
      return {
        [Symbol.asyncIterator]: () => ({
          next: async () => (i < parts.length ? { value: parts[i++]!, done: false } : { value: undefined, done: true }),
          return: async () => { throw new Error(message); },
        }),
      };
    }
    const claimed = 10;
    const s = sink();
    const out = await streamInChunks(bodyThatRejectsOnClose([bytes(50)], 'net::ERR_CONNECTION_RESET'), claimed, s.sink, () => undefined);
    expect(out).toEqual({ ok: false, why: 'oversized', error: `the server sent more than the ${claimed} bytes the release feed states` });
    expect(s.written).toEqual([]);

    // The same for a write failure and for an abandonment: each keeps its own reason across the close.
    const write = await streamInChunks(bodyThatRejectsOnClose([bytes(CHUNK_BYTES), bytes(1)], 'net::ERR_CONNECTION_RESET'), 0, sink(1).sink, () => undefined);
    expect(write).toMatchObject({ ok: false, why: 'write', error: 'ENOSPC: no space left on device' });

    const controller = new AbortController();
    const aborting = bodyThatRejectsOnClose([bytes(4)], 'net::ERR_CONNECTION_RESET');
    controller.abort();
    expect(await streamInChunks(aborting, 0, sink().sink, () => undefined, controller.signal)).toMatchObject({ ok: false, why: 'aborted' });

    // A body that really did fail on its own is still a read failure, close or no close.
    const broken: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => { throw new Error('ECONNRESET'); },
        return: async () => ({ value: undefined, done: true }),
      }),
    };
    expect(await streamInChunks(broken, 0, sink().sink, () => undefined)).toMatchObject({ ok: false, why: 'read', error: 'ECONNRESET' });
  });

  it('a claimed size of 0 leaves the body unbounded', async () => {
    const body = bytes(4 * CHUNK_BYTES + 3, 6);
    const progress: DownloadProgress[] = [];
    const out = await streamInChunks(pieces(body), 0, sink().sink, (p) => progress.push(p));
    expect(out).toEqual({ ok: true, bytes: body.byteLength, sha256: createHash('sha256').update(body).digest('hex') });
    expect(progress.map((p) => p.bytesSoFar)).toEqual([CHUNK_BYTES, 2 * CHUNK_BYTES, 3 * CHUNK_BYTES, 4 * CHUNK_BYTES, body.byteLength]);
  });
});

describe('the measured figure — REQ-STARTUP-118', () => {
  it('is the whole-number percentage of a stated size, fractional part discarded, never above 100', () => {
    expect(measuredLabel({ bytesSoFar: 0, claimedTotal: 1000 })).toBe('0%');
    expect(measuredLabel({ bytesSoFar: 999, claimedTotal: 1000 })).toBe('99%');
    expect(measuredLabel({ bytesSoFar: 1000, claimedTotal: 1000 })).toBe('100%');
    expect(measuredLabel({ bytesSoFar: 1200, claimedTotal: 1000 })).toBe('100%');
    expect(measuredLabel({ bytesSoFar: 1, claimedTotal: 3 })).toBe('33%');
  });

  it('is the whole number of MiB received, rendered `{N} MB`, when the claimed size is 0', () => {
    expect(measuredLabel({ bytesSoFar: 0, claimedTotal: 0 })).toBe('0 MB');
    expect(measuredLabel({ bytesSoFar: CHUNK_BYTES - 1, claimedTotal: 0 })).toBe('0 MB');
    expect(measuredLabel({ bytesSoFar: 5 * CHUNK_BYTES + 12, claimedTotal: 0 })).toBe('5 MB');
  });
});
