import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ADR-0064 — the gitignore matcher (REQ-WORKSPACE-100), and the product's **one** definition of it.
 *
 * It arrives here rather than in `agent-tools` because classification lives in `config` and
 * `agent-tools` may import `config` while the reverse edge does not exist. `agent-tools`'
 * `tools/search.ts` re-exports these three names, so `grep`, `glob` and the contains-code walk all
 * read one grammar. The reader it replaces was a deliberate subset — its own comment called it "a
 * small gitignore reader" — and it already carried the two things REQ-WORKSPACE-100 names by name,
 * `!` negation and `**`, together with last-match-wins. What is added here is the rest of what that
 * requirement calls "the full gitignore pattern grammar":
 *
 * - **character classes** — `[a-z]`, `[!0-9]`, `[^abc]`, a leading `]` inside the class, and an
 *   unterminated `[` taken literally as git does. The subset escaped `[` and `]` and matched them
 *   as characters, so a directory pattern `vendor/[a-z]*` excluded nothing and its files counted
 *   toward the verdict.
 * - **escapes** — `\#`, `\!`, a trailing escaped space, and a backslash before any metacharacter.
 * - **trailing whitespace**, stripped unless escaped, which git does and the subset did unconditionally.
 * - **a double star on its own segment** — spanning zero directories in the middle of a pattern, and
 *   as a leading segment.
 *
 * Why this matters to the verdict rather than only to `grep`: REQ-WORKSPACE-100 says in terms that a
 * subset "would classify a workspace as `code` on the strength of files the repository has said are
 * not part of it", and that classification decides whether a 1800 s indexing stage runs.
 *
 * Only the workspace-root `.gitignore` is read (REQ-WORKSPACE-100, first sentence); nested ignore
 * files have no effect. A file that is missing, empty or unreadable leaves nothing ignored and never
 * makes the caller fail.
 */
export interface IgnoreRule {
  readonly re: RegExp;
  readonly negated: boolean;
  readonly dirOnly: boolean;
}

const RE_META = /[.+^${}()|[\]\\?*]/g;
const escapeRe = (s: string): string => s.replace(RE_META, '\\$&');

/**
 * Git strips trailing whitespace unless the last space is escaped. Escapes elsewhere in the line are
 * left in place for the compiler below, which consumes them one metacharacter at a time.
 */
function stripTrailingSpace(line: string): string {
  let end = line.length;
  while (end > 0 && (line[end - 1] === ' ' || line[end - 1] === '\t')) {
    let backslashes = 0;
    for (let i = end - 2; i >= 0 && line[i] === '\\'; i -= 1) backslashes += 1;
    if (backslashes % 2 === 1) break;
    end -= 1;
  }
  return line.slice(0, end);
}

/** The index of the `]` closing a class opened at `open`, or -1 when the class is unterminated. */
function classEnd(pattern: string, open: number): number {
  let i = open + 1;
  if (pattern[i] === '!' || pattern[i] === '^') i += 1;
  if (pattern[i] === ']') i += 1;
  for (; i < pattern.length; i += 1) {
    if (pattern[i] === '\\') { i += 1; continue; }
    if (pattern[i] === ']') return i;
  }
  return -1;
}

