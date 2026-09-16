/**
 * Exact decimal money, in the one shape PD-MONITOR-001 needs and no wider.
 *
 * ADR-0031 decides the end state — a `Decimal` type from an arbitrary-precision library, a `Money`
 * value carrying its currency, two formatters, and a lint rule banning arithmetic operators on the
 * branded type. That decision is **proposed and blocked by OQ-21**, which changes a persisted
 * format, and nothing here anticipates it: no library is chosen, no branded type is introduced, and
 * no rate is multiplied. What is built is addition of two decimal strings and the rendering rule of
 * REQ-PROVIDER-121, both exact, because a figure the provider states has to be added to the run's
 * total and shown, and the alternative — adding it as a double — is the one thing that requirement
 * forbids outright.
 *
 * Amounts are carried as decimal STRINGS everywhere (ADR-0031's persistence clause, already true of
 * the `cost` column and of `usage.update`). Inside this file they become a scaled `bigint`, which is
 * exact at every magnitude a per-token price reaches, and they leave as strings again. The scale is
 * never fixed in advance: it is whatever the operands carry, so a provider reporting more decimal
 * places than the product expected loses none of them (ADR-0031's reason for refusing fixed minor
 * units).
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

/** Whether the text is a decimal amount this module can work with. */
export function isAmount(text: string): boolean {
  return DECIMAL.test(text);
}

/** Whether the amount is exactly zero, at any scale (`0`, `0.00`, `-0.0`). */
export function isZeroAmount(text: string): boolean {
  const v = parse(text);
  return v === null ? false : v.units === 0n;
}

/**
 * REQ-PROVIDER-121's rendering of an amount that is not a balance: rounded **half-up**, to 2 decimal
 * places, or to 4 when the magnitude is below one hundredth — so a cost that is small but not
 * nothing is never rendered as zero (REQ-SHELL-045 says the same in its own words).
 *
 * The currency is deliberately not this function's business. The product has no currency anywhere
 * yet, and a figure a provider reports without naming one is rendered bare rather than under a
 * symbol the product picked for it — PD-MONITOR-001's narrowing of REQ-PROVIDER-121, where the
 * symbol table applies to an amount whose currency is known.
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
  return render(negative ? -rounded : rounded, places);
}
