/**
 * Time as values. ADR-0006.
 *
 * `Millis` is a reading of the monotonic clock or a duration on it; `Instant`
 * is a wall-clock reading. They are different brands because a monotonic
 * reading has no meaning across a process boundary and a wall reading has no
 * ordering guarantee inside one.
 */
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** A monotonic reading or a duration, in milliseconds. */
export type Millis = Brand<number, 'Millis'>;
/** A wall-clock reading, milliseconds since the Unix epoch. */
export type Instant = Brand<number, 'Instant'>;

export const millis = (n: number): Millis => n as Millis;
export const instant = (n: number): Instant => n as Instant;

export function addMillis(a: Millis, b: Millis): Millis {
  return (a + b) as Millis;
}
export function subMillis(a: Millis, b: Millis): Millis {
  return (a - b) as Millis;
}

/**
 * A budget: a start reading plus a duration, with REQ-ORCH-124's composition
 * rules — the smaller governs, and expiring the smaller does not reset the
 * larger. Persisted deadlines are stored as the duration (REQ-MONITOR-155)
 * and rehydrated against a fresh start reading.
 */
export class Budget {
  private constructor(
    readonly start: Millis,
    readonly duration: Millis,
  ) {}

  static begin(start: Millis, duration: Millis): Budget {
    return new Budget(start, duration);
  }

  /** The reading at which this budget expires. */
  get deadline(): Millis {
    return addMillis(this.start, this.duration);
  }

  remaining(now: Millis): Millis {
    const r = this.deadline - now;
    return (r > 0 ? r : 0) as Millis;
  }

  expired(now: Millis): boolean {
    return now >= this.deadline;
  }

  /** The tighter of two budgets governs; neither is mutated. */
  min(other: Budget): Budget {
    return this.deadline <= other.deadline ? this : other;
  }
}

/** ISO-8601 in UTC with millisecond precision, the one wall-clock convention used in records. */
export function toIsoUtc(i: Instant): string {
  return new Date(i).toISOString();
}

/**
 * A stamp safe in a file or directory name: ISO-8601 UTC with `:` and `.`
 * replaced. Milliseconds are kept — ADR-0058 step 8 measured that seconds
 * collide (spike 22, D6) and that the counter, not the granularity, is what
 * makes the name safe (IC-1 E4).
 */
export function fileStamp(i: Instant): string {
  return toIsoUtc(i).replace(/[:.]/g, '-');
}
