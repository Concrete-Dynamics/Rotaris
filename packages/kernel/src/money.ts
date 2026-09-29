/**
 * Exact decimal money: the one module where arithmetic on an amount lives (ADR-0031, accepted narrowed
 * 2026-09-23, R-049). `rotaris/money-only-in-money-ts` fails `pnpm lint` on arithmetic applied to an amount
 * anywhere else.
 *
 * Amounts are carried as decimal STRINGS everywhere (ADR-0031's persistence clause: the `cost` column,
 * `usage.update`, a configured per-token price). Inside this file they become a scaled `bigint`, which is
 * exact at every magnitude a per-token price reaches, and they leave as strings again. The scale is never
 * fixed in advance: it is whatever the operands carry, so a provider reporting more decimal places than the
 * product expected loses none of them (ADR-0031's reason for refusing fixed minor units).
 *
 * Three operations exist and no more: addition (PD-MONITOR-001's sum of per-request figures), multiplication
 * of an amount by a whole token count (revision 2's configured price), and REQ-PROVIDER-121's rendering. The
 * balance's division by a provider-supplied scale (REQ-PROVIDER-130) is the one operation ADR-0031 still holds
 * open, and it is deliberately not here. The module lives in `kernel` because a price is read in `config` and
 * summed in `engine`, and one money module has to be reachable from both.
 */

interface Scaled {
  readonly units: bigint;
  readonly scale: number;
}

const DECIMAL = /^-?\d+(?:\.\d+)?$/;

/** A decimal string as scaled units, or null when the text is not one. */
function parse(text: string): Scaled | null {
  if (!DECIMAL.test(text)) return null;
  const negative = text.startsWith('-');
  const digits = negative ? text.slice(1) : text;
  const point = digits.indexOf('.');
  const scale = point === -1 ? 0 : digits.length - point - 1;
  const units = BigInt(point === -1 ? digits : `${digits.slice(0, point)}${digits.slice(point + 1)}`);
  return { units: negative ? -units : units, scale };
}

function rescale(v: Scaled, scale: number): bigint {
  return v.units * 10n ** BigInt(scale - v.scale);
}

function render(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = scale === 0 ? '' : `.${digits.slice(digits.length - scale)}`;
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

/**
 * `a + b`, exactly, at the wider of the two scales. A text that is not a decimal amount is
 * treated as nothing to add rather than as zero-and-carry-on: the caller's total is returned
 * unchanged, so a malformed figure never moves a total in either direction.
 */
export function addAmounts(a: string, b: string): string {
  const left = parse(a);
  const right = parse(b);
  if (left === null) return right === null ? a : b;
  if (right === null) return a;
  const scale = Math.max(left.scale, right.scale);
  return render(rescale(left, scale) + rescale(right, scale), scale);
}

/**
 * `price × count`, exactly, at the price's own scale. The count is a whole number of tokens; anything else is a
 * caller's defect and is refused rather than rounded. Null when the price is not a decimal amount.
 */
export function multiplyAmount(price: string, count: number): string | null {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError(`multiplyAmount: the count must be a non-negative whole number, got ${count}`);
  const v = parse(price);
  return v === null ? null : render(v.units * BigInt(count), v.scale);
}

/** YAML 1.2's decimal spellings of a number: an optional sign, digits with an optional point, an optional exponent. */
const SPELLED = /^([-+]?)(\d*)(?:\.(\d*))?(?:[eE]([-+]?\d+))?$/;
/** Beyond this an exponent is no price anyone wrote, and the scaled integer it asks for is refused rather than built. */
const MAX_EXPONENT = 400;

/**
 * The decimal a number's TEXT states, in this module's canonical form, or null when the text is not a decimal
 * number. `0.000003`, `3e-6`, `3E-6`, `.000003` and `+0.000003` all read as `0.000003`: the exponent moves the
 * point within the digit string and nothing is ever computed in binary floating point, which is what lets a
 * price written as a YAML number arrive exact (REQ-CONFIG-088 as amended, PD-MONITOR-001 revision 2). The scale
 * the text carries is kept (`0.50` stays `0.50`). Hexadecimal, octal, `.inf` and `.nan` are not decimals.
 */
export function amountFromText(text: string): string | null {
  const m = SPELLED.exec(text.trim());
  if (m === null) return null;
  const [, sign = '', whole = '', fraction = '', exponentText] = m;
  if (whole === '' && fraction === '') return null;
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_EXPONENT) return null;
  const digits = BigInt(`${whole}${fraction}` || '0');
  const shift = fraction.length - exponent;
  const units = shift >= 0 ? digits : digits * 10n ** BigInt(-shift);
  return render(sign === '-' ? -units : units, Math.max(0, shift));
}

