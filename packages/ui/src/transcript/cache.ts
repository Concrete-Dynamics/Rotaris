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
  // PD-CHAT-004: the SEGMENTS are what the line draws, so they are what its rendering is keyed on — a run
  // that gains a member changes a segment's counts, and a rendering keyed on the family word alone would
  // be reused for a line that now says something else.
  if (d.shape === 'group') return `${d.role} ${d.segments.map((s) => `${s.label}:${s.members}:${s.counts.ok}/${s.counts.failed}/${s.counts.blocked}/${s.counts.running}:${s.durationMs}:${s.tokens}`).join('|')} ${d.blob} ${d.durationMs} ${d.inFlight ?? ''} ${d.inFlightLabel ?? ''}`;
  const r = d.row;
  return `${r.kind} ${r.persona ?? ''} ${r.name ?? ''} ${r.ts} ${r.body} ${r.toolName ?? ''} ${r.toolStatus ?? ''} ${r.input ?? ''} ${r.output ?? ''} ${r.diff ?? ''} ${r.stalledSince ?? ''} ${r.chars ?? ''}`;
}

/**
 * ADR-0045's reuse predicate as one value. Null means "never reuse": a live row is redrawn every repaint
 * (REQ-CHAT-058), and a rendering that could go stale must not be keyed at all rather than keyed carelessly.
 */
export function reuseKey(
  d: DisplayRow, width: number, expanded: boolean, match: { start: number; end: number } | null,
  /**
   * REQ-CHAT-057's attribution and REQ-CHAT-067's auto-collapse are drawn from a row's PLACE among its
   * neighbours, so two renderings of an identical row differ when its place does. Found at the merge of Parts Z
   * and AA: without this, inserting a row above a block reused the rendering that drew attribution and the new
   * first row of the block silently lost its role line.
   */
  place?: { readonly blockStart: boolean; readonly recentTool: boolean } | undefined,
): string | null {
  if (isLive(d)) return null;
  return measureKey(d, width, expanded, match, place);
}

/**
 * The same four-part key, for a row in ANY state. This is what a HEIGHT is recorded under.
 *
 * **Measuring a row and reusing its drawing are different questions, and they were one key.** Rendering reuse
 * must refuse a live row: its elapsed time advances every second, so a cached drawing would freeze the clock,
 * which is REQ-CHAT-058's rule and is right. Measurement has no such reason — the row is in the DOM with a real
 * height, and refusing to read it does not keep anything fresh, it throws away the only accurate number there
 * is. Sharing one key meant a running group was positioned by `estimateHeight` for its whole life and drew three
 * wrapped segment lines into a 36 px allocation (docs/defects/live-rows-are-never-measured.md).
 *
 * The identity is everything before the first `|`, which is what lets a layout recover "whatever this row last
 * measured" from a key whose content part has since changed — the streaming case, where every chunk mints a key.
 */
export function measureKey(
  d: DisplayRow, width: number, expanded: boolean, match: { start: number; end: number } | null,
  place?: { readonly blockStart: boolean; readonly recentTool: boolean } | undefined,
): string {
  const p = place === undefined ? '' : `${place.blockStart ? 'b' : ''}${place.recentTool ? 'r' : ''}`;
  return `${d.key}|${hash(sourceTextOf(d))}|${Math.round(width)}|${expanded ? 'o' : 'c'}|${match === null ? '' : `${match.start}-${match.end}`}|${p}`;
}

/** The identity part of a `measureKey` — everything before the first separator. */
export function identityOf(key: string): string {
  const at = key.indexOf('|');
  return at === -1 ? key : key.slice(0, at);
}