/** `[!a-z]` → `[^a-z]`; everything else inside is passed through with its escapes preserved. */
function compileClass(source: string): string {
  const body = source.slice(1, -1);
  const negated = body.startsWith('!') || body.startsWith('^');
  const rest = negated ? body.slice(1) : body;
  // A `[` or a bare `\` inside a class is a literal in git and a syntax hazard in JavaScript.
  const safe = rest.replace(/\\(.)/g, '\\$1').replace(/\[/g, '\\[');
  return `[${negated ? '^' : ''}${safe}]`;
}

/** One pattern's body — negation, anchoring and the directory marker already removed — as a regex source. */
function compileBody(pattern: string): string {
  let re = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i] as string;
    if (ch === '\\' && i + 1 < pattern.length) { re += escapeRe(pattern[i + 1] as string); i += 2; continue; }
    if (ch === '*' && pattern[i + 1] === '*') {
      const segmentStart = i === 0 || pattern[i - 1] === '/';
      if (segmentStart && pattern[i + 2] === '/') { re += '(?:[^/]+/)*'; i += 3; continue; }
      if (segmentStart && i + 2 === pattern.length) { re += '.*'; i += 2; continue; }
      // Any other run of asterisks is an ordinary `*` in git: it stops at a slash (`a**b` keeps `ax/yb`).
      re += '[^/]*';
      i += 2;
      continue;
    }
    if (ch === '*') { re += '[^/]*'; i += 1; continue; }
    if (ch === '?') { re += '[^/]'; i += 1; continue; }
    if (ch === '[') {
      const close = classEnd(pattern, i);
      if (close !== -1) { re += compileClass(pattern.slice(i, close + 1)); i = close + 1; continue; }
      re += '\\[';
      i += 1;
      continue;
    }
    re += escapeRe(ch);
    i += 1;
  }
  return re;
}

export function parseGitignore(text: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = stripTrailingSpace(raw);
    if (line === '' || line.startsWith('#')) continue;
    let negated = false;
    if (line.startsWith('!')) { negated = true; line = line.slice(1); }
    else if (line.startsWith('\\#') || line.startsWith('\\!')) line = line.slice(1);
    let dirOnly = false;
    if (line.endsWith('/') && !line.endsWith('\\/')) { dirOnly = true; line = line.slice(0, -1); }
    if (line === '') continue;
    // A `/` anywhere but the (already removed) trailing position anchors the pattern to the root.
    const anchored = line.includes('/');
    if (line.startsWith('/')) line = line.slice(1);
    const body = compileBody(line);
    // A rule matches the path itself and nothing beneath it: what lies beneath an ignored directory is
    // ignored through that ancestor (`ignoredBy`), the one order in which a re-included directory under
    // an ignored glob (`gen/*` then `!gen/keep/`) keeps its files, as git keeps them. The descendant
    // suffix every rule carried until 2026-10-07 matched `gen/keep/f.ts` by `gen/*` itself, where the
    // directory-only `!gen/keep/` is never asked about a file, and so dropped what git keeps
    // (docs/defects/fixed/a-re-included-directory-under-an-ignored-glob-keeps-its-files-ignored.md).
    const pattern = anchored ? `^${body}$` : `(?:^|/)${body}$`;
    rules.push({ re: new RegExp(pattern), negated, dirOnly });
  }
  return rules;
}

/**
 * The path's own verdict, its ancestors taken as kept: the last pattern matching the path decides it
 * (REQ-WORKSPACE-100), a directory-only pattern asked only about a directory. A walk that prunes every
 * ignored directory before descending has already asked about the ancestors, and asks only this.
 */
export function ignoredHere(rules: readonly IgnoreRule[], relPosix: string, isDir: boolean): boolean {
  let ignored = false;
  for (const r of rules) {
    if (r.dirOnly && !isDir) continue;
    if (r.re.test(relPosix)) ignored = !r.negated;
  }
  return ignored;
}

/**
 * Whether the repository treats this workspace-relative path as ignored (REQ-WORKSPACE-100), in git's
 * order: a path beneath an ignored directory is ignored, whatever a later pattern says of the path,
 * because git never looks inside an excluded directory; otherwise the path's own verdict decides.
 */
export function ignoredBy(rules: readonly IgnoreRule[], relPosix: string, isDir: boolean): boolean {
  for (let slash = relPosix.indexOf('/'); slash !== -1; slash = relPosix.indexOf('/', slash + 1)) {
    if (ignoredHere(rules, relPosix.slice(0, slash), true)) return true;
  }
  return ignoredHere(rules, relPosix, isDir);
}

export function loadRules(root: string): IgnoreRule[] {
  const f = join(root, '.gitignore');
  if (!existsSync(f)) return [];
  try {
    return parseGitignore(readFileSync(f, 'utf8'));
  } catch {
    return [];
  }
}
