/**
 * Joins class names, keeping the first occurrence of each. A migrated caller passes the
 * foundation class it already carried (`btn btn-primary`), and a token repeated in the
 * attribute is a string no selector written against `className` can match.
 */
export function classes(...values: readonly (string | false | null | undefined)[]): string {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    for (const token of value.split(/\s+/)) if (token !== '') seen.add(token);
  }
  return [...seen].join(' ');
}

export function componentClass(className: string | undefined, foundation: string): string {
  if (className === undefined || className.trim() === '') return foundation;
  return className;
}
