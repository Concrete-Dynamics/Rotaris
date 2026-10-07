import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { globToRegExp } from '@rotaris/kernel';
import { CODE_INTELLIGENCE_MARKER_SEGMENTS, ignoredBy, loadRules, parseGitignore, type IgnoreRule } from '@rotaris/config';
import { checkFence, isInside, realPathOf, type FenceConfig } from './fence.js';
import { errorObservation, observation, type ToolExecutor } from './types.js';

/**
 * The search tools (REQ-TOOLS-138..141): read-only, workspace-confined, no shell, no network. One walker
 * applies the scan filters — non-files and symlinks skipped, the hard-coded ignore components, the
 * workspace's `.gitignore` when present, files over 2 MiB, probable binaries (NUL in the first 1024).
 * Results are identical whether or not an external accelerator exists on the host: there is none.
 *
 * REQ-TOOLS-140's list, plus one member PD-TOOLS-012 adds: the directory holding the code-intelligence
 * runtime's per-project marker, the first segment of the marker path in REQ-MCP-116's binding manifest
 * (never written here as a literal). The product's own `.rotaris` is hidden, and since 2026-10-07 so is
 * the runtime's directory beside it (OQ-215, R-072); `read_file` still serves a file in it named by path.
 */
export const IGNORE_COMPONENTS: ReadonlySet<string> = new Set([
  '.git', '.hg', '.svn', '.idea', '.vscode', '.mypy_cache', '.pytest_cache', '.ruff_cache', '.tox', '.venv', '__pycache__', 'dist', 'venv',
  'node_modules', '.pnpm', '.next', '.nuxt', 'coverage', '.turbo', 'cache', 'build', 'out', 'target', '.nx', '.rotaris',
  CODE_INTELLIGENCE_MARKER_SEGMENTS[0] as string, // PD-TOOLS-012
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

/**
 * Whether the whole-workspace scan would never reach this workspace-relative path (REQ-TOOLS-139): the root-down walk's own
 * tests, applied to every step of the way down. A segment that is a hard-coded ignore component, a proper directory prefix
 * the workspace `.gitignore` prunes, or the path itself ignored. The path is relative to the run's own root, so a root that
 * lies under `.rotaris/worktrees/<w>` is not excluded by where it lies (OQ-219).
 */
export function scanExcludes(rules: readonly IgnoreRule[], relPosix: string, isDir: boolean): boolean {
  if (relPosix === '' || relPosix === '.') return false;
  const segments = relPosix.split('/');
  if (segments.some((seg) => IGNORE_COMPONENTS.has(seg))) return true;
  for (let i = 1; i < segments.length; i += 1) {
    if (ignoredBy(rules, segments.slice(0, i).join('/'), true)) return true;
  }
  return ignoredBy(rules, relPosix, isDir);
}

/**
 * Every file that passes the filters, as workspace-relative POSIX paths, in directory order. Beneath an explicit base the
 * walk returns exactly what the whole-workspace walk returns beneath it (REQ-TOOLS-139, OQ-219): a base the root-down walk
 * would have pruned is pruned here too, so it yields nothing.
 */
export function walkFiles(o: WalkOptions, onFile: (relPosix: string, abs: string) => boolean | void): void {
  const rootReal = realPathOf(o.root);
  const rel = (abs: string) => relative(rootReal, abs).split(sep).join('/');
  const baseReal = realPathOf(o.base);
  if (isInside(rootReal, baseReal) && scanExcludes(o.rules, rel(baseReal), true)) return;
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

/**
 * The glob compiler moved to `@rotaris/kernel` when PD-TOOLS-006's write scope became its second reader; it is
 * re-exported here so every existing caller keeps reading one definition.
 */
export { globToRegExp };

const grepSchema = z.object({
  pattern: z.string(),
  paths: z.union([z.array(z.string()), z.string()]).optional(),
  path: z.string().optional(),
  max_matches: z.number().int().min(1).default(100),
});

export function grepTool(fence: FenceConfig): ToolExecutor<z.infer<typeof grepSchema>> {
  return {
    name: 'grep',
    description: 'Search workspace files for a regular expression. Returns file:line:content per match (workspace-relative), up to max_matches. '
      + 'Whatever path or paths are given, files under the fixed dependency, build-output, version-control and product-state directories '
      + '(node_modules, dist, build, .git, .rotaris and the others) and gitignored files are never searched; read_file serves a named file, '
      + 'its grep argument searches it, and read_file on a named directory lists it.',
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
      const search = (rel: string, abs: string): boolean | undefined => {
        const bytes = readFileSync(abs);
        if (probablyBinary(bytes)) return undefined;
        const lines = bytes.toString('utf8').split('\n');
        for (let i = 0; i < lines.length; i += 1) {
          if (re.test(lines[i] as string)) {
            out.push(`${rel}:${i + 1}:${lines[i]}`);
            if (out.length >= a.max_matches) return false;
          }
        }
        return undefined;
      };
      for (const r of roots) {
        // REQ-TOOLS-139: outside the workspace is skipped, never served — the read-only roots grant nothing here.
        const v = checkFence({ ...fence, allowOutsideWorkspace: false, additionalReadOnlyRoots: [] }, r, 'read');
        if (!v.ok || !existsSync(v.resolved)) continue;
        const st = statSync(v.resolved);
        if (st.isDirectory()) {
          walkFiles({ root: fence.workspaceRoot, rules, base: v.resolved }, search);
        } else if (st.isFile()) {
          /*
           * A named file is searched directly, under the scan's own filters (OQ-219): only when the whole-workspace scan
           * would search it. Its parent's subtree is not walked to find it, and no case-folded comparison can take a
           * sibling that differs only in case.
           */
          if (!scanExcludes(rules, v.rel, false) && st.size <= MAX_FILE_BYTES) search(v.rel, v.resolved);
        }
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
    description: 'Find workspace files matching a glob pattern such as **/*.ts. Returns workspace-relative POSIX paths, sorted. '
      + 'Whatever base_path is given, files under the fixed dependency, build-output, version-control and product-state directories '
      + '(node_modules, dist, build, .git, .rotaris and the others) and gitignored files are never listed; read_file serves a named file '
      + 'and lists a named directory.',
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