/** Whether the text is a decimal amount this module can work with. */
export function isAmount(text: string): boolean {
  return DECIMAL.test(text);
}

/** Whether the amount is exactly zero, at any scale (`0`, `0.00`, `-0.0`). */
export function isZeroAmount(text: string): boolean {
  const v = parse(text);
  return v === null ? false : v.units === 0n;
}

/** REQ-PROVIDER-121's floor (accepted amendment 2026-09-29, ESC-42), bare: no figure this product renders names a currency. */
export const AMOUNT_FLOOR = '< 0.0001';

/**
 * REQ-PROVIDER-121's rendering of an amount that is not a balance: rounded **half-up**, to 2 decimal
 * places, or to 4 when the magnitude is below one hundredth — and an amount greater than zero that this
 * rounding would render as zero renders as the floor `< 0.0001` instead, which is what delivers REQ-SHELL-045's
 * "a cost that is small but not nothing is never rendered as zero" (ESC-42 option (b), ruled 2026-09-29 under
 * R-067). Zero itself renders `0.00`, so nothing and a small something stay distinguishable. An amount below zero
 * is rounded as before and never floored (the ruling's "greater than zero"); a balance, rounded down, is outside
 * the floor too, and is not rendered here at all (ADR-0031 holds its division open). The floor is rendering only:
 * the exact figure is what is persisted and summed.
 *
 * The floor replaces the whole figure, so a label template that takes `<amount>` takes it whole —
 * `< 0.0001 at configured rates`, `at least < 0.0001; some requests have no price` — and every row of
 * PD-MONITOR-001's label table stays as written.
 *
 * The currency is deliberately not this function's business. The product has no currency anywhere
 * yet, and a figure a provider reports without naming one is rendered bare rather than under a
 * symbol the product picked for it — PD-MONITOR-001's narrowing of REQ-PROVIDER-121, where the
 * symbol table applies to an amount whose currency is known. So the floor is bare here; where a currency is one
 * day known, its symbol stands where the rule puts it, before the digits and after the `<` (`< $0.0001`), or its
 * code after them (`< 0.0001 <CODE>`).
 */
export function formatAmount(text: string): string | null {
  const v = parse(text);
  if (v === null) return null;
  const magnitude = v.units < 0n ? -v.units : v.units;
  // |amount| < 0.01, decided on the scaled integers rather than by dividing: |units| * 100 < 10^scale.
  const places = magnitude !== 0n && magnitude * 100n < 10n ** BigInt(v.scale) ? 4 : 2;
  if (v.scale <= places) return render(rescale(v, places), places);
  const divisor = 10n ** BigInt(v.scale - places);
  const negative = v.units < 0n;
  const quotient = magnitude / divisor;
  const remainder = magnitude % divisor;
  // Half-up: away from zero at the exact half, which is what REQ-PROVIDER-127 restates for percentages.
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
  // ESC-42: only the four-place band can round a non-zero amount to zero (below 0.00005); above zero, that is the floor.
  if (rounded === 0n && v.units > 0n) return AMOUNT_FLOOR;
  return render(negative ? -rounded : rounded, places);
}
