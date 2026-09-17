import { useEffect, useState } from 'react';

/**
 * A trailing debounced value: the latest input after it has been stable for `delayMs`.
 * The Settings model pickers filter on this, so typing narrows the list without re-filtering
 * per keystroke; selection commits immediately and never waits on it.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return settled;
}

/** REQ-TRACE-363's precedent: the one debounce interval the product already uses for a filter field. */
export const FILTER_DEBOUNCE_MS = 150;
