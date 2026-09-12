export function classes(...values: readonly (string | false | null | undefined)[]): string {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ');
}

export function componentClass(className: string | undefined, foundation: string): string {
  if (className === undefined || className.trim() === '') return foundation;
  return className;
}
