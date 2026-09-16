import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { ignoredBy, loadRules, parseGitignore, type IgnoreRule } from '@rotaris/config';
import { checkFence, isInside, realPathOf, type FenceConfig } from './fence.js';
import { errorObservation, observation, type ToolExecutor } from './types.js';

/**
 * The search tools (REQ-TOOLS-138..141): read-only, workspace-confined, no shell, no network. One walker
 * applies the scan filters — non-files and symlinks skipped, the hard-coded ignore components, the
 * workspace's `.gitignore` when present, files over 2 MiB, probable binaries (NUL in the first 1024).
 * Results are identical whether or not an external accelerator exists on the host: there is none.
 */
export const IGNORE_COMPONENTS: ReadonlySet<string> = new Set([
  '.git', '.hg', '.svn', '.idea', '.vscode', '.mypy_cache', '.pytest_cache', '.ruff_cache', '.tox', '.venv', '__pycache__', 'dist', 'venv',
  'node_modules', '.pnpm', '.next', '.nuxt', 'coverage', '.turbo', 'cache', 'build', 'out', 'target', '.nx', '.rotaris',
]);
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * ADR-0064 moved the gitignore grammar to `@rotaris/config` (`init/gitignore.ts`) and these three names
 * are re-exported so every caller keeps reading one definition. The reader that stood here was a
 * deliberate subset — its own comment said so — and REQ-WORKSPACE-100 requires the full grammar of the
 * walk that classifies a workspace. Two readers would have meant `grep` and the classifier disagreeing
 * about which files the repository says are part of it.
 */
export { ignoredBy, loadRules, parseGitignore };
export type { IgnoreRule };

/** The glob compiler below has its own escaping; gitignore's lives with the grammar it serves. */
const escapeRe = (s: string): string => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

/** Read off the leading `(?flags)` groups, one after another, so that `(?i)(?m)x` sets both. */
const INLINE_FLAG_GROUP = /^\(\?([A-Za-z]+)\)/;
const ANY_FLAG_GROUP = /\(\?[A-Za-z]+\)/;
const TRANSLATABLE_FLAGS: Readonly<Record<string, string>> = { i: 'i', m: 'm', s: 's', u: 'u' };

/**
 * The dialect a caller's `pattern` is written in (REQ-TOOLS-134, REQ-TOOLS-138). The product's declared
 * search accelerator is ripgrep — REQ-STARTUP-058 pins it for the `search` capability — and REQ-TOOLS-141
 * holds observable results identical whether or not it is present on the host, so a pattern that
 * accelerator accepts may not be refused by the in-process path. That dialect sets flags with a leading
 * group (`(?i)needle`), which the host engine rejects outright as `Invalid group`; the leading groups are
 * read off here and translated into RegExp flags. Scoped modifiers (`(?i:needle)`) the host engine already
 * accepts and are left exactly where they stand.
 *
 * A flag with no counterpart is refused rather than dropped: `(?x)` changes what the rest of the pattern
 * means, and a silently ignored flag returns matches the caller did not ask for, which is worse than the
 * error. Never compiled with `g` — the result is reused across lines and `lastIndex` would carry between them.
 */
export function compileSearchPattern(pattern: string): RegExp {
  let rest = pattern;
  const flags = new Set<string>();
  for (let m = INLINE_FLAG_GROUP.exec(rest); m !== null; m = INLINE_FLAG_GROUP.exec(rest)) {
    for (const letter of m[1] as string) {
      const mapped = TRANSLATABLE_FLAGS[letter];
      if (mapped === undefined) throw new SyntaxError(`Inline flag '${letter}' is not supported. The supported inline flags are i, m, s and u.`);
      flags.add(mapped);
    }
    rest = rest.slice(m[0].length);
  }
  try {
    return new RegExp(rest, [...flags].sort().join(''));
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    // The failure that brought a caller here twice is a flag group part-way through the pattern. Saying so
    // is what lets the next attempt differ from the last one; the bare engine message did not.
    const hint = ANY_FLAG_GROUP.test(rest) ? ' Inline flags are read only at the start of the pattern — write (?i)needle, or scope them as (?i:needle).' : '';
    throw new SyntaxError(`${detail}${hint}`);
  }
}

export interface WalkOptions {
  readonly root: string;
  readonly rules: readonly IgnoreRule[];
  readonly base: string;
}

/** Every file that passes the filters, as workspace-relative POSIX paths, in directory order. */
export function walkFiles(o: WalkOptions, onFile: (relPosix: string, abs: string) => boolean | void): void {
  const rootReal = realPathOf(o.root);
  const rel = (abs: string) => relative(rootReal, abs).split(sep).join('/');
  const visit = (dir: string): boolean => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return true;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (IGNORE_COMPONENTS.has(e.name)) continue;
      const r = rel(abs);
      if (e.isDirectory()) {
        if (ignoredBy(o.rules, r, true)) continue;
        if (!visit(abs)) return false;
        continue;
      }
      if (!e.isFile()) continue;
      if (ignoredBy(o.rules, r, false)) continue;
      if (!isInside(rootReal, abs)) continue;
      let size: number;
      try { size = statSync(abs).size; } catch { continue; }
      if (size > MAX_FILE_BYTES) continue;
      if (onFile(r, abs) === false) return false;
    }
    return true;
  };
  visit(o.base);
}

function probablyBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, 1024).includes(0);
}

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

/** Glob patterns (double-star, star, question mark, braces) to a regex over POSIX relative paths. */
export function globToRegExp(pattern: string): RegExp {
  const p = pattern.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  return new RegExp(`^${translateGlob(p)}$`);
}

const grepSchema = z.object({
  pattern: z.string(),
  paths: z.union([z.array(z.string()), z.string()]).optional(),
  path: z.string().optional(),
  max_matches: z.number().int().min(1).default(100),
});

export function grepTool(fence: FenceConfig): ToolExecutor<z.infer<typeof grepSchema>> {
  return {
    name: 'grep',
    description: 'Search workspace files for a regular expression. Returns file:line:content per match (workspace-relative), up to max_matches.',
    schema: grepSchema,
    label: (a) => `grep ${a.pattern}`,
    execute: async (a) => {
      let re: RegExp;
      try {
        re = compileSearchPattern(a.pattern);
      } catch (cause) {
        return errorObservation(`Invalid regex pattern: ${String(cause instanceof Error ? cause.message : cause)}`);
      }
      const roots = (Array.isArray(a.paths) ? a.paths : a.paths ? [a.paths] : a.path ? [a.path] : ['.']);
      const rules = loadRules(fence.workspaceRoot);
      const out: string[] = [];
      for (const r of roots) {
        // REQ-TOOLS-139: outside the workspace is skipped, never served — the read-only roots grant nothing here.
        const v = checkFence({ ...fence, allowOutsideWorkspace: false, additionalReadOnlyRoots: [] }, r, 'read');
        if (!v.ok || !existsSync(v.resolved)) continue;
        const base = statSync(v.resolved).isDirectory() ? v.resolved : resolve(v.resolved, '..');
        const only = statSync(v.resolved).isDirectory() ? null : realPathOf(v.resolved).replace(/\\/g, '/').toLowerCase();
        walkFiles({ root: fence.workspaceRoot, rules, base }, (rel, abs) => {
          if (only && abs.replace(/\\/g, '/').toLowerCase() !== only) return;
          const bytes = readFileSync(abs);
          if (probablyBinary(bytes)) return;
          const lines = bytes.toString('utf8').split('\n');
          for (let i = 0; i < lines.length; i += 1) {
            if (re.test(lines[i] as string)) {
              out.push(`${rel}:${i + 1}:${lines[i]}`);
              if (out.length >= a.max_matches) return false;
            }
          }
          return undefined;
        });
        if (out.length >= a.max_matches) break;
      }
      return observation(out.length === 0 ? 'No matches found' : out.join('\n'));
    },
  };
}

const globSchema = z.object({
  pattern: z.string(),
  base_path: z.string().optional(),
});

export function globTool(fence: FenceConfig): ToolExecutor<z.infer<typeof globSchema>> {
  return {
    name: 'glob',
    description: 'Find workspace files matching a glob pattern such as **/*.ts. Returns workspace-relative POSIX paths, sorted.',
    schema: globSchema,
    label: (a) => `glob ${a.pattern}`,
    execute: async (a) => {
      const rootReal = realPathOf(fence.workspaceRoot);
      let base = rootReal;
      if (a.base_path) {
        const candidate = resolve(rootReal, a.base_path);
        // REQ-TOOLS-141: a base outside the workspace or not a directory is silently ignored.
        if (isInside(rootReal, realPathOf(candidate)) && existsSync(candidate) && statSync(candidate).isDirectory()) base = candidate;
      }
      let pattern = a.pattern.replace(/\\/g, '/');
      // An absolute pattern is relativised to the workspace or dropped.
      if (/^([A-Za-z]:)?\//.test(pattern)) {
        const abs = realPathOf(pattern.replace(/\*.*$/, ''));
        if (!isInside(rootReal, abs)) return observation('No files found');
        pattern = pattern.slice(rootReal.replace(/\\/g, '/').length).replace(/^\//, '');
      }
      /*
       * REQ-TOOLS-138: a pattern the compiler cannot read is a recoverable error naming what was wrong, the same
       * answer `grep` gives. Unguarded, the RegExp constructor's own message escaped to the model instead — it
       * quoted the generated regex source, which is an internal the caller never wrote and cannot correct.
       */
      let re: RegExp;
      try {
        re = globToRegExp(pattern);
      } catch (cause) {
        return errorObservation(`Invalid glob pattern: ${String(cause instanceof Error ? cause.message : cause)}. The pattern supports *, **, ? and {a,b} alternatives over workspace-relative POSIX paths.`);
      }
      const baseRel = relative(rootReal, base).split(sep).join('/');
      const rules = loadRules(fence.workspaceRoot);
      const found = new Set<string>();
      walkFiles({ root: fence.workspaceRoot, rules, base }, (rel) => {
        const underBase = baseRel === '' ? rel : rel.startsWith(`${baseRel}/`) ? rel.slice(baseRel.length + 1) : null;
        if (underBase !== null && re.test(underBase)) found.add(rel);
      });
      const list = [...found].sort();
      return observation(list.length === 0 ? 'No files found' : list.join('\n'));
    },
  };
}

