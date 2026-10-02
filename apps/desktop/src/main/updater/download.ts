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

export type StreamOutcome =
  | { readonly ok: true; readonly bytes: number; readonly sha256: string }
  | { readonly ok: false; readonly why: 'write' | 'read' | 'aborted'; readonly error: string };

/**
 * Read the body, write it in 1 MiB chunks, hash each chunk as it is written, and report `(bytes_so_far, claimed_total)`
 * no more often than once per 1 MiB received — plus the final settle report when the last partial chunk lands. The
 * caller decides what to do with the partial file on a failure (REQ-STARTUP-124: delete it, fail with its sentence).
 */
export async function streamInChunks(body: AsyncIterable<Uint8Array>, claimedTotal: number, sink: DownloadSink, onProgress: (p: DownloadProgress) => void, signal?: AbortSignal): Promise<StreamOutcome> {
  const hash = createHash('sha256');
  let buffered: Uint8Array[] = [];
  let bufferedBytes = 0;
  let written = 0;
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
      if (signal?.aborted) return { ok: false, why: 'aborted', error: 'the download was abandoned' };
      let offset = 0;
      while (offset < piece.byteLength) {
        const take = Math.min(CHUNK_BYTES - bufferedBytes, piece.byteLength - offset);
        buffered.push(piece.subarray(offset, offset + take));
        bufferedBytes += take;
        offset += take;
        if (bufferedBytes === CHUNK_BYTES) {
          try { await flush(); } catch (cause) { return { ok: false, why: 'write', error: messageOf(cause) }; }
        }
      }
    }
    if (signal?.aborted) return { ok: false, why: 'aborted', error: 'the download was abandoned' };
    try { await flush(); } catch (cause) { return { ok: false, why: 'write', error: messageOf(cause) }; }
  } catch (cause) {
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
