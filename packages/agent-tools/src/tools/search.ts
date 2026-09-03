import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
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

const escapeRe = (s: string): string => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

interface IgnoreRule { readonly re: RegExp; readonly negated: boolean; readonly dirOnly: boolean }

/** A small gitignore reader: `*`, `**`, `?`, a leading `/` anchors, a trailing `/` is directories only, `!` negates. */
export function parseGitignore(text: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/\s+$/, '');
    if (line === '' || line.startsWith('#')) continue;
    let negated = false;
    if (line.startsWith('!')) { negated = true; line = line.slice(1); }
    let dirOnly = false;
    if (line.endsWith('/')) { dirOnly = true; line = line.slice(0, -1); }
    const anchored = line.startsWith('/') || line.includes('/');
    if (line.startsWith('/')) line = line.slice(1);
    let re = '';
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i] as string;
      if (ch === '*' && line[i + 1] === '*') { re += '.*'; i += 1; if (line[i + 1] === '/') i += 1; }
      else if (ch === '*') re += '[^/]*';
      else if (ch === '?') re += '[^/]';
      else re += escapeRe(ch);
    }
    const pattern = anchored ? `^${re}(/.*)?$` : `(^|/)${re}(/.*)?$`;
    rules.push({ re: new RegExp(pattern), negated, dirOnly });
  }
  return rules;
}

export function ignoredBy(rules: readonly IgnoreRule[], relPosix: string, isDir: boolean): boolean {
  let ignored = false;
  for (const r of rules) {
    if (r.dirOnly && !isDir) continue;
    if (r.re.test(relPosix)) ignored = !r.negated;
  }
  return ignored;
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

export function loadRules(root: string): IgnoreRule[] {
  const f = join(root, '.gitignore');
  if (!existsSync(f)) return [];
  try {
    return parseGitignore(readFileSync(f, 'utf8'));
  } catch {
    return [];
  }
}

function probablyBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, 1024).includes(0);
}

/** Glob patterns (double-star, star, question mark, braces) to a regex over POSIX relative paths. */
export function globToRegExp(pattern: string): RegExp {
  const p = pattern.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  let re = '';
  for (let i = 0; i < p.length; i += 1) {
    const ch = p[i] as string;
    if (ch === '*' && p[i + 1] === '*') {
      i += 1;
      if (p[i + 1] === '/') { re += '(?:.*/)?'; i += 1; } else re += '.*';
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else if (ch === '{') {
      const end = p.indexOf('}', i);
      if (end > i) { re += `(?:${p.slice(i + 1, end).split(',').map(escapeRe).join('|')})`; i = end; }
      else re += '\\{';
    } else re += escapeRe(ch);
  }
  return new RegExp(`^${re}$`);
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
        re = new RegExp(a.pattern);
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
      const re = globToRegExp(pattern);
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

