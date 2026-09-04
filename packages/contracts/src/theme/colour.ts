/** Pure OKLCH/sRGB colour operations used by theme data and proof tooling. */
export interface OklchColour {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha?: number;
}

export interface SrgbColour {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha?: number;
}

const clamp = (value: number, low = 0, high = 1): number => Math.min(high, Math.max(low, value));

function gamma(value: number): number {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

/** CSS Color 4 OKLab conversion, with display-gamut clipping at the sRGB boundary. */
export function oklchToSrgb(colour: OklchColour): SrgbColour {
  const radians = colour.h * Math.PI / 180;
  const a = colour.c * Math.cos(radians);
  const b = colour.c * Math.sin(radians);
  const l1 = colour.l + 0.3963377774 * a + 0.2158037573 * b;
  const m1 = colour.l - 0.1055613458 * a - 0.0638541728 * b;
  const s1 = colour.l - 0.0894841775 * a - 1.291485548 * b;
  const l = l1 * l1 * l1;
  const m = m1 * m1 * m1;
  const s = s1 * s1 * s1;
  return {
    r: clamp(gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp(gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp(gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    ...(colour.alpha === undefined ? {} : { alpha: clamp(colour.alpha) }),
  };
}

export function parseOklch(value: string): OklchColour {
  const match = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i.exec(value.trim());
  if (!match) throw new Error(`Unsupported colour: ${value}`);
  return {
    l: Number(match[1]) / 100,
    c: Number(match[2]),
    h: Number(match[3]),
    ...(match[4] === undefined ? {} : { alpha: Number(match[4]) }),
  };
}

export function srgbToHex(colour: SrgbColour): string {
  const byte = (value: number) => Math.round(clamp(value) * 255).toString(16).padStart(2, '0');
  return `#${byte(colour.r)}${byte(colour.g)}${byte(colour.b)}`;
}

function linear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(colour: SrgbColour): number {
  return 0.2126 * linear(colour.r) + 0.7152 * linear(colour.g) + 0.0722 * linear(colour.b);
}

export function contrastRatio(a: SrgbColour | OklchColour | string, b: SrgbColour | OklchColour | string): number {
  const asSrgb = (value: SrgbColour | OklchColour | string): SrgbColour => {
    if (typeof value === 'string') return oklchToSrgb(parseOklch(value));
    return 'h' in value ? oklchToSrgb(value) : value;
  };
  const la = relativeLuminance(asSrgb(a));
  const lb = relativeLuminance(asSrgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** REQ-SHELL-134: preserve hue/chroma and raise lightness until the floor is reached. */
export function raiseLightness(colour: string, floor: number, against: string): string {
  const parsed = parseOklch(colour);
  if (contrastRatio(parsed, against) >= floor) return colour;
  let low = parsed.l;
  let high = 0.98;
  for (let i = 0; i < 24; i += 1) {
    const middle = (low + high) / 2;
    if (contrastRatio({ ...parsed, l: middle }, against) >= floor) high = middle;
    else low = middle;
  }
  const l = Math.round(high * 100_000) / 1_000;
  const alpha = parsed.alpha === undefined ? '' : ` / ${parsed.alpha}`;
  return `oklch(${l}% ${parsed.c} ${parsed.h}${alpha})`;
}
