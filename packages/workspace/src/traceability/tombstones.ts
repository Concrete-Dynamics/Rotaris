import { identifierOf } from './identifiers.js';

/**
 * The retired-identifier log (REQ-TRACE-130 to REQ-TRACE-141): append-only, tab-separated `<id>\t<date>\t<title>`,
 * parsed tolerantly because people edit it by hand (135) — a malformed line is skipped and never fatal — rendered
 * in ascending number order under a header making the three statements of 130, and written by the owner through
 * the atomic replace of REQ-TRACE-061 BEFORE the new artifact (133).
 */
export interface Tombstone { readonly number: number; readonly id: string; readonly date: string; readonly title: string }

export function tombstoneHeader(prefix: string): string {
  return [
    '# Retired requirement identifiers (append-only).',
    '# These entries are the sole surviving evidence that a since-deleted identifier was ever issued.',
    '# Any attempt to claim a retired identifier again is rejected by the store parse (REQ-TRACE-134).',
    `# Identifiers are never handed out a second time; a deleted ${prefix}-<n> leaves a permanent gap (REQ-TRACE-024).`,
    '# One record per line: <identifier><TAB><retirement date, ISO 8601><TAB><last known title>.',
  ].join('\n');
}

/**
 * REQ-TRACE-135: strip; skip blanks and `#` comments; split on tab; at least two fields; the first field begins
 * case-insensitively with the prefix and the remainder after the prefix is all digits; the title is the third field
 * when present. A later duplicate line for the same number overwrites an earlier one.
 */
export function parseTombstones(text: string | null, prefix: string): Map<number, Tombstone> {
  const out = new Map<number, Tombstone>();
  if (text === null) return out;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const fields = line.split('\t');
    if (fields.length < 2) continue;
    const idText = fields[0]!.trim();
    if (!idText.toUpperCase().startsWith(`${prefix.toUpperCase()}-`)) continue;
    const digits = idText.slice(prefix.length + 1);
    if (!/^[0-9]+$/.test(digits)) continue;
    const number = Number(digits);
    out.set(number, { number, id: identifierOf(prefix, number), date: fields[1]!.trim(), title: (fields[2] ?? '').trim() });
  }
  return out;
}

/** REQ-TRACE-137: the header, then one record per identifier ascending, each newline-terminated, LF. */
export function renderTombstones(entries: ReadonlyMap<number, Tombstone>, prefix: string): string {
  const lines = [tombstoneHeader(prefix)];
  for (const n of [...entries.keys()].sort((a, b) => a - b)) {
    const t = entries.get(n)!;
    lines.push(`${identifierOf(prefix, n)}\t${t.date}\t${t.title}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * REQ-TRACE-139: identifiers present in the previous generation, absent from the live set, and not already
 * tombstoned — sorted. REQ-TRACE-138's recovery is the caller's (artifact.ts); a failed read yields no entries.
 */
export function detectRetired(previous: readonly { readonly number: number; readonly title: string }[], live: ReadonlySet<number>, tombstoned: ReadonlyMap<number, Tombstone>): { readonly number: number; readonly title: string }[] {
  const seen = new Set<number>();
  const out: { number: number; title: string }[] = [];
  for (const p of previous) {
    if (live.has(p.number) || tombstoned.has(p.number) || seen.has(p.number)) continue;
    seen.add(p.number);
    out.push({ number: p.number, title: p.title });
  }
  return out.sort((a, b) => a.number - b.number);
}

/** REQ-TRACE-136/140: an existing record is kept and the incoming one discarded; new retirements take `today`. */
export function mergeTombstones(existing: ReadonlyMap<number, Tombstone>, retired: readonly { readonly number: number; readonly title: string }[], today: string, prefix: string): Map<number, Tombstone> {
  const out = new Map(existing);
  for (const r of retired) if (!out.has(r.number)) out.set(r.number, { number: r.number, id: identifierOf(prefix, r.number), date: today, title: r.title });
  return out;
}
