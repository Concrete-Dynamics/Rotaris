import type { DisplayRow } from './types.js';

/**
 * REQ-CHAT-074 — transcript search: case-folded substring over **role + text + tool name + detail**, and for a
 * group header over **role + family + the capped member blob**, so a hit inside a collapsed group lands on its
 * visible header. Indexed against DISPLAYED rows, which is why it lives beside step 4 and is invalidated by it.
 *
 * **Invalidated is not recomputed whole** (ADR-0046). Matching is independent per row, so the match set is updated
 * over the same changed suffix step 4 re-projected; only a cap or a grouping change re-matches the window. A
 * search that could only be recomputed by a full forward scan would put step 4's cost back on the resident window
 * whenever the panel happened to be open, which is exactly what REQ-MONITOR-223's comparison against an empty
 * session forbids.
 */
export interface Match {
  /** Position in the displayed array. */
  readonly at: number;
  readonly key: string;
  /** The range inside `bodyOf(display)`, or null when the hit is in the role or the tool name rather than the body. */
  readonly range: { readonly start: number; readonly end: number } | null;
}

/** The text a hit is HIGHLIGHTED in — what Part AA paints the match on. */
export function bodyOf(d: DisplayRow): string {
  if (d.shape === 'trailer') return d.trailer.text;
  if (d.shape === 'group') return d.blob;
  return d.row.body;
}

/** The text a hit is DETECTED in (REQ-CHAT-074's four fields, and a group's three). */
export function haystackOf(d: DisplayRow): string {
  if (d.shape === 'trailer') return `${d.trailer.role}\n${d.trailer.text}`;
  // PD-CHAT-004: every segment's activity word is searchable, not only the first — a run that read and then
  // ran a command must be findable by either word, and its family field carries only the first.
  if (d.shape === 'group') return `${d.role}\n${d.members[0]?.name ?? ''}\n${d.segments.map((s) => s.label).join('\n')}\n${d.blob}`;
  const r = d.row;
  return `${r.persona ?? r.name ?? r.kind}\n${r.body}\n${r.toolName ?? ''}\n${r.output ?? ''}`;
}

/** One row's match, or null. Case folding is `toLowerCase`, which is not locale-sensitive for the ASCII the fixture uses. */
export function matchRow(d: DisplayRow, at: number, needle: string): Match | null {
  if (needle === '') return null;
  const q = needle.toLowerCase();
  if (!haystackOf(d).toLowerCase().includes(q)) return null;
  const body = bodyOf(d).toLowerCase();
  const start = body.indexOf(q);
  return { at, key: d.key, range: start === -1 ? null : { start, end: start + q.length } };
}

/** The whole index. Used on a query change and on a cap or grouping change; an ordinary update updates a suffix. */
export function indexAll(display: readonly DisplayRow[], needle: string): Match[] {
  const out: Match[] = [];
  for (let i = 0; i < display.length; i += 1) {
    const m = matchRow(display[i]!, i, needle);
    if (m !== null) out.push(m);
  }
  return out;
}

/**
 * The incremental form: the matches below `fromDisplayIndex` are kept, and only the changed suffix is re-matched.
 * This is the shape ADR-0046 requires — "the match set is updated over the same changed suffix step 4
 * re-projected" — and is what keeps the panel being open off step 4's cost.
 */
export function indexSuffix(previous: readonly Match[], display: readonly DisplayRow[], needle: string, fromDisplayIndex: number): Match[] {
  const kept = previous.filter((m) => m.at < fromDisplayIndex);
  const out = [...kept];
  for (let i = fromDisplayIndex; i < display.length; i += 1) {
    const m = matchRow(display[i]!, i, needle);
    if (m !== null) out.push(m);
  }
  return out;
}

/** REQ-CHAT-074: "X of Y" or "0 results". REQ-CHAT-168 binds it — the count is written for the count it carries. */
export function countLabel(total: number, current: number): string {
  if (total === 0) return '0 results';
  return `${current + 1} of ${total}`;
}

/** REQ-CHAT-074: navigation wraps in both directions. */
export function step(current: number, total: number, direction: 1 | -1): number {
  if (total === 0) return 0;
  return (current + direction + total) % total;
}
