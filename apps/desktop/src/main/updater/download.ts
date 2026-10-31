import { createHash } from 'node:crypto';

/**
 * REQ-STARTUP-118, REQ-STARTUP-124 — streaming a release asset into staging in 1 MiB chunks, which is also the
 * hashing granularity, and what the progress figure reads while it runs. Pure over an async byte source and a sink,
 * so the whole path runs in a test with no network and no disk.
 */
export const CHUNK_BYTES = 1_048_576;

export interface DownloadSink {
  /** Append one chunk. A rejection is REQ-STARTUP-124's write failure and ends the download. */
  write(chunk: Uint8Array): Promise<void>;
}

export interface DownloadProgress {
  readonly bytesSoFar: number;
  /** The size the feed stated for the asset, or 0 when it stated none. */
  readonly claimedTotal: number;
}

/**
 * `oversized` is REQ-STARTUP-169's bound, kept apart from `read`: the transfer did not fail, the server sent more than
 * the release feed states, which REQ-STARTUP-179 counts among the integrity refusals (not retried for that release by the
 * same process) rather than among the transport failures. The caller words it and decides the retry from `why` alone.
 */
export type StreamOutcome =
  | { readonly ok: true; readonly bytes: number; readonly sha256: string }
  | { readonly ok: false; readonly why: 'write' | 'read' | 'aborted' | 'oversized'; readonly error: string };

/**
 * Read the body, write it in 1 MiB chunks, hash each chunk as it is written, and report `(bytes_so_far, claimed_total)`
 * no more often than once per 1 MiB received — plus the final settle report when the last partial chunk lands. The
 * caller decides what to do with the partial file on a failure (REQ-STARTUP-124: delete it, fail with its sentence).
 *
 * REQ-STARTUP-169: with a non-zero `claimedTotal`, a piece that would take what was received past it ends the transfer
 * as `oversized` before any of that piece is buffered, so not one byte past the bound reaches the sink (returning out of
 * the loop closes the body's iterator, which is what ends the transfer); what was written before it is within the
 * bound, and the caller discards it as on any other failure. A `claimedTotal` of 0 is
 * a feed that stated no size, and the body is unbounded as before (REQ-STARTUP-118's `{N} MB`).
 *
 * A transfer this function ends itself leaves through the body's iterator, and closing that iterator can itself reject —
 * a cancelled web stream reports `net::ERR_CONNECTION_RESET`, which is what `electron.ts` hands in. That rejection arrives
 * at the `catch` below, which would otherwise report the transfer as a read failure and lose why it really ended;
 * `ended` carries the outcome across the close, because REQ-STARTUP-179 counts a bound refusal, a write failure and an
 * abandonment differently from a transport failure (and `install.ts` words each one).
 */
export async function streamInChunks(body: AsyncIterable<Uint8Array>, claimedTotal: number, sink: DownloadSink, onProgress: (p: DownloadProgress) => void, signal?: AbortSignal): Promise<StreamOutcome> {
  const hash = createHash('sha256');
  let buffered: Uint8Array[] = [];
  let bufferedBytes = 0;
  let written = 0;
  let received = 0;
  /** The reason this function ended the transfer, kept across the body's own close. */
  let ended: { readonly why: 'write' | 'oversized' | 'aborted'; readonly error: string } | null = null;
  const flush = async (): Promise<void> => {
    if (bufferedBytes === 0) return;
    const chunk = buffered.length === 1 ? buffered[0]! : Buffer.concat(buffered, bufferedBytes);
    buffered = [];
    bufferedBytes = 0;
    await sink.write(chunk);
    hash.update(chunk);
    written += chunk.byteLength;
    onProgress({ bytesSoFar: written, claimedTotal });
  };
  try {
    for await (const piece of body) {
      if (signal?.aborted) {
        ended = { why: 'aborted', error: 'the download was abandoned' };
        return { ok: false, why: 'aborted', error: ended.error };
      }
      received += piece.byteLength;
      if (claimedTotal > 0 && received > claimedTotal) {
        ended = { why: 'oversized', error: `the server sent more than the ${claimedTotal} bytes the release feed states` };
        return { ok: false, why: 'oversized', error: ended.error };
      }
      let offset = 0;
      while (offset < piece.byteLength) {
        const take = Math.min(CHUNK_BYTES - bufferedBytes, piece.byteLength - offset);
        buffered.push(piece.subarray(offset, offset + take));
        bufferedBytes += take;
        offset += take;
        if (bufferedBytes === CHUNK_BYTES) {
          try { await flush(); } catch (cause) { ended = { why: 'write', error: messageOf(cause) }; return { ok: false, why: 'write', error: ended.error }; }
        }
      }
    }
    if (signal?.aborted) {
      ended = { why: 'aborted', error: 'the download was abandoned' };
      return { ok: false, why: 'aborted', error: ended.error };
    }
    try { await flush(); } catch (cause) { ended = { why: 'write', error: messageOf(cause) }; return { ok: false, why: 'write', error: ended.error }; }
  } catch (cause) {
    // A close that failed is not the reason the transfer ended, when this function ended it; `ended` wins.
    if (ended !== null) return { ok: false, why: ended.why, error: ended.error };
    return { ok: false, why: signal?.aborted ? 'aborted' : 'read', error: messageOf(cause) };
  }
  if (written === 0) onProgress({ bytesSoFar: 0, claimedTotal });
  return { ok: true, bytes: written, sha256: hash.digest('hex') };
}

/**
 * REQ-STARTUP-118's `{measured}`: with a non-zero claimed size, the received share as a whole-number percentage with
 * the fractional part discarded (REQ-STARTUP-092's convention); with a claimed size of 0, the whole number of MiB
 * received, rendered `{N} MB`. The caller repaints only when this string changes.
 */
export function measuredLabel(p: DownloadProgress): string {
  if (p.claimedTotal > 0) return `${Math.min(100, Math.floor((p.bytesSoFar * 100) / p.claimedTotal))}%`;
  return `${Math.floor(p.bytesSoFar / CHUNK_BYTES)} MB`;
}

export function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
