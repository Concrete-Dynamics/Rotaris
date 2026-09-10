import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join } from 'node:path';
import type { ProcessReply, PromptFile, PromptRoot, PromptsRootsResult } from '@rotaris/contracts';

/**
 * Part AO — REQ-CHAT-160's read of the three prompt roots, in the process that reads the user's files (ADR-0002).
 *
 * The roots are searched in exactly the requirement's order — `<workspace>/.agents/prompts/`, then
 * `~/.agents/prompts/`, then `<user-global configuration directory>/prompts/` — and every Markdown file lying
 * DIRECTLY inside a root is answered with its stem, its optional frontmatter `description` and `argument-hint`, and
 * its unexpanded body. A file whose frontmatter is malformed or that cannot be read is skipped with its reason and
 * never prevents another from registering; a root that does not exist yields nothing and is not a fault.
 *
 * What this module does NOT do is deliberate: the name normalisation, the `prompts:<stem>` + bare-stem registration,
 * the first-root-wins rule and REQ-CHAT-161's expansion are the renderer's (`ui/src/slash/prompts.ts`), because the
 * catalogue that holds the other names lives there and the collision rule needs both sides in one place. The files
 * are answered in root order, then in the directory's sorted name order, so the renderer's "first root to yield a
 * normalised name wins" is a plain first-seen rule over this list.
 *
 * The frontmatter grammar is the smallest one the requirement needs: a `---` line first, `key: value` lines, a `---`
 * line closing it. An opening fence with no closing fence, or a line inside that is not `key: value`, is MALFORMED
 * — the requirement's own word — and the file is skipped with that reason. It shares nothing with the YAML library
 * (ADR-0036's is for configuration) or with the traceability reader (ADR-0040 #2 has REQ-TRACE-009's different rule
 * for an unterminated block).
 */
export interface PromptRootsEnv {
  readonly workspaceRoot: string;
  /** The user's home; `homedir()` unless a caller supplies one. */
  readonly home?: string;
  /** The user-global configuration directory (`resolveUserDirs().config`). */
  readonly configDir: string;
}

export function promptRootDirectories(env: PromptRootsEnv): readonly { readonly root: PromptRoot; readonly dir: string }[] {
  return [
    { root: 'workspace', dir: join(env.workspaceRoot, '.agents', 'prompts') },
    { root: 'home', dir: join(env.home ?? homedir(), '.agents', 'prompts') },
    { root: 'config', dir: join(env.configDir, 'prompts') },
  ];
}

export type FrontmatterRead = { readonly ok: true; readonly fields: Readonly<Record<string, string>>; readonly body: string } | { readonly ok: false; readonly reason: string };

/** The optional frontmatter block, or the reason it is malformed. No frontmatter at all is fine: the whole text is the body. */
export function readPromptFrontmatter(text: string): FrontmatterRead {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return { ok: true, fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line === '---') return { ok: true, fields, body: lines.slice(i + 1).join('\n') };
    if (line.trim() === '') continue;
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (m === null) return { ok: false, reason: `malformed frontmatter: line ${i + 1} is not a "key: value" line` };
    fields[m[1]!] = stripQuotes(m[2]!.trim());
  }
  return { ok: false, reason: 'malformed frontmatter: the opening --- is never closed' };
}

function stripQuotes(v: string): string {
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) return v.slice(1, -1);
  return v;
}

export function readPromptRoots(env: PromptRootsEnv, log?: (message: string) => void): PromptsRootsResult {
  const files: PromptFile[] = [];
  const skipped: { path: string; reason: string }[] = [];
  for (const { root, dir } of promptRootDirectories(env)) {
    let names: string[];
    try {
      names = readdirSync(dir).filter((n) => extname(n).toLowerCase() === '.md').sort();
    } catch {
      continue; // a root that does not exist yields nothing (REQ-CHAT-160 names no fault for an absent root)
    }
    for (const name of names) {
      const path = join(dir, name);
      try {
        if (!statSync(path).isFile()) continue; // only files lying directly inside the root count
        const text = readFileSync(path, 'utf8');
        const fm = readPromptFrontmatter(text);
        if (!fm.ok) { skipped.push({ path, reason: fm.reason }); log?.(`prompt file skipped: ${path} — ${fm.reason}`); continue; }
        const description = fm.fields['description'];
        const argumentHint = fm.fields['argument-hint'];
        files.push({ root, path, stem: basename(name, extname(name)), body: fm.body, ...(description === undefined ? {} : { description }), ...(argumentHint === undefined ? {} : { argumentHint }) });
      } catch (cause) {
        const reason = `cannot be read: ${cause instanceof Error ? cause.message : String(cause)}`;
        skipped.push({ path, reason });
        log?.(`prompt file skipped: ${path} — ${reason}`);
      }
    }
  }
  return { files, skipped };
}

/** The workspace service's answer to `prompts.roots.read`. */
export function promptsRootsRead(env: PromptRootsEnv, log?: (message: string) => void): ProcessReply {
  const result = readPromptRoots(env, log);
  log?.(`prompt roots: ${result.files.length} file(s), ${result.skipped.length} skipped (${env.workspaceRoot})`);
  return { kind: 'prompts.roots', result };
}
