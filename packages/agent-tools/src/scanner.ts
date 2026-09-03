/**
 * ADR-0018: a purpose-built shell scanner — not a parser, not regular expressions. One walk of the
 * line tracking single-quote, double-quote and backslash state; operators split segments longest
 * first (REQ-TOOLS-035) and the introducing operator stays with its segment; a redirection token ends
 * the matched token stream; command substitution, untokenizable text, an empty command, an
 * indirection head or a shell head with `-c` / no arguments make a segment unconfident
 * (REQ-TOOLS-036). `decompose` never throws and always yields at least one segment (REQ-TOOLS-037);
 * `tokenizePattern` throws REQ-TOOLS-034's error. Glob per token is `*` / `?` only; the first token
 * folds case and every later token does not (REQ-TOOLS-033).
 */
export type Operator = '' | '&&' | '||' | ';;' | ';' | '|' | '&' | '\n';

export interface Segment {
  /** The operator that introduced this segment; '' for the first. */
  readonly operator: Operator;
  readonly raw: string;
  /** Tokens up to (not including) the first redirection token. */
  readonly tokens: readonly string[];
  /** Null when the segment can be read statically. */
  readonly unconfident: string | null;
}

const INDIRECTION_HEADS: ReadonlySet<string> = new Set(['eval', 'exec', 'source', '.', 'xargs', 'env', 'nohup', 'time']);
export const SHELL_HEADS: ReadonlySet<string> = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'cmd', 'powershell', 'pwsh']);
const INLINE_SCRIPT_FLAGS: ReadonlySet<string> = new Set(['-c', '-Command', '/c', '/C']);
const OPERATORS: readonly Operator[] = ['&&', '||', ';;', ';', '|', '&', '\n'];

interface Tokenised {
  readonly tokens: string[];
  readonly error: string | null;
  readonly substitution: boolean;
}

/** Split one segment's text into tokens under quote and backslash rules. Never throws. */
function tokenise(text: string): Tokenised {
  const tokens: string[] = [];
  let cur = '';
  let inTok = false;
  let sq = false;
  let dq = false;
  let substitution = false;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (sq) {
      if (ch === "'") sq = false;
      else cur += ch;
      continue;
    }
    if (ch === '\\' && i + 1 < text.length) {
      cur += text[i + 1];
      inTok = true;
      i += 1;
      continue;
    }
    if (ch === '`') substitution = true;
    if (ch === '$' && text[i + 1] === '(') { substitution = true; depth += 1; }
    if (dq) {
      if (ch === '"') dq = false;
      else cur += ch;
      continue;
    }
    if (ch === "'") { sq = true; inTok = true; continue; }
    if (ch === '"') { dq = true; inTok = true; continue; }
    if (ch === '(' && depth > 0) { cur += ch; continue; }
    if (ch === ')' && depth > 0) { depth -= 1; cur += ch; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      if (inTok) { tokens.push(cur); cur = ''; inTok = false; }
      continue;
    }
    cur += ch;
    inTok = true;
  }
  if (inTok) tokens.push(cur);
  if (sq) return { tokens, error: 'unbalanced single quote', substitution };
  if (dq) return { tokens, error: 'unbalanced double quote', substitution };
  return { tokens, error: null, substitution };
}

function isRedirection(tok: string): boolean {
  return /^(\d*[<>]|&>)/.test(tok);
}

/** Cut the line on operators outside quotes, longest operator first, retaining each operator. */
function split(line: string): { operator: Operator; raw: string }[] {
  const out: { operator: Operator; raw: string }[] = [];
  let sq = false;
  let dq = false;
  let start = 0;
  let op: Operator = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] as string;
    if (ch === '\\' && !sq) { i += 1; continue; }
    if (sq) { if (ch === "'") sq = false; continue; }
    if (dq) { if (ch === '"') dq = false; continue; }
    if (ch === "'") { sq = true; continue; }
    if (ch === '"') { dq = true; continue; }
    const hit = OPERATORS.find((o) => line.startsWith(o, i));
    if (hit) {
      out.push({ operator: op, raw: line.slice(start, i) });
      op = hit;
      i += hit.length - 1;
      start = i + 1;
    }
  }
  out.push({ operator: op, raw: line.slice(start) });
  return out;
}

