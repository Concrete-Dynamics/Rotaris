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

  /**
   * `onEvict` hears every key the bound pushes out. The measurement caches report it to the offset table's ledger
   * (`pool.ts`'s `MeasureLedger`): a height that falls out of a cache changes what the table reads for that row exactly
   * as a new measurement does, and the table only re-reads the rows it is told about.
   */
  constructor(private readonly maxEntries: number, private readonly maxCharacters: number, private readonly onEvict?: (key: string) => void) {}

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
      this.onEvict?.(oldest.value);
    }
  }

  clear(): void {
    if (this.onEvict !== undefined) for (const key of this.map.keys()) this.onEvict(key);
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
export function createMeasurementCache(onEvict?: (key: string) => void): LruCache<number> {
  return new LruCache<number>(MEASUREMENT_CACHE_ENTRIES, Number.MAX_SAFE_INTEGER, onEvict);
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
 * The content part of a key, held against the row object it was taken from.
 *
 * REQ-CHAT-055 fixes appending at depth as costing no more than appending to an empty transcript, and the
 * pane was paying the whole transcript for every append: `TranscriptPane` builds one `measureKey` per
 * DISPLAYED row on each render, each key hashes `sourceTextOf`, and `sourceTextOf` for a row concatenates
 * its body, input, output and diff. One appended row therefore re-hashed 1,200 rows' text — work that
 * grows with depth by construction, which is exactly the growth the requirement forbids. Measured on this
 * branch before the memo: appending at 1,200 rows showed in **62.4 ms** against **37.9 ms** empty, past
 * the one-frame slack, and a second run of four passed at 45.8 against 29.7, which is the marginal,
 * sometimes-red distribution the defect note recorded.
 *
 * The memo is keyed on the row OBJECT because the replica replaces a changed row rather than mutating it
 * (`ui-core/replica.ts` upserts by index and keeps the untouched objects), so object identity is a sound
 * proxy for "this content has not changed". A row that changes is a new object and misses, which is the
 * only case that should pay. `WeakMap` means the entries leave with the rows and nothing needs evicting.
 *
 * Only the `row` shape is held. A group's text is rebuilt from `segments` on every projection, so its
 * object identity says nothing; a group is a folded RUN and there are few of them beside the rows.
 */
const rowSourceHashes = new WeakMap<object, string>();

function sourceHashOf(d: DisplayRow): string {
  if (d.shape !== 'row') return hash(sourceTextOf(d));
  const held = rowSourceHashes.get(d.row);
  if (held !== undefined) return held;
  const computed = hash(sourceTextOf(d));
  rowSourceHashes.set(d.row, computed);
  return computed;
}

/**
 * The whole key, for the one call shape the height pass makes — no match, no place.
 *
 * That pass is the one REQ-CHAT-055 measures: `TranscriptPane` builds a key per displayed row on every
 * render to look its height up, so at 1,200 rows an append built 1,200 template strings on top of the
 * hashing `sourceHashOf` now holds. Width and expansion are part of the key and both can change without
 * the row changing, so they are stored beside it and compared rather than assumed.
 */
const rowFullKeys = new WeakMap<object, { width: number; expanded: boolean; key: string }>();

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
  const plain = match === null && place === undefined && d.shape === 'row';
  if (plain) {
    const held = rowFullKeys.get(d.row);
    if (held !== undefined && held.width === width && held.expanded === expanded) return held.key;
  }
  const key = `${d.key}|${sourceHashOf(d)}|${Math.round(width)}|${expanded ? 'o' : 'c'}|${match === null ? '' : `${match.start}-${match.end}`}|${p}`;
  if (plain) rowFullKeys.set(d.row, { width, expanded, key });
  return key;
}

/** The identity part of a `measureKey` — everything before the first separator. */
export function identityOf(key: string): string {
  const at = key.indexOf('|');
  return at === -1 ? key : key.slice(0, at);
}
