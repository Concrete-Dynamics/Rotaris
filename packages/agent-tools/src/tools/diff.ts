import { splitLines } from './lines.js';

/**
 * REQ-CHAT-050: the user-only edit-diff row's text form — a header `<path>[ [Created]] +A -R`, then one
 * `[<line>]± <text>` line per changed line, at most 50 changed lines before "… +N more lines, diff
 * truncated". Computed by a plain line LCS; never shown to a model (REQ-TOOLS-135).
 */
export const DIFF_LINE_CAP = 50;

export interface Change { readonly line: number; readonly sign: '+' | '-'; readonly text: string }

/** Bound on the LCS table's cells, so a large change does not cost O(n·m) memory beyond reason. */
const LCS_CELLS = 4_000_000;
/** Bound on the changed lines the shortest-edit search looks for past the table's bound: O(D²) memory, O((n+m)·D) time. */
const EDIT_DISTANCE_BOUND = 2_000;

type Op = '=' | '-' | '+';

/**
 * Myers' shortest edit script (1986), for a changed region past the table's bound: the same number of added and removed
 * lines the LCS gives, found in time and memory that grow with the lines changed rather than with the region's area. Null
 * when more than `bound` lines changed.
 */
function shortestEdit(before: readonly string[], after: readonly string[], bound: number): Op[] | null {
  const n = before.length;
  const m = after.length;
  const offset = n + m + 1;
  const v = new Int32Array(2 * offset + 1);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= Math.min(n + m, bound) && found < 0; d += 1) {
    // The furthest x on each diagonal after step d − 1, for k in [−d − 1, d + 1].
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && before[x] === after[y]) { x += 1; y += 1; }
      v[offset + k] = x;
      if (x >= n && y >= m) { found = d; break; }
    }
  }
  if (found < 0) return null;
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = found; d >= 0; d -= 1) {
    const at = (k: number): number => trace[d]![k + d + 1]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : at(prevK);
    const prevY = d === 0 ? 0 : prevX - prevK;
    while (x > prevX && y > prevY) { ops.push('='); x -= 1; y -= 1; }
    if (d > 0) ops.push(x === prevX ? '+' : '-');
    x = prevX;
    y = prevY;
  }
  return ops.reverse();
}

/** The script's changes, each run between two kept lines drawn removed lines first, as the table's walk draws them. */
function changesOf(ops: readonly Op[], before: readonly string[], after: readonly string[], head: number): Change[] {
  const out: Change[] = [];
  let i = 0;
  let j = 0;
  let removed: Change[] = [];
  let added: Change[] = [];
  const flush = (): void => { out.push(...removed, ...added); removed = []; added = []; };
  for (const op of ops) {
    if (op === '=') { flush(); i += 1; j += 1; }
    else if (op === '-') { removed.push({ line: head + i + 1, sign: '-', text: before[i] as string }); i += 1; }
    else { added.push({ line: head + j + 1, sign: '+', text: after[j] as string }); j += 1; }
  }
  flush();
  return out;
}

/**
 * The changed lines, numbered in the file they belong to (`-` in the before, `+` in the after). The lines the two sides
 * share at the start and at the end are taken off first, so the table spans the changed region alone and a one-line edit
 * to a file of any length costs one cell. Until 2026-10-06 the table spanned the whole file, and past the bound (about
 * 2000 lines a side) every line read as removed and added: a one-line edit to a 2,001-line file drew `+2001 -2001` and
 * the file's first 50 lines (docs/defects/fixed/an-edit-diff-row-of-a-file-past-2000-lines-counts-every-line-as-added-and-removed.md).
 * A changed region still past the table's bound (changes far apart in a large file) is diffed by the shortest edit
 * script instead, and only a region with more than `EDIT_DISTANCE_BOUND` changed lines falls back to its own lines as
 * removed and added, never the file's.
 */
function lcsChanges(before: readonly string[], after: readonly string[]): Change[] {
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;
  let tail = 0;
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  const b = before.slice(head, before.length - tail);
  const a = after.slice(head, after.length - tail);
  const n = b.length;
  const m = a.length;
  if (n * m > LCS_CELLS) {
    const ops = shortestEdit(b, a, EDIT_DISTANCE_BOUND);
    if (ops !== null) return changesOf(ops, b, a, head);
    return [...b.map((t, i) => ({ line: head + i + 1, sign: '-' as const, text: t })), ...a.map((t, i) => ({ line: head + i + 1, sign: '+' as const, text: t }))];
  }
  const dp: Uint32Array[] = [];
  for (let i = 0; i <= n; i += 1) dp.push(new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] = b[i] === a[j] ? (dp[i + 1]![j + 1] ?? 0) + 1 : Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
    }
  }
  const out: Change[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (b[i] === a[j]) { i += 1; j += 1; }
    else if ((dp[i + 1]![j] ?? 0) >= (dp[i]![j + 1] ?? 0)) { out.push({ line: head + i + 1, sign: '-', text: b[i] as string }); i += 1; }
    else { out.push({ line: head + j + 1, sign: '+', text: a[j] as string }); j += 1; }
  }
  while (i < n) { out.push({ line: head + i + 1, sign: '-', text: b[i] as string }); i += 1; }
  while (j < m) { out.push({ line: head + j + 1, sign: '+', text: a[j] as string }); j += 1; }
  return out;
}

/**
 * REQ-TOOLS-135: how many lines a change added and removed, by the same line LCS the row's header counts with. The edit
 * tools pass the replaced region only (the lines outside it are the same on both sides), so the count costs the region,
 * not the file, and a file past the table's bound is still counted line by line rather than as a whole replacement.
 */
export function lineChanges(before: readonly string[], after: readonly string[]): { readonly added: number; readonly removed: number } {
  const changes = lcsChanges(before, after);
  return { added: changes.filter((c) => c.sign === '+').length, removed: changes.filter((c) => c.sign === '-').length };
}

/** The changed lines of a whole-file change, as the row draws them (before the 50-line cap); exported for the tests. */
export function diffChanges(before: string | null, after: string): readonly Change[] {
  return lcsChanges(before === null ? [] : splitLines(before), splitLines(after));
}

export function renderDiff(path: string, before: string | null, after: string): string {
  // Lines as the file tools count them (`lines.ts`): a final newline ends the last line rather than adding an
  // empty one, which the live run of 2026-09-29 saw drawn as `[2]+ ` under a one-line create.
  const b = before === null ? [] : splitLines(before);
  const a = splitLines(after);
  const changes = lcsChanges(b, a);
  const added = changes.filter((c) => c.sign === '+').length;
  const removed = changes.filter((c) => c.sign === '-').length;
  const lines = [`${path}${before === null ? ' [Created]' : ''} +${added} -${removed}`];
  for (const c of changes.slice(0, DIFF_LINE_CAP)) lines.push(`[${c.line}]${c.sign} ${c.text}`);
  if (changes.length > DIFF_LINE_CAP) lines.push(`… +${changes.length - DIFF_LINE_CAP} more lines, diff truncated`);
  return lines.join('\n');
}
