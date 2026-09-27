import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { hasEtcHierarchy } from './skills/roots.js';

/**
 * PD-WORKSPACE-002 — instruction-file discovery: the presence check the Instructions inventory draws.
 * Pure over injected roots, so the whole order is checkable without laying down a tree.
 *
 * **Workspace scope** is the resolved workspace root alone (the project scope the owner chose): four
 * names in this order — `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, `CLAUDE.override.md`. The two
 * override pairs are independent: each override suppresses its own base and nothing else.
 *
 * **Beyond the workspace** five bases are read in this order, mirroring the skill user-scope roots
 * (REQ-WORKSPACE-051): the Rotaris global configuration directory; `~/.agents`; `~/.config/opencode`;
 * `~/.openhands`; and `/etc/codex`, on platforms with an `/etc` hierarchy only — `hasEtcHierarchy`
 * is the skills ladder's own predicate, imported rather than restated so the two cannot drift apart.
 * Each base holds at most `AGENTS.md`, then `CLAUDE.md`.
 *
 * A directory carrying one of the names is not an instruction file and is not listed; anything
 * unreadable reads as absent. An entry's `id` is the stable identity the `instructions.overrides`
 * policy keys on; `source` is the label the inventory shows.
 */
export const WORKSPACE_INSTRUCTION_FILE_NAMES = ['AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md', 'CLAUDE.override.md'] as const;
export const SHARED_INSTRUCTION_FILE_NAMES = ['AGENTS.md', 'CLAUDE.md'] as const;

export interface InstructionFileEntry {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly source: string;
}

export interface InstructionDiscoveryEnv {
  readonly workspaceRoot: string;
  readonly globalDir: string;
  readonly home: string;
  readonly platform: NodeJS.Platform;
}

function fileIfPresent(entries: InstructionFileEntry[], id: string, name: string, path: string, source: string, isFile: (p: string) => boolean): void {
  if (isFile(path)) entries.push({ id, name, path, source });
}

/** `node:fs`, with "not there" and "unreadable" folded into the one answer the inventory shows. */
const NODE_IS_FILE = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    // Absent, or unreadable: the same thing to a user looking at an inventory of what the agent would read.
    return false;
  }
};

export function discoverInstructionFiles(env: InstructionDiscoveryEnv, isFile: (path: string) => boolean = NODE_IS_FILE): InstructionFileEntry[] {
  const found: InstructionFileEntry[] = [];
  if (env.workspaceRoot.trim() !== '') {
    const root = resolve(env.workspaceRoot);
    for (const name of WORKSPACE_INSTRUCTION_FILE_NAMES) {
      fileIfPresent(found, `workspace:${name}`, name, join(root, name), 'workspace', isFile);
    }
  }
  const bases: { readonly idPrefix: string; readonly dir: string; readonly source: string }[] = [];
  if (env.globalDir.trim() !== '') {
    bases.push({ idPrefix: 'global', dir: resolve(env.globalDir), source: 'global' });
  }
  bases.push(
    { idPrefix: 'user-agents', dir: join(env.home, '.agents'), source: 'user (~/.agents)' },
    { idPrefix: 'user-opencode', dir: join(env.home, '.config', 'opencode'), source: 'user (~/.config/opencode)' },
    { idPrefix: 'user-openhands', dir: join(env.home, '.openhands'), source: 'user (~/.openhands)' },
  );
  if (hasEtcHierarchy(env.platform)) {
    bases.push({ idPrefix: 'machine-codex', dir: join('/etc', 'codex'), source: 'machine (/etc/codex)' });
  }
  for (const base of bases) {
    if (base.dir.trim() === '') continue;
    for (const name of SHARED_INSTRUCTION_FILE_NAMES) {
      fileIfPresent(found, `${base.idPrefix}:${name}`, name, join(base.dir, name), base.source, isFile);
    }
  }
  return found;
}

/** The process defaults: the operator's home, this platform. */
export function defaultInstructionEnv(workspaceRoot: string, globalDir: string): InstructionDiscoveryEnv {
  return { workspaceRoot, globalDir, home: homedir(), platform: process.platform };
}

/*
 * ── The merged context (REQ-WORKSPACE-043..048, extended and narrowed by PD-WORKSPACE-002) ──────────
 *
 * Discovery above says which files exist; this says what an agent is given. The two are separate on
 * purpose: the inventory lists every present file so a switch has something to sit beside, and only
 * the ENABLED set reaches a model.
 */

/** REQ-WORKSPACE-044's defaults, both measured as UTF-8 bytes and both overridable per call. */
export const INSTRUCTION_SIZE_LIMITS = { perFile: 32_768, total: 131_072 } as const;

export interface InstructionMergeLimits {
  readonly perFile?: number | undefined;
  readonly total?: number | undefined;
}

export interface InstructionMergePorts {
  readonly readFile: (path: string) => string;
}

/**
 * PD-WORKSPACE-002 — the set injection consumes: the present files whose per-file policy is `on`,
 * under the master switch, with each override pair's base suppressed by its own override.
 *
 * **Suppression is computed over the enabled set, not over what is on disk.** REQ-WORKSPACE-042 wrote
 * the rule as "given both exist", which had no third case before switches existed; with them, reading
 * it against presence would let a user switch an override off and get *nothing* — the base silently
 * suppressed by a file no longer being read — while the inventory still showed that base switched on.
 * A screen that says a file is on and an agent that is not given it is the worse failure of the two,
 * so an override suppresses its base only while the override is itself enabled. **OQ-64**, ruled this way
 * on 2026-09-27.
 */
