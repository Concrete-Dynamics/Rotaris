/**
 * A value of unknown shape as text, the way `String()` writes it except for an object or an array, which `String()`
 * writes as `[object Object]` or as its members joined by commas: here either is its compact JSON, and one JSON cannot
 * write (a cycle) falls back to its `[object …]` tag. `@typescript-eslint/no-base-to-string` flags `String()` over such
 * a value (R-091, the first type-aware lint run); a field read back from stored JSON is the usual one.
 */
export function textOf(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return value;
    case 'object':
      if (value === null) return 'null';
      try {
        return JSON.stringify(value);
      } catch {
        return Object.prototype.toString.call(value);
      }
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'undefined':
    case 'function':
      return String(value);
    case 'symbol':
      return value.toString();
  }
}
