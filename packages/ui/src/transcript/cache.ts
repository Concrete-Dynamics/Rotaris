import { RENDER_CACHE_CHARACTERS, RENDER_CACHE_ENTRIES } from './constants.js';
import { hash, isLive } from './project.js';
import type { DisplayRow } from './types.js';

/**
 * REQ-CHAT-058 — the two bounded caches with least-recently-used eviction: retained row MEASUREMENTS and retained
 * row RENDERINGS. ADR-0045's reuse predicate is four-part and all four parts are in the key:
 *
 *   **identity · content · the width it was laid out for · expansion state**
 *
 * so that inserting, removing or reordering rows can never make one row display another row's content — which is
 * the failure both records warn about and the one neither branch's typecheck can see. A LIVE row (a running tool,
 * verifier or group, or reasoning still streaming) is never reused: `reuseKey` returns null for it, so it is
 * redrawn on every repaint and its elapsed time keeps advancing. A theme switch redraws every row and preserves
 * every expansion state, which is `clear()` on the rendering cache and nothing at all on the expansion map.
 *
 * REQ-UIBENCH-063 and REQ-UIBENCH-086 give the rendering cache an OBSERVABLE capacity — 256 entries and two
 * million characters, where characters count the SOURCE text an item was rendered from — and running hit and miss
 * totals over the life of the process, which is why they are counters on the object rather than local variables.
 */
export interface TranscriptCacheStats {
  readonly entries: number;
  readonly characters: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
}

export class LruCache<V> {
  private readonly map = new Map<string, { value: V; chars: number }>();
  private chars = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(private readonly maxEntries: number, private readonly maxCharacters: number) {}

  get(key: string): V | undefined {
    const held = this.map.get(key);
    if (held === undefined) { this.misses += 1; return undefined; }
    // Least-recently-used order is insertion order in a Map, so a hit is a delete and a re-set.
    this.map.delete(key);
    this.map.set(key, held);
    this.hits += 1;
    return held.value;
  }

  /**
   * A read that moves no recency and counts no hit — what a layout pass uses, so that reading a measurement while
   * laying out is a pure read. `get` is the reader that participates in the LRU and in the observable totals.
   */
  peek(key: string): V | undefined {
    return this.map.get(key)?.value;
  }

  set(key: string, value: V, sourceCharacters: number): void {
    const held = this.map.get(key);
    if (held !== undefined) { this.chars -= held.chars; this.map.delete(key); }
    this.map.set(key, { value, chars: sourceCharacters });
    this.chars += sourceCharacters;
    while (this.map.size > this.maxEntries || (this.chars > this.maxCharacters && this.map.size > 1)) {
      const oldest = this.map.keys().next();
      if (oldest.done === true) break;
      const dropped = this.map.get(oldest.value)!;
      this.map.delete(oldest.value);
      this.chars -= dropped.chars;
      this.evictions += 1;
    }
  }

  clear(): void {
    this.map.clear();
    this.chars = 0;
  }

  get stats(): TranscriptCacheStats {
    return { entries: this.map.size, characters: this.chars, hits: this.hits, misses: this.misses, evictions: this.evictions };
  }
}

/** The measurement cache is keyed by the same four-part key; a height is a number, and its source count is zero. */
export const MEASUREMENT_CACHE_ENTRIES = 4096;

export function createRenderCache<V>(): LruCache<V> {
  return new LruCache<V>(RENDER_CACHE_ENTRIES, RENDER_CACHE_CHARACTERS);
}
export function createMeasurementCache(): LruCache<number> {
  return new LruCache<number>(MEASUREMENT_CACHE_ENTRIES, Number.MAX_SAFE_INTEGER);
}

/** The source text a displayed row is rendered from — REQ-UIBENCH-086's "characters" and the cache's content part. */
export function sourceTextOf(d: DisplayRow): string {
  if (d.shape === 'trailer') return `${d.trailer.role} ${d.trailer.text}`;
  if (d.shape === 'group') return `${d.family} ${d.blob} ${d.counts.ok}/${d.counts.failed}/${d.counts.blocked}/${d.counts.running} ${d.durationMs} ${d.inFlight ?? ''}`;
  const r = d.row;
  return `${r.kind} ${r.persona ?? ''} ${r.name ?? ''} ${r.ts} ${r.body} ${r.toolName ?? ''} ${r.toolStatus ?? ''} ${r.input ?? ''} ${r.output ?? ''} ${r.diff ?? ''} ${r.stalledSince ?? ''} ${r.chars ?? ''}`;
}

/**
 * ADR-0045's reuse predicate as one value. Null means "never reuse": a live row is redrawn every repaint
 * (REQ-CHAT-058), and a rendering that could go stale must not be keyed at all rather than keyed carelessly.
 */
export function reuseKey(d: DisplayRow, width: number, expanded: boolean, match: { start: number; end: number } | null): string | null {
  if (isLive(d)) return null;
  return `${d.key}|${hash(sourceTextOf(d))}|${Math.round(width)}|${expanded ? 'o' : 'c'}|${match === null ? '' : `${match.start}-${match.end}`}`;
}
