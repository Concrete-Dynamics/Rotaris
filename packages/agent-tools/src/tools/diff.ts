import { splitLines } from './lines.js';

/**
 * REQ-CHAT-050: the user-only edit-diff row's text form — a header `<path>[ [Created]] +A -R`, then one
 * `[<line>]± <text>` line per changed line, at most 50 changed lines before "… +N more lines, diff
 * truncated". Computed by a plain line LCS; never shown to a model (REQ-TOOLS-135).
 */
export const DIFF_LINE_CAP = 50;

interface Change { readonly line: number; readonly sign: '+' | '-'; readonly text: string }

function lcsChanges(before: readonly string[], after: readonly string[]): Change[] {
  const n = before.length;
  const m = after.length;
  // Bounded table so a large file does not cost O(n·m) memory beyond reason: fall back to whole-replace over 4000 lines.
  if (n * m > 4_000_000) {
    return [...before.map((t, i) => ({ line: i + 1, sign: '-' as const, text: t })), ...after.map((t, i) => ({ line: i + 1, sign: '+' as const, text: t }))];
  }
  const dp: Uint32Array[] = [];
  for (let i = 0; i <= n; i += 1) dp.push(new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] = before[i] === after[j] ? (dp[i + 1]![j + 1] ?? 0) + 1 : Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
    }
  }
  const out: Change[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) { i += 1; j += 1; }
    else if ((dp[i + 1]![j] ?? 0) >= (dp[i]![j + 1] ?? 0)) { out.push({ line: i + 1, sign: '-', text: before[i] as string }); i += 1; }
    else { out.push({ line: j + 1, sign: '+', text: after[j] as string }); j += 1; }
  }
  while (i < n) { out.push({ line: i + 1, sign: '-', text: before[i] as string }); i += 1; }
  while (j < m) { out.push({ line: j + 1, sign: '+', text: after[j] as string }); j += 1; }
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
