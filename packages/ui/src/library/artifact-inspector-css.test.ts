import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ArtifactInspector, type ArtifactLoaded } from './ArtifactInspector.js';

/*
 * What the renderer's stylesheets give the artifact inspector, read the way the cascade reads them: every sheet
 * `apps/desktop/src/renderer/design.css` imports, in its order, each rule's selector matched against the inspector's own
 * markup and ranked by specificity, then by order. A class written on the element is no promise that it wins.
 */
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const SHEETS = [
  read('../../../../docs/design/system/base.css'),
  read('../../../../docs/design/system/components.css'),
  read('../../../../docs/design/system/motif.css'),
  read('../shell.css'),
];
const SPACING = read('../../../../docs/design/system/tokens/spacing.css');

interface Element { readonly tag: string; readonly classes: readonly string[] }
interface Declaration { readonly value: string; readonly important: boolean; readonly specificity: readonly [number, number, number]; readonly order: number; readonly selector: string }

/** A compound of a type and classes (`textarea.input`, `.mono`); null for anything else, which this reading does not rank. */
const compound = (text: string): { tag: string | null; classes: string[] } | null => {
  const m = /^([a-z][a-z0-9-]*|\*)?((?:\.[A-Za-z0-9_-]+)*)$/.exec(text);
  if (!m || text === '') return null;
  return { tag: m[1] === undefined || m[1] === '*' ? null : m[1], classes: (m[2] ?? '').split('.').filter(Boolean) };
};

/** Whether `selector` matches the last element of `chain` (outermost first); null when the selector is not one this reads. */
const matches = (selector: string, chain: readonly Element[]): { specificity: [number, number, number] } | null => {
  const parts = selector.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/);
  const compounds: { c: NonNullable<ReturnType<typeof compound>>; child: boolean }[] = [];
  let child = false;
  for (const part of parts) {
    if (part === '>') { child = true; continue; }
    const c = compound(part);
    if (!c) return null;
    compounds.push({ c, child });
    child = false;
  }
  const fits = (c: NonNullable<ReturnType<typeof compound>>, e: Element): boolean =>
    (c.tag === null || c.tag === e.tag) && c.classes.every((k) => e.classes.includes(k));
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
};

