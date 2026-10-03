/**
 * REQ-WORKSPACE-149 rule 2's measuring half: the DOM side of `elideMiddle` (`workspace-label.ts`), shared by every surface
 * that draws a workspace path or a branch name — the title-bar chip (`WorkspaceChip.tsx`) and the status strip's path link
 * and branch item (`StatusStripItem.tsx`). It lived inside `WorkspaceChip` until the strip needed it too (2026-10-03,
 * `docs/defects/fixed/the-status-strips-workspace-path-elides-at-its-end-not-its-middle.md`); written once so the two
 * surfaces cannot measure differently.
 *
 * One canvas per window measures every candidate label. Measuring on a canvas rather than in the document is what keeps
 * rule 2 free of a feedback loop: a candidate's width is read without the candidate being laid out, so shortening the
 * label cannot move the budget that decided it.
 *
 * An environment with no 2D context — a test renderer — measures everything as zero. That answer is not trusted:
 * `elideMiddle` refuses a measurer that charges nothing for a label with characters and hides the label instead, because
 * in a window that really was drawn the alternative is a full path in a box too small for it, and clipped is what rule 2
 * forbids.
 */
let scratch: HTMLCanvasElement | null = null;

/** A measurer in `el`'s computed font: the width, in CSS px, a string would take drawn there. */
export function measurerFor(el: HTMLElement): (s: string) => number {
  scratch ??= document.createElement('canvas');
  const ctx = scratch.getContext('2d');
  const font = getComputedStyle(el).font;
  if (!ctx || font === '') return () => 0;
  ctx.font = font;
  return (s) => ctx.measureText(s).width;
}

/**
 * What a box spends on everything but its label: its own padding and borders, its fixed children (`furniture`, every child
 * that is not the label) and one flex gap per fixed child. The gaps are counted from the fixed children rather than from
 * the children present, so the figure does not change when the label is hidden — a budget that grew by one gap the moment
 * the label disappeared could show and hide it alternately at one width (the reason `WorkspaceChip` gives for the same rule).
 */
export function spentBesideLabel(box: HTMLElement, label: Element | null): number {
  const px = (value: string) => parseFloat(value) || 0;
  const own = getComputedStyle(box);
  const furniture = Array.from(box.children).filter((element) => element !== label);
  return px(own.paddingLeft) + px(own.paddingRight) + px(own.borderLeftWidth) + px(own.borderRightWidth)
    + px(own.columnGap) * furniture.length
    + furniture.reduce((total, element) => total + (element as HTMLElement).offsetWidth, 0);
}