export function enabledInstructionFiles(
  files: readonly InstructionFileEntry[],
  master: boolean,
  overrides: Readonly<Record<string, string>>,
): readonly InstructionFileEntry[] {
  if (!master) return [];
  const on = files.filter((f) => (overrides[f.id] ?? 'on') === 'on');
  const overriding = new Set(on.filter((f) => f.name.endsWith('.override.md')).map((f) => `${f.id.slice(0, f.id.indexOf(':'))}:${f.name.replace('.override.md', '.md')}`));
  return on.filter((f) => !overriding.has(f.id));
}

/** The largest prefix of whole lines fitting `budget` bytes, or `null` when the first line alone exceeds it. */
function wholeLinesWithin(text: string, budget: number): string | null {
  if (Buffer.byteLength(text, 'utf8') <= budget) return text;
  const lines = text.split('\n');
  let used = 0;
  let out = '';
  for (let i = 0; i < lines.length; i += 1) {
    const piece = i < lines.length - 1 ? `${lines[i]!}\n` : lines[i]!;
    const n = Buffer.byteLength(piece, 'utf8');
    if (used + n > budget) break;
    out += piece;
    used += n;
  }
  return out === '' ? null : out;
}

/** REQ-WORKSPACE-043: the one-line source comment each block is preceded by. */
export const instructionSourceComment = (path: string): string => `<!-- source: ${path} -->`;

/**
 * REQ-WORKSPACE-043/044/045 — the merged output.
 *
 * Format: each block is its source comment on its own line, then the file's content; blocks are
 * separated by one blank line; concatenation follows discovery order. A whitespace-only file is
 * skipped silently, an unreadable one with a warning naming the path and the error, neither aborting
 * the walk.
 *
 * Size: the per-file limit cuts a file back to the last line boundary that fits, and a file whose very
 * first line already exceeds it contributes nothing at all. Against the total, a block's source-comment
 * line is charged FIRST — a file for which no budget then remains is dropped entire, comment included —
 * and a file that does not fit whole is cut to the remaining budget by the same line-boundary rule, so
 * no block ever ends mid-line. Every truncation and every drop warns, naming the file. The output never
 * exceeds the total.
 */
export function mergeInstructionContext(
  files: readonly InstructionFileEntry[],
  ports: InstructionMergePorts,
  warn: (message: string) => void,
  limits: InstructionMergeLimits = {},
): string {
  const perFile = limits.perFile ?? INSTRUCTION_SIZE_LIMITS.perFile;
  const total = limits.total ?? INSTRUCTION_SIZE_LIMITS.total;
  const blocks: string[] = [];
  let used = 0;
  for (const file of files) {
    let raw: string;
    try {
      raw = ports.readFile(file.path);
    } catch (cause) {
      // REQ-WORKSPACE-045: a warning naming the path and the error, and the walk carries on.
      warn(`${file.path} could not be read (${cause instanceof Error ? cause.message : String(cause)}); it contributes nothing`);
      continue;
    }
    if (raw.trim() === '') continue; // REQ-WORKSPACE-045: whitespace-only, skipped silently.
    /*
     * A file's own trailing newlines are dropped BEFORE either limit is applied, so that the separator
     * between blocks is exactly one blank line whether or not the file ended with one, and so that a file
     * is never dropped for a byte the output would not have carried. Doing it after the budget was charged
     * cost a whole block on the first run of this merge, which is why the order is stated here.
     */
    const content = raw.replace(/\n+$/, '');
    const capped = wholeLinesWithin(content, perFile);
    if (capped === null) {
      warn(`${file.path} was dropped: its first line alone exceeds the ${perFile}-byte per-file limit`);
      continue;
    }
    if (capped !== content) warn(`${file.path} was truncated to the ${perFile}-byte per-file limit`);
    // The separator costs the blank line between blocks — charged with this block, never after the last.
    const separator = blocks.length === 0 ? 0 : 2;
    const comment = instructionSourceComment(file.path);
    const head = separator + Buffer.byteLength(`${comment}\n`, 'utf8');
    const remaining = total - used - head;
    if (remaining <= 0) {
      warn(`${file.path} was dropped entire, source comment included: no room remained within the ${total}-byte total limit`);
      continue;
    }
    const fitted = wholeLinesWithin(capped, remaining);
    if (fitted === null) {
      warn(`${file.path} was dropped entire, source comment included: its first line exceeds the ${remaining} bytes remaining of the ${total}-byte total limit`);
      continue;
    }
    if (fitted !== capped) warn(`${file.path} was cut back to the ${remaining} bytes remaining of the ${total}-byte total limit`);
    // A cut lands on a line boundary, so it can leave the trailing newline the read already dropped.
    const body = fitted.replace(/\n+$/, '');
    blocks.push(`${comment}\n${body}`);
    used += head + Buffer.byteLength(body, 'utf8');
  }
  return blocks.join('\n\n');
}
