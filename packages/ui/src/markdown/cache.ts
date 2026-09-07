import { parseMarkdown, type Document } from './parse.js';

/**
 * ADR-0051's **parse cache**: keyed on SOURCE TEXT alone, which is what makes the reported character figure
 * meaningful and comparable to its stated maximum. `REQ-UIBENCH-063` and `REQ-UIBENCH-086` fix the observable
 * capacity — 256 entries and two million characters, where characters count the **source** text an item was
 * rendered from — and make `hits` and `misses` running totals over the life of the process that never
 * decrease.
 *
 * Eviction is least-recently-used, and both bounds are enforced: an insert that would exceed either evicts
 * from the least-recently-used end until both hold. A single source longer than the whole character bound is
 * parsed and returned without being retained, so one outsized body can never empty the working set.
 *
 * ADR-0051's live-row rule — a live row reads the cache but does not insert into it — is the transcript's to
 * apply when it consumes this module; `parse()` inserts, `peek()` does not, and both count.
 */
export const PARSE_CACHE_ENTRIES = 256;
export const PARSE_CACHE_CHARS = 2_000_000;

export interface CacheStats {
  readonly entries: number;
  readonly chars: number;
  readonly hits: number;
  readonly misses: number;
}

export class MarkdownCache {
  /** Insertion order IS recency: a hit deletes and re-sets, so the first key is the least recently used. */
  private readonly items = new Map<string, Document>();
  private chars = 0;
  private hitCount = 0;
  private missCount = 0;

  constructor(private readonly maxEntries = PARSE_CACHE_ENTRIES, private readonly maxChars = PARSE_CACHE_CHARS) {}

  stats(): CacheStats {
    return { entries: this.items.size, chars: this.chars, hits: this.hitCount, misses: this.missCount };
  }

  /** A hit, recorded and promoted; a miss parses, retains and records. */
  parse(source: string): Document {
    const found = this.items.get(source);
    if (found) {
      this.hitCount += 1;
      this.items.delete(source);
      this.items.set(source, found);
      return found;
    }
    this.missCount += 1;
    const parsed = parseMarkdown(source);
    this.retain(source, parsed);
    return parsed;
  }

  /** ADR-0051's live row: reads the cache, never inserts into it; the totals still move. */
  peek(source: string): Document {
    const found = this.items.get(source);
    if (found) { this.hitCount += 1; this.items.delete(source); this.items.set(source, found); return found; }
    this.missCount += 1;
    return parseMarkdown(source);
  }

  private retain(source: string, parsed: Document): void {
    if (source.length > this.maxChars) return;
    this.items.set(source, parsed);
    this.chars += source.length;
    while (this.items.size > this.maxEntries || this.chars > this.maxChars) {
      const oldest = this.items.keys().next();
      if (oldest.done) break;
      this.items.delete(oldest.value);
      this.chars -= oldest.value.length;
    }
  }
}

/** One cache per renderer process, as the benchmark reports it (`REQ-UIBENCH-063`'s totals are process-wide). */
export const markdownCache = new MarkdownCache();
