/**
 * REQ-WORKSPACE-149 — the three rules every workspace path and branch name in the window chrome is
 * drawn under. They live here, apart from any component, because two surfaces draw such a label —
 * the title-bar chip (REQ-WORKSPACE-017) and the status bar's path link (REQ-WORKSPACE-019) — and a
 * rule written twice is a rule that will one day disagree with itself.
 *
 * Nothing here touches the DOM. `elideMiddle` is handed the measuring function, so the rule is
 * testable without a renderer and the component supplies the real font metrics — which is also the
 * only honest way to meet rule 2, whose budget is *rendered width* and not a character count.
 *
 * Rule 3 (literal text) needs no code in this module and is not forgotten: React renders text
 * children as text, so the chip and the status bar interpret nothing a folder or a branch is named.
 * A surface that reached for `dangerouslySetInnerHTML` with one of these labels would break it.
 */

/** The one character a shortened label loses its middle to (REQ-WORKSPACE-149 rule 2). */
export const ELLIPSIS = '…';

/**
 * Rule 1 — home collapsing, for the **displayed label only**. The caller keeps the absolute path
 * for the tooltip, the accessible description and anything handed to the operating system.
 *
 * `home` arrives from main over `shell.hello`: a sandboxed renderer has no `node:os` (ADR-0051), and
 * what travels is home itself rather than an already-collapsed label precisely so the full path is
 * still available to everything the rule says must carry it.
 *
 * The platform separator is read from `home` rather than assumed, since that string came from the
 * platform that owns the answer. Comparison is case-insensitive only where the separator says the
 * paths are Windows', where `C:\Users\x` and `c:\users\x` are one directory.
 */
export function collapseHome(path: string, home: string | undefined): string {
  const full = path.trim();
  const base = (home ?? '').trim().replace(/[\\/]+$/u, '');
  if (full === '' || base === '') return full;
  const sep = base.includes('\\') ? '\\' : '/';
  const same = (a: string, b: string) => (sep === '\\' ? a.toLowerCase() === b.toLowerCase() : a === b);
  if (same(full, base)) return '~';
  // The character after home must be a separator, or `~/homework` would collapse against `~/home`.
  const next = full.charAt(base.length);
  if (!same(full.slice(0, base.length), base) || (next !== '\\' && next !== '/')) return full;
  return `~${sep}${full.slice(base.length + 1)}`;
}

/**
 * Rule 2 — middle elision against the measured width, the removed span standing in as exactly one
 * `…`. Answers `null` where the space cannot hold even `…`, which the rule says is drawn as nothing
 * at all rather than clipped (REQ-WORKSPACE-021's terms for the status bar).
 *
 * Characters are given up from the middle one code point at a time, from whichever side is longer,
 * so the beginning and the end stay as legible as the budget allows. That is a measurement per
 * candidate; a path is tens of characters and the measure is a cached canvas call, so the cost is
 * paid only when the available width actually changes.
 */
export function elideMiddle(text: string, available: number, measure: (s: string) => number): string | null {
  if (text === '') return text;
  if (!Number.isFinite(available) || available <= 0) return null;
  /*
   * A measurer that charges nothing for a label that has characters is not measuring, and every
   * candidate then "fits": the caller draws the whole path into a box too small to hold it, which is
   * the single outcome rule 2 forbids. Hiding it is the rule's own answer for a width that cannot
   * hold the label, and it is the safe side of a measurement that cannot be trusted.
   *
   * The reason this replaces, kept beside it rather than repaired quietly: `WorkspaceChip` held that
   * a zero measurer was "the right answer where there is no width — elision is a property of a
   * surface that was drawn, and nothing was". That is true of a test renderer, where the available
   * width is zero as well and the clause above has already answered. It is false of a drawn surface
   * whose canvas context or computed font is unavailable: there the width is real and the old
   * reasoning drew a full absolute path into an 87 px chip.
   */
  const full = measure(text);
  if (full === 0) return null;
  if (full <= available) return text;
  if (measure(ELLIPSIS) > available) return null;
  const chars = Array.from(text);
  let head = Math.ceil((chars.length - 1) / 2);
  let tail = chars.length - 1 - head;
  while (head + tail > 0) {
    const kept = `${chars.slice(0, head).join('')}${ELLIPSIS}${tail === 0 ? '' : chars.slice(chars.length - tail).join('')}`;
    if (measure(kept) <= available) return kept;
    if (head > tail) head -= 1; else tail -= 1;
  }
  return ELLIPSIS;
}

/**
 * Rules 1 and 2 in the order the requirement states them: collapse, then shorten what is displayed.
 * The order matters — collapsing first is what lets a deep path under home keep its tail, and
 * eliding first would shorten the very prefix `~` is about to replace.
 */
export function workspaceLabel(
  path: string,
  home: string | undefined,
  available: number,
  measure: (s: string) => number,
): string | null {
  return elideMiddle(collapseHome(path, home), available, measure);
}
