/**
 * REQ-MCP-117 / ADR-0034: the ONE comparator behind every ordered presentation in the MCP domain, kept in
 * the kernel because both `@rotaris/mcp` and the configuration pipeline in `@rotaris/config` order by it and
 * neither may import the other (the component view) —
 * ascending code-point order over the raw string, position by position, shorter-prefix first,
 * case-sensitive, locale-independent, identical on every platform. Locale collation is banned in
 * `packages/mcp` and the configuration pipeline by test (`order.test.ts` greps for the two spellings).
 *
 * Why not the default `Array.prototype.sort` order: JavaScript strings compare by UTF-16 code UNIT,
 * which orders an astral character (a tool name with an emoji, U+1F600 → D83D DE00) before U+E000..U+FFFF
 * where code-point order puts it after — a real difference for MCP servers.
 */
export function compareCodePoints(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ca = a.codePointAt(i)!;
    const cb = b.codePointAt(j)!;
    if (ca !== cb) return ca < cb ? -1 : 1;
    i += ca > 0xffff ? 2 : 1;
    j += cb > 0xffff ? 2 : 1;
  }
  const ra = i < a.length;
  const rb = j < b.length;
  if (ra === rb) return 0;
  return ra ? 1 : -1;
}

export function sortCodePoints<T>(items: Iterable<T>, key: (item: T) => string = (x) => String(x)): T[] {
  return [...items].sort((x, y) => compareCodePoints(key(x), key(y)));
}