function classify(raw: string, t: Tokenised): string | null {
  if (t.error) return `cannot be tokenized: ${t.error}`;
  if (t.substitution) return 'contains command substitution';
  const cmd = t.tokens.filter((_, i) => !t.tokens.slice(0, i + 1).some(isRedirection));
  if (raw.trim() !== '' && cmd.length === 0) return 'no command after redirection stripping';
  const head = cmd[0];
  if (head === undefined) return null;
  const h = head.toLowerCase();
  if (INDIRECTION_HEADS.has(h)) return `runs another command through '${head}'`;
  if (SHELL_HEADS.has(h)) {
    const rest = cmd.slice(1);
    if (rest.length === 0) return `'${head}' with no arguments`;
    if (rest.some((a) => INLINE_SCRIPT_FLAGS.has(a))) return `'${head}' with an inline script`;
  }
  return null;
}

/** REQ-TOOLS-035/036/037: never throws; at least one segment; an unparseable line is one unconfident segment. */
export function decompose(line: string): Segment[] {
  try {
    const parts = split(String(line));
    const segments: Segment[] = [];
    for (const p of parts) {
      const t = tokenise(p.raw);
      const tokens: string[] = [];
      for (const tok of t.tokens) { if (isRedirection(tok)) break; tokens.push(tok); }
      segments.push({ operator: p.operator, raw: p.raw, tokens, unconfident: classify(p.raw, t) });
    }
    // Empty segments left by a trailing operator or blank text are kept only when they are the sole segment.
    const real = segments.filter((s) => s.raw.trim() !== '');
    return real.length > 0 ? real : [{ operator: '', raw: String(line), tokens: [], unconfident: segments[0]?.unconfident ?? null }];
  } catch (cause) {
    return [{ operator: '', raw: String(line), tokens: [], unconfident: `unparseable: ${String(cause)}` }];
  }
}

/** REQ-TOOLS-034: a policy-build-time error for a pattern that is empty or cannot be tokenized. */
export function tokenizePattern(text: string): string[] {
  if (text.trim() === '') throw new Error(`Command pattern '${text}' is empty`);
  const t = tokenise(text);
  if (t.error) throw new Error(`Command pattern '${text}' is not tokenisable: ${t.error}`);
  if (t.tokens.length === 0) throw new Error(`Command pattern '${text}' is not tokenisable: no tokens`);
  return t.tokens;
}

/** A small `*` / `?` matcher; a `*` never acquires regex semantics. */
export function globToken(pattern: string, token: string): boolean {
  const memo = new Map<string, boolean>();
  const go = (p: number, t: number): boolean => {
    const key = `${p}:${t}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let r: boolean;
    if (p === pattern.length) r = t === token.length;
    else if (pattern[p] === '*') r = go(p + 1, t) || (t < token.length && go(p, t + 1));
    else if (t < token.length && (pattern[p] === '?' || pattern[p] === token[t])) r = go(p + 1, t + 1);
    else r = false;
    memo.set(key, r);
    return r;
  };
  return go(0, 0);
}

/** REQ-TOOLS-033: token-by-token; a trailing `*` matches any number of further tokens including zero. */
export function tokensMatch(patternTokens: readonly string[], tokens: readonly string[]): boolean {
  const trailing = patternTokens[patternTokens.length - 1] === '*';
  const fixed = trailing ? patternTokens.slice(0, -1) : patternTokens;
  if (trailing ? tokens.length < fixed.length : tokens.length !== fixed.length) return false;
  for (let i = 0; i < fixed.length; i += 1) {
    const p = fixed[i] as string;
    const t = tokens[i] as string;
    const ok = i === 0 ? globToken(p.toLowerCase(), t.toLowerCase()) : globToken(p, t);
    if (!ok) return false;
  }
  return true;
}

/** REQ-TOOLS-038: the three matchers, each deciding only whether its own rule fires. */
export function patternMatcherFires(compiled: readonly (readonly string[])[], segments: readonly Segment[]): boolean {
  return segments.some((s) => s.tokens.length > 0 && compiled.some((p) => tokensMatch(p, s.tokens)));
}
export function escalationMatcherFires(segments: readonly Segment[]): boolean {
  return segments.some((s) => s.unconfident !== null || (s.raw.trim() !== '' && s.tokens.length === 0));
}
export function pipeToShellMatcherFires(segments: readonly Segment[]): boolean {
  return segments.some((s) => s.operator === '|' && s.tokens.length > 0 && SHELL_HEADS.has((s.tokens[0] as string).toLowerCase()));
}
