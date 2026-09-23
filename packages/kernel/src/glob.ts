/**
 * The glob dialect of REQ-TOOLS-138..141 — double star, star, question mark and brace alternatives — compiled
 * to a regular expression over workspace-relative POSIX paths. One compiler serves every reader of that dialect:
 * the `glob` tool (`@rotaris/agent-tools`) and a delegated child's `write_scope` (PD-TOOLS-006, `@rotaris/engine`),
 * which the directive defines "in the pattern dialect of the `glob` tool". It lives here because the engine and
 * the tools do not import each other, and a second compiler would let the two readings drift.
 */

/** The glob compiler has its own escaping; gitignore's lives with the grammar it serves. */
const escapeRe = (s: string): string => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

/** The index of the `}` that closes the `{` at `start`, or -1 when the group is never closed. */
function closingBrace(p: string, start: number): number {
  let depth = 0;
  for (let i = start; i < p.length; i += 1) {
    if (p[i] === '{') depth += 1;
    else if (p[i] === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

/** A brace group's alternatives: split on the commas at ITS level, so `{a,{b,c}}` is two, not three. */
function braceAlternatives(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '{') depth += 1;
    else if (body[i] === '}') depth -= 1;
    else if (body[i] === ',' && depth === 0) { out.push(body.slice(from, i)); from = i + 1; }
  }
  out.push(body.slice(from));
  return out;
}

/**
 * One glob, translated. Recursive, and that recursion is the whole point of the function existing apart from
 * `globToRegExp`: a brace alternative is a glob like any other, and until 2026-09-16 each one was passed through
 * `escapeRe` instead — which escapes `.` but leaves `*` alone, so `{*.json,*.ts}` compiled to `(?:*\.json|*\.ts)`
 * and the engine refused it as `Nothing to repeat`. The alternative that reached a user was
 * a `{*.json,*.js,*.ts,*.cjs,*.mjs}` group under a `packages` wildcard step — a shape ripgrep and every shell
 * accept, and REQ-TOOLS-141 holds that what an accelerator accepts the in-process path may not refuse.
 *
 * Character classes (`[abc]`) are still literal here, as they have always been; that is a separate gap and is
 * recorded as one rather than widened into silently.
 */
function translateGlob(p: string): string {
  let re = '';
  for (let i = 0; i < p.length; i += 1) {
    const ch = p[i] as string;
    if (ch === '*' && p[i + 1] === '*') {
      i += 1;
      if (p[i + 1] === '/') { re += '(?:.*/)?'; i += 1; } else re += '.*';
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else if (ch === '{') {
      const end = closingBrace(p, i);
      // An unclosed `{` is a literal brace, which is what a caller who typed one meant.
      if (end > i) { re += `(?:${braceAlternatives(p.slice(i + 1, end)).map(translateGlob).join('|')})`; i = end; }
      else re += '\\{';
    } else re += escapeRe(ch);
  }
  return re;
}

export interface GlobOptions {
  /**
   * Match without regard to case. The `glob` tool matches case-sensitively; a write scope compares paths the
   * way the file tools identify them, which is lower-cased (`FileToolState.key`, the fence's `isInside`).
   */
  readonly caseInsensitive?: boolean;
}

/** Glob patterns (double-star, star, question mark, braces) to a regex over POSIX relative paths. */
export function globToRegExp(pattern: string, options: GlobOptions = {}): RegExp {
  const p = pattern.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  return new RegExp(`^${translateGlob(p)}$`, options.caseInsensitive === true ? 'i' : '');
}