/** Every declaration of `property` (or of a shorthand that sets it) that reaches the last element of `chain`. */
const declarations = (chain: readonly Element[], property: string, shorthand?: string): Declaration[] => {
  const found: Declaration[] = [];
  let order = 0;
  for (const sheet of SHEETS) {
    const css = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      order += 1;
      const body = m[2] ?? '';
      const decl = new RegExp(`(?:^|;)\\s*(${property}${shorthand ? `|${shorthand}` : ''})\\s*:\\s*([^;]+)`, 'g');
      const values = [...body.matchAll(decl)].map((d) => (d[2] ?? '').trim());
      if (values.length === 0) continue;
      for (const selector of (m[1] ?? '').split(',')) {
        const hit = matches(selector, chain);
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

const rank = (a: Declaration, b: Declaration): number => {
  if (a.important !== b.important) return a.important ? 1 : -1;
  for (let i = 0; i < 3; i += 1) if (a.specificity[i] !== b.specificity[i]) return a.specificity[i]! - b.specificity[i]!;
  return a.order - b.order;
};
const winner = (chain: readonly Element[], property: string, shorthand?: string): Declaration | undefined =>
  declarations(chain, property, shorthand).sort(rank).at(-1);

const classesOf = (html: string, pattern: RegExp): string[] => (pattern.exec(html)?.[1] ?? '').split(/\s+/).filter(Boolean);

describe('REQ-LIBRARY-132: the inspector\'s Markdown editor is drawn in the measured monospace face', () => {
  // docs/defects/fixed/the-artifact-inspectors-markdown-editor-is-not-drawn-in-the-monospace-face.md: the adopted
  // `textarea.input { resize: vertical; font-family: inherit }` (0,1,1) outranked `.artifact-inspector__editor` and `.mono`
  // (0,1,0), so the editor took the dialog's proportional face and a vertical resize grip.
  const preloaded: ArtifactLoaded = { id: 'art_12345678', slug: 'travel-plan', title: 'Travel plan', artifactKind: 'agent_published', status: 'published', producer: 'planner-1', persona: 'planner', edited: false, body: '---\nid: "art_12345678"\n---\n# Travel plan\n\n| a | b |\n|---|---|\n', fallback: false };
  const never = () => new Promise<never>(() => undefined);
  const html = renderToStaticMarkup(createElement(ArtifactInspector, { id: preloaded.id, raised: 0, onLoad: never, onSave: never, onClose: () => undefined, preloaded, initialTab: 'markdown' }));
  const chain: Element[] = [
    { tag: 'div', classes: classesOf(html, /<div[^>]*class="([^"]*)"[^>]*data-testid="artifact-inspector"/) },
    { tag: 'div', classes: classesOf(html, /<div class="(artifact-inspector__body[^"]*)"/) },
    { tag: 'textarea', classes: classesOf(html, /<textarea[^>]*class="([^"]*)"[^>]*data-testid="artifact-editor"/) },
  ];

  it('reads the editor\'s own markup: a textarea.input inside the Markdown body', () => {
    expect(chain[0]!.classes).toContain('artifact-inspector');
    expect(chain[1]!.classes).toEqual(['artifact-inspector__body', 'artifact-inspector__body--markdown']);
    expect(chain[2]!.classes).toEqual(expect.arrayContaining(['input', 'artifact-inspector__editor', 'mono']));
    // The adopted rule the editor has to outrank is present and as specific as the defect found it.
    expect(declarations(chain, 'font-family').some((d) => d.selector === 'textarea.input' && d.value === 'inherit')).toBe(true);
  });

  it('the font family that wins is the monospace token, as the read-only block above it', () => {
    const won = winner(chain, 'font-family', 'font');
    expect(won?.value, JSON.stringify(won)).toMatch(/^var\(--rt-font-mono\b/);
    const block: Element[] = [chain[0]!, chain[1]!, { tag: 'pre', classes: classesOf(html, /<pre class="([^"]*)"/) }];
    expect(winner(block, 'font-family', 'font')?.value).toMatch(/^var\(--rt-font-mono\b/);
  });

  it('the editor carries no resize grip: it fills the body, which sizes it', () => {
    expect(winner(chain, 'resize')?.value).toBe('none');
  });
});

describe('an acknowledgement\'s close control stands clear of the inspector\'s Save at every window width', () => {
  // docs/defects/fixed/an-acknowledgements-close-control-still-covers-a-corner-of-the-artifact-inspectors-save.md: the
  // inspector stood at the window's bottom-right corner with the stack's own 16 px insets (REQ-NOTIFY-012), so the
  // close control (which takes the pointer, REQ-NOTIFY-020) stood over Save's top-right corner: 1319,916 (12×17) over
  // 1270,923 (57×32) at 1360×980. The inspector stands centred, as the design language's dialogs do, with a narrow
  // window's gutter wide enough to keep Save out of the close control's column.
  const css = SHEETS[3]!.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector: string): string => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => (m[1] ?? '').trim() === selector).map((m) => m[2] ?? '').join(';');
  const value = (block: string, property: string): string | undefined =>
    new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(block)?.[1]?.trim();
  const token = (name: string): number => Number(new RegExp(`--${name}:\\s*(\\d+)px`).exec(SPACING)?.[1]);
  /** A length in px: `16px`, `0`, `var(--rt-space-4, 16px)`, or `calc(100vw - 2 * var(--rt-space-12))` at width `vw`. */
  const px = (text: string, vw: number): number => {
    const expr = text
      .replace(/var\(--(rt-space-\d+)(?:,[^)]*)?\)/g, (_, n: string) => String(token(n)))
      .replace(/(\d+(?:\.\d+)?)vw/g, (_, n: string) => String((Number(n) / 100) * vw))
      .replace(/(\d+(?:\.\d+)?)px/g, '$1')
      .replace(/^calc\((.*)\)$/, '$1');
    if (!/^[\d\s.+*/()-]+$/.test(expr)) throw new Error(`not a length this reads: ${text}`);
    return Function(`return (${expr});`)() as number;
  };
  const sides = (shorthand: string | undefined, vw: number): number[] => {
    const v = (shorthand ?? '0').split(/\s+(?![^(]*\))/).map((s) => px(s, vw));
    return v.length === 1 ? [v[0]!, v[0]!, v[0]!, v[0]!] : v.length === 2 ? [v[0]!, v[1]!, v[0]!, v[1]!] : v.length === 3 ? [v[0]!, v[1]!, v[2]!, v[1]!] : v;
  };

  /** The inspector's right edge in a window `vw` wide, from what `.artifact-inspector` declares. */
  const inspectorRight = (vw: number): number => {
    const block = rule('.artifact-inspector');
    const inset = value(block, 'inset');
    const right = value(block, 'right') ?? (inset === undefined ? undefined : sides(inset, vw)[1]!.toString() + 'px');
    const left = value(block, 'left') ?? (inset === undefined ? undefined : sides(inset, vw)[3]!.toString() + 'px');
    const width = Math.min(px(value(block, 'width') ?? '0', vw), px(value(block, 'max-width') ?? `${vw}px`, vw));
    const centred = left !== undefined && right !== undefined && /\bauto\b/.test(value(block, 'margin') ?? '');
    if (centred) return vw - px(right, vw) - (vw - px(left, vw) - px(right, vw) - width) / 2;
    if (right !== undefined) return vw - px(right, vw);
    return px(left ?? '0', vw) + width;
  };
  /** Save's right edge: the footer's right padding inside the inspector. */
  const saveRight = (vw: number): number => inspectorRight(vw) - sides(value(rule('.artifact-inspector__foot'), 'padding'), vw)[1]!;
  /** The close control's left edge, at the most: the stack's inset, the acknowledgement's right padding, the control's widest box. */
  const closeLeft = (vw: number): number => {
    const close = rule('.ack__close');
    const widest = px(value(close, 'font-size') ?? '0', vw) + 2 * sides(value(close, 'padding'), vw)[1]!;
    return vw - px(value(rule('.ack-stack'), 'right') ?? '0', vw) - sides(value(rule('.ack'), 'padding'), vw)[1]! - widest;
  };

  it('reads the rules it measures', () => {
    expect(rule('.artifact-inspector')).toContain('position: fixed');
    expect(closeLeft(1360)).toBeLessThan(1360 - 16);
  });

  // The main window's minimum (1000, main-windows.ts), the proof's 1360 and a wide screen; a persona window's default
  // (820) and minimum (560), since a persona window hosts the inspector and its own acknowledgements too.
  for (const vw of [560, 640, 720, 805, 820, 1000, 1360, 1920]) {
    it(`at ${vw} px Save's right edge stands left of the close control`, () => {
      expect(saveRight(vw), JSON.stringify({ inspectorRight: inspectorRight(vw), saveRight: saveRight(vw), closeLeft: closeLeft(vw) })).toBeLessThan(closeLeft(vw));
    });
  }

  it('keeps REQ-LIBRARY-131\'s 720 px wherever the window has room for it beside the gutters', () => {
    const block = rule('.artifact-inspector');
    expect(value(block, 'width')).toBe('720px');
    expect(value(block, 'height')).toBe('560px');
    for (const vw of [820, 1000, 1360]) expect(Math.min(720, px(value(block, 'max-width') ?? '', vw))).toBe(720);
  });
});
