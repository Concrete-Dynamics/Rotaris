/**
 * REQ-HOOKS-025: the product's single definition of hook matcher evaluation — the separator set the
 * command line is divided at, the one quoting convention used on every platform alike, the glob
 * comparison and the trailing-`*` rule. It lives here because configuration loading validates a matcher
 * (REQ-HOOKS-008/012) and the hooks package evaluates one; both import this and neither restates it.
 *
 * Not the permission scanner of ADR-0018: that one honours `;;`, `$(…)` and backslash escapes for the
 * policy's purposes (REQ-TOOLS-033/035). Here a backslash is an ordinary character, `?` and `[` are
 * literal, and the separator set is exactly the six below — so the two are different definitions and
 * are kept apart on purpose (checked at build: ADR-0018's set carries `;;`, which this one does not).
 */
export const HOOK_SEGMENT_SEPARATORS = ['&&', '||', ';', '|', '&', '\n'] as const;

/** Divide a command line at the separators outside quotes. Never throws; an unterminated quote closes at the end. */
export function segmentCommandLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    const two = line.slice(i, i + 2);
    if (two === '&&' || two === '||') { out.push(cur); cur = ''; i += 1; continue; }
    if (ch === ';' || ch === '|' || ch === '&' || ch === '\n') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Tokenise under the one convention: a break at each run of whitespace outside quotes; a quoted run
 * groups into the surrounding token with the quote characters removed; a backslash is literal. Returns
 * null for text that cannot be tokenised (an unterminated quote), which REQ-HOOKS-028 resolves as
 * "no match" at match time and REQ-HOOKS-012 rejects at load time.
 */
export function tokenizeHookPattern(text: string): string[] | null {
  const tokens: string[] = [];
  let cur = '';
  let inToken = false;
  let quote: '"' | "'" | null = null;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; inToken = true; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      if (inToken) { tokens.push(cur); cur = ''; inToken = false; }
      continue;
    }
    cur += ch;
    inToken = true;
  }
  if (quote) return null;
  if (inToken) tokens.push(cur);
  return tokens;
}

/** Case-sensitive glob in which `*` is the only metacharacter; every other character is literal. */
export function hookGlob(pattern: string, candidate: string): boolean {
  const memo = new Map<string, boolean>();
  const go = (p: number, c: number): boolean => {
    const k = `${p}:${c}`;
    const m = memo.get(k);
    if (m !== undefined) return m;
    let r: boolean;
    if (p === pattern.length) r = c === candidate.length;
    else if (pattern[p] === '*') r = go(p + 1, c) || (c < candidate.length && go(p, c + 1));
    else r = c < candidate.length && pattern[p] === candidate[c] && go(p + 1, c + 1);
    memo.set(k, r);
    return r;
  };
  return go(0, 0);
}

/** Positional comparison of one segment's tokens against a pattern's tokens, with the trailing bare `*` rule. */
export function tokensMatchPattern(patternTokens: readonly string[], tokens: readonly string[]): boolean {
  if (patternTokens.length === 0) return false;
  const last = patternTokens[patternTokens.length - 1];
  const open = last === '*';
  const fixed = open ? patternTokens.length - 1 : patternTokens.length;
  if (open ? tokens.length < fixed : tokens.length !== fixed) return false;
  for (let i = 0; i < fixed; i += 1) if (!hookGlob(patternTokens[i]!, tokens[i]!)) return false;
  return true;
}

/** REQ-HOOKS-024/025/028: a pattern against every segment of a command line; total over every input. */
export function commandPatternMatches(pattern: string, commandLine: string): boolean {
  const patternTokens = tokenizeHookPattern(pattern);
  if (patternTokens === null || patternTokens.length === 0) return false;
  for (const segment of segmentCommandLine(commandLine)) {
    const tokens = tokenizeHookPattern(segment);
    if (tokens === null) continue;
    if (tokensMatchPattern(patternTokens, tokens)) return true;
  }
  return false;
}
