/**
 * A reading of the renderer's stylesheets the way the cascade reads them, for tests that must know which declaration WINS on
 * an element rather than which class the element carries: each rule's selectors matched against an element chain (outermost
 * first, the element last), ranked by importance, then specificity, then order. A class written on the element is no promise
 * that it wins: the adopted `textarea.input { font-family: inherit }` (0,1,1) outranks `.mono` (0,1,0), which is how the
 * artifact inspector's editor and the restore confirmation's preview field both lost their monospace face
 * (docs/defects/fixed/the-artifact-inspectors-markdown-editor-is-not-drawn-in-the-monospace-face.md,
 * docs/defects/fixed/the-restore-confirmations-preview-field-is-not-drawn-in-the-monospace-face.md).
 *
 * It reads compound selectors of a type and classes joined by descendant or child combinators — every selector that can reach
 * a classed element in these sheets — and skips the rest (attribute selectors, pseudo-classes, `@media` bodies), which a test
 * using it must not depend on. Test support only, and named so (`*.test-support.ts`, which `vitest.config.ts` does not collect):
 * nothing in the product imports it, neither package entry reaches it (`tools/test-support-naming/test-support-naming.test.ts` pins both), and it reads no file
 * itself — the caller hands it the sheets, in the order `apps/desktop/src/renderer/design.css` imports them.
 */

export interface CascadeElement { readonly tag: string; readonly classes: readonly string[] }
export interface CascadeDeclaration {
  readonly value: string;
  readonly important: boolean;
  readonly specificity: readonly [number, number, number];
  readonly order: number;
  readonly selector: string;
}

type Compound = { tag: string | null; classes: string[] };

/** A compound of a type and classes (`textarea.input`, `.mono`); null for anything else, which this reading does not rank. */
function compound(text: string): Compound | null {
  const m = /^([a-z][a-z0-9-]*|\*)?((?:\.[A-Za-z0-9_-]+)*)$/.exec(text);
  if (!m || text === '') return null;
  return { tag: m[1] === undefined || m[1] === '*' ? null : m[1], classes: (m[2] ?? '').split('.').filter(Boolean) };
}

/** Whether `selector` matches the last element of `chain` (outermost first); null when the selector is not one this reads. */
export function selectorMatches(selector: string, chain: readonly CascadeElement[]): { specificity: [number, number, number] } | null {
  const parts = selector.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/);
  const compounds: { c: Compound; child: boolean }[] = [];
  let child = false;
  for (const part of parts) {
    if (part === '>') { child = true; continue; }
    const c = compound(part);
    if (!c) return null;
    compounds.push({ c, child });
    child = false;
  }
  const fits = (c: Compound, e: CascadeElement): boolean => (c.tag === null || c.tag === e.tag) && c.classes.every((k) => e.classes.includes(k));
  let at = chain.length - 1;
  const last = compounds[compounds.length - 1];
  if (!last || !fits(last.c, chain[at]!)) return null;
  for (let i = compounds.length - 2; i >= 0; i -= 1) {
    const next = compounds[i + 1]!;
    const want = compounds[i]!.c;
    if (next.child) {
      at -= 1;
      if (at < 0 || !fits(want, chain[at]!)) return null;
    } else {
      let found = -1;
      for (let j = at - 1; j >= 0; j -= 1) if (fits(want, chain[j]!)) { found = j; break; }
      if (found < 0) return null;
      at = found;
    }
  }
  const classes = compounds.reduce((n, { c }) => n + c.classes.length, 0);
  const types = compounds.reduce((n, { c }) => n + (c.tag === null ? 0 : 1), 0);
  return { specificity: [0, classes, types] };
}

function rank(a: CascadeDeclaration, b: CascadeDeclaration): number {
  if (a.important !== b.important) return a.important ? 1 : -1;
  for (let i = 0; i < 3; i += 1) if (a.specificity[i] !== b.specificity[i]) return a.specificity[i]! - b.specificity[i]!;
  return a.order - b.order;
}

/** The cascade over `sheets`, in import order. */
export function cascadeOf(sheets: readonly string[]) {
  /** Every declaration of `property` (or of a shorthand that sets it) that reaches the last element of `chain`. */
  const declarations = (chain: readonly CascadeElement[], property: string, shorthand?: string): CascadeDeclaration[] => {
    const found: CascadeDeclaration[] = [];
    let order = 0;
    for (const sheet of sheets) {
      const css = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        order += 1;
        const body = m[2] ?? '';
        const decl = new RegExp(`(?:^|;)\\s*(${property}${shorthand ? `|${shorthand}` : ''})\\s*:\\s*([^;]+)`, 'g');
        const values = [...body.matchAll(decl)].map((d) => (d[2] ?? '').trim());
        if (values.length === 0) continue;
        for (const selector of (m[1] ?? '').split(',')) {
          const hit = selectorMatches(selector, chain);
          if (!hit) continue;
          for (const raw of values) {
            const important = /!important\s*$/.test(raw);
            found.push({ value: raw.replace(/\s*!important\s*$/, ''), important, specificity: hit.specificity, order, selector: selector.trim() });
          }
        }
      }
    }
    return found;
  };
  /** The declaration of `property` that wins on the last element of `chain`, or undefined where none reaches it. */
  const winner = (chain: readonly CascadeElement[], property: string, shorthand?: string): CascadeDeclaration | undefined =>
    declarations(chain, property, shorthand).sort(rank).at(-1);
  return { declarations, winner };
}

/** The classes of the first element `pattern` captures a `class` attribute from, in rendered markup. */
export const classesOf = (html: string, pattern: RegExp): string[] => (pattern.exec(html)?.[1] ?? '').split(/\s+/).filter(Boolean);
