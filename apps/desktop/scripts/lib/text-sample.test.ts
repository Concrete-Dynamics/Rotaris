/**
 * What `theme-proof` reads a text's contrast from (REQ-SHELL-145, REQ-SHELL-160 (a)), against fixed numbers taken from
 * the captures that exposed the defect: the status strip's `applied · reset · refused` item at 150 % on a 1066 CSS px
 * window, measured whole at x = 1006 and as a 1.2 px sliver at x = 1064.8
 * (`docs/defects/fixed/theme-proofs-text-contrast-verdict-depends-on-the-checkouts-path.md`).
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the proof library is plain ESM beside the scripts that run it.
import { CLIP_TOLERANCE, clipRect, textSample } from './text-sample.mjs';

const require = createRequire(import.meta.url);
const { textContrast } = require('../pixels.cjs') as {
  textContrast: (png: Png, text: { rect: Box }, dpr: number) => { ratio: number };
};

type Box = { x: number; y: number; width: number; height: number };
type Png = { width: number; height: number; pixels: Buffer };

const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });
const viewport = box(0, 0, 1066, 666);
const item = (x: number) => box(x, 640, 48, 16);
const strip = (x: number, shown: Box | null) => ({ text: 'applied 0 · reset 0 · refused 0', rect: item(x), shown, fontSize: 11 });

/** A synthetic capture: one ground colour, with rectangles painted over it at device pixels. */
function capture(width: number, height: number, ground: number[], paint: Array<{ box: Box; colour: number[] }>): Png {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const hit = paint.find((p) => x >= p.box.x && x < p.box.x + p.box.width && y >= p.box.y && y < p.box.y + p.box.height);
    const [r, g, b] = hit?.colour ?? ground;
    pixels.set([r!, g!, b!, 255], (y * width + x) * 4);
  }
  return { width, height, pixels };
}

describe('clipRect — REQ-SHELL-160 (a): the part of a box inside every clip', () => {
  it('keeps a box wholly inside its clips unchanged', () => {
    expect(clipRect(item(1006), [viewport])).toEqual(item(1006));
  });

  it('cuts a box at the window edge to the part on screen', () => {
    const shown = clipRect(item(1064.8), [viewport]);
    expect(shown?.x).toBeCloseTo(1064.8);
    expect(shown?.width).toBeCloseTo(1.2);
    expect(shown?.height).toBe(16);
  });

  it('cuts by every clip, a scroll container inside the window included', () => {
    expect(clipRect(box(100, 100, 200, 40), [viewport, box(0, 90, 250, 30)])).toEqual(box(100, 100, 150, 20));
  });

  it('answers null for a box wholly outside a clip', () => {
    expect(clipRect(item(1084.6), [viewport])).toBeNull();
    expect(clipRect(box(10, 10, 5, 5), [box(15, 10, 20, 20)])).toBeNull();
  });

  it('is self-contained, so theme-proof can inject its source into the page', () => {
    const injected = new Function(`return (${clipRect.toString()});`)() as typeof clipRect;
    expect(injected(item(1064.8), [viewport])).toEqual(clipRect(item(1064.8), [viewport]));
  });
});

describe('textSample — REQ-SHELL-160 (a): only pixels that show the text are read', () => {
  it('reads a text wholly on screen from its whole box', () => {
    expect(textSample(strip(1006, item(1006)))).toEqual({ rect: item(1006) });
  });

  it('skips the strip item scrolled past the window edge with 1.2 px of it on screen (the sliver that read 3.05:1)', () => {
    const sample = textSample(strip(1064.8, clipRect(item(1064.8), [viewport])));
    expect(sample.rect).toBeUndefined();
    expect(sample.skip).toMatch(/less than a glyph of it is on screen \(1\.2×16\.0 of 48\.0×16\.0 CSS px\)/);
  });

  it('reads a text cut by more than an em from the part on screen, never from the part cut off', () => {
    const shown = clipRect(item(1045), [viewport]);
    expect(textSample(strip(1045, shown))).toEqual({ rect: shown });
  });

  it('skips a text cut vertically to less than an em', () => {
    const rect = box(40, 100, 120, 16);
    expect(textSample({ rect, shown: box(40, 100, 120, 6), fontSize: 11 }).skip).toMatch(/less than a glyph/);
    expect(textSample({ rect, shown: box(40, 100, 120, 11), fontSize: 11 })).toEqual({ rect: box(40, 100, 120, 11) });
  });

  it('reads a text narrower than an em when it is all on screen, within half a pixel of sub-pixel clipping', () => {
    const rect = box(40, 100, 7, 16);
    expect(textSample({ rect, shown: rect, fontSize: 11 })).toEqual({ rect });
    const nicked = box(40, 100, 7 - CLIP_TOLERANCE, 16);
    expect(textSample({ rect, shown: nicked, fontSize: 11 })).toEqual({ rect: nicked });
  });

  it('skips a text with nothing on screen, and reads a record written before `shown` existed from its box', () => {
    expect(textSample(strip(1084.6, null)).skip).toBe('no part of it is on screen');
    expect(textSample({ rect: item(1006), fontSize: 11 })).toEqual({ rect: item(1006) });
  });
});

describe('REQ-SHELL-145: the verdict no longer turns on a sliver (the defect, measured through pixels.cjs)', () => {
  // At DPR 1.5 the 1066 px window is 1599 device pixels wide. The item's text is a light grey on a dark ground. The
  // two columns of it on screen are the first glyph's anti-aliased leading edge, a darker grey that never reaches the
  // text's colour.
  const ground = [30, 30, 30];
  const text = [168, 168, 168];
  const edge = [96, 96, 96];
  const dpr = 1.5;

  it('the sliver read whole-box, as before, fails 4.5:1; textSample skips it instead', () => {
    const png = capture(1599, 1000, ground, [{ box: box(1597, 966, 2, 8), colour: edge }]);
    const sliver = strip(1064.8, clipRect(item(1064.8), [viewport]));
    expect(textContrast(png, sliver, dpr).ratio).toBeLessThan(4.5);
    expect(textSample(sliver).skip).toBeDefined();
  });

  it('the item measured whole reads the text colour and clears 4.5:1', () => {
    const png = capture(1599, 1000, ground, [{ box: box(1512, 966, 60, 6), colour: text }]);
    const whole = strip(1006, item(1006));
    const sample = textSample(whole);
    expect(textContrast(png, { rect: sample.rect }, dpr).ratio).toBeGreaterThan(4.5);
  });

  it('a text a scroll container cuts off is not read against what is painted past the clip', () => {
    // A 200 px row whose right half lies under the next pane's bright label; the container clips at x = 100.
    const png = capture(400, 200, ground, [
      { box: box(15, 60, 60, 18), colour: text },
      { box: box(160, 60, 120, 18), colour: [250, 250, 250] },
    ]);
    const row = { rect: box(10, 40, 200, 16), shown: clipRect(box(10, 40, 200, 16), [box(0, 0, 100, 200)]), fontSize: 11 };
    const read = textContrast(png, { rect: textSample(row).rect }, dpr).ratio;
    const whole = textContrast(png, { rect: row.rect }, dpr).ratio;
    expect(read).toBeCloseTo(textContrast(png, { rect: box(10, 40, 90, 16) }, dpr).ratio);
    expect(whole).toBeGreaterThan(read);
  });
});
