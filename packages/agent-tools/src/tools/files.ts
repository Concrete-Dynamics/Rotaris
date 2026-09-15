import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import { similarity } from '@rotaris/kernel';
import { renderDiff } from './diff.js';
import { checkFence, relPosix, realPathOf, type FenceConfig } from './fence.js';
import { errorObservation, observation, type Observation, type ToolExecutor } from './types.js';
import { compileSearchPattern, IGNORE_COMPONENTS } from './search.js';

/**
 * The workspace file tools (REQ-TOOLS-132..137, REQ-TOOLS-188, REQ-TOOLS-189): `read_file`,
 * `write_file`, and the hash-anchored `haet_read` / `haet_edit` (+ alias `haet`). One `FileToolState`
 * per workspace root holds the read record (shared by every run in that workspace, REQ-TOOLS-137) and
 * the per-path undo stacks of ten (REQ-TOOLS-132). A write is atomic: temp file then rename, so a
 * concurrent reader sees the whole previous or the whole new content and an interrupted write leaves the
 * previous content in place.
 */
export const READ_CAP = 30_000;
export const DEFAULT_LIMIT = 2000;
export const UNDO_DEPTH = 10;

/**
 * REQ-TOOLS-132/133/137 — the read record and the undo stacks, shared by every run in one workspace, which
 * is what those requirements say is shared.
 *
 * **It no longer holds the fence, and that repair is ADR-0063's first execution.** `run-host/tools.ts`
 * builds a fence per tool port from the run's own configuration but caches this state per workspace ROOT,
 * so the state kept the first fence it ever saw and every later port's file tools resolved against it. The
 * comment on the line above it said so — read as a property of the read record rather than as what it also
 * was: `runtime.additional_read_only_roots` (REQ-CONFIG-468) silently ceasing to take effect after the
 * first run in a process, with `grep` and `glob` honouring the fresh fence while `read_file`, `write_file`
 * and the two `haet` tools honoured a stale one. It was invisible because the key's default is empty, so
 * the two fences were equal on every machine that had never set it; the first value that differs is the
 * cataloged skill directories of REQ-WORKSPACE-059, which change on a rescan.
 */
export class FileToolState {
  /** REQ-TOOLS-133: the paths (real, lower-cased) read through this workspace's tools. */
  readonly read = new Set<string>();
  /** REQ-TOOLS-132: the 10 most recent previous contents per path; `null` = the file did not exist. */
  readonly undo = new Map<string, (string | null)[]>();
  key(resolved: string): string {
    return resolved.replace(/\\/g, '/').toLowerCase();
  }
  markRead(resolved: string): void {
    this.read.add(this.key(resolved));
  }
  wasRead(resolved: string): boolean {
    return this.read.has(this.key(resolved));
  }
  pushUndo(resolved: string, previous: string | null): void {
    const k = this.key(resolved);
    const stack = this.undo.get(k) ?? [];
    stack.push(previous);
    while (stack.length > UNDO_DEPTH) stack.shift();
    this.undo.set(k, stack);
  }
  popUndo(resolved: string): string | null | undefined {
    const stack = this.undo.get(this.key(resolved));
    return stack && stack.length > 0 ? stack.pop() : undefined;
  }
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** REQ-TOOLS-132: binary when a NUL appears within the first 8192 bytes; UTF-8 else latin-1. */
export function decodeText(bytes: Buffer): { text: string; binary: boolean } {
  const head = bytes.subarray(0, 8192);
  if (head.includes(0)) return { text: '', binary: true };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), binary: false };
  } catch {
    return { text: bytes.toString('latin1'), binary: false };
  }
}

/** Temp-then-rename in the target's directory; the previous content is never partially replaced. */
export function atomicWrite(target: string, content: string): void {
  mkdirSync(dirname(target), { recursive: true });
  const tmp = join(dirname(target), `.${basename(target)}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`);
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

function listing(dir: string): string {
  const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => !IGNORE_COMPONENTS.has(e.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length === 0) return '(empty directory)';
  return entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).join('\n');
}

/** REQ-TOOLS-134: the parent listing and up to five close matches at ≥ 0.45 under REQ-TOOLS-188. */
function missingPathMessage(resolved: string, rel: string): string {
  const parent = dirname(resolved);
  const wanted = basename(resolved).toLowerCase();
  let names: string[] = [];
  try {
    names = readdirSync(parent);
  } catch {
    return `File not found: ${rel}. Its parent directory does not exist either.`;
  }
  const scored = names.map((n) => ({ n, s: similarity(wanted, n.toLowerCase()) })).filter((x) => x.s >= 0.45).sort((a, b) => b.s - a.s || a.n.localeCompare(b.n)).slice(0, 5);
  const suggestions = scored.length ? `\nDid you mean: ${scored.map((x) => x.n).join(', ')}?` : '';
  return `File not found: ${rel}.\nContents of ${dirname(rel) || '.'}:\n${names.length ? names.sort().join('\n') : '(empty directory)'}${suggestions}`;
}

interface ReadRender { text: string; hash: string; totalLines: number }

function renderRead(rel: string, content: string, offset: number, limit: number, grep: string | undefined, grepContext: number, extraHeader = ''): ReadRender {
  const lines = content.split('\n');
  const totalLines = lines.length;
  const hash = sha256(content);
  let body: string[];
  let shownFrom = offset;
  let shownTo = Math.min(totalLines, offset + limit - 1);
  if (grep !== undefined) {
    let re: RegExp;
    try {
      re = compileSearchPattern(grep);
    } catch (cause) {
      return { text: `Invalid regex pattern: ${String(cause instanceof Error ? cause.message : cause)}`, hash, totalLines };
    }
    const hits = lines.map((l, i) => (re.test(l) ? i : -1)).filter((i) => i >= 0);
    if (hits.length === 0) return { text: `No matches for pattern '${grep}' in ${rel}.`, hash, totalLines };
    const groups: string[] = [];
    let cur: string[] = [];
    let last = -2;
    for (const h of hits) {
      const from = Math.max(0, h - grepContext);
      const to = Math.min(totalLines - 1, h + grepContext);
      if (from > last + 1 && cur.length) { groups.push(cur.join('\n')); cur = []; }
      for (let i = Math.max(from, last + 1); i <= to; i += 1) cur.push(`${i === h ? '>' : ' '}${i + 1}: ${lines[i]}`);
      last = to;
    }
    if (cur.length) groups.push(cur.join('\n'));
    body = [`${hits.length} match(es) for '${grep}':`, groups.join('\n---\n')];
    shownFrom = 1;
    shownTo = totalLines;
  } else {
    body = lines.slice(offset - 1, offset - 1 + limit).map((l, i) => `${offset + i}: ${l}`);
  }
  let text = body.join('\n');
  let capped = false;
  let hint = '';
  if (text.length > READ_CAP) {
    const cut = text.slice(0, READ_CAP);
    const shownLines = cut.split('\n').length - 1;
    text = cut.slice(0, cut.lastIndexOf('\n'));
    const nextOffset = offset + shownLines;
    hint = `\n(Output capped at ~${READ_CAP} chars. ${Math.max(0, totalLines - nextOffset + 1)} more lines. Use offset=${nextOffset} to continue.)`;
    shownTo = nextOffset - 1;
    capped = true;
  }
  const truncated = capped || shownTo < totalLines;
  const header = `[path: ${rel} | total_lines: ${totalLines} | shown: lines ${shownFrom}-${shownTo} | truncated: ${truncated}${extraHeader}]`;
  return { text: `${header}\n${text}${hint}`, hash, totalLines };
}

function readTarget(fence: FenceConfig, path: string, access: 'read' | 'write'): { ok: true; resolved: string; rel: string } | { ok: false; obs: Observation } {
  const v = checkFence(fence, path, access);
  if (!v.ok) return { ok: false, obs: errorObservation(v.message) };
  return { ok: true, resolved: v.resolved, rel: v.rel };
}

const readSchema = z.object({
  path: z.string().optional(),
  file_path: z.string().optional(),
  offset: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).default(DEFAULT_LIMIT),
  grep: z.string().optional(),
  grep_context: z.number().int().min(0).default(3),
}).refine((a) => a.path !== undefined || a.file_path !== undefined, { message: 'path is required' });

function doRead(state: FileToolState, fence: FenceConfig, args: z.infer<typeof readSchema>, hashHeader: boolean): Observation {
  const path = (args.path ?? args.file_path) as string;
  const t = readTarget(fence, path, 'read');
  if (!t.ok) return t.obs;
  if (!existsSync(t.resolved)) return errorObservation(missingPathMessage(t.resolved, t.rel));
  const st = statSync(t.resolved);
  if (st.isDirectory()) return observation(`[path: ${t.rel} | directory]\n${listing(t.resolved)}`);
  const bytes = readFileSync(t.resolved);
  const { text, binary } = decodeText(bytes);
  if (binary) return errorObservation(`Binary file (${bytes.length} bytes). Cannot display content.`);
  const hash = sha256(bytes);
  const r = renderRead(t.rel, text, args.offset, args.limit, args.grep, args.grep_context, hashHeader ? ` | content_hash: ${hash}` : '');
  state.markRead(t.resolved);
  return observation(r.text);
}

export function readFileTool(state: FileToolState, fence: FenceConfig): ToolExecutor<z.infer<typeof readSchema>> {
  return {
    name: 'read_file',
    description: 'Read a workspace file (line-numbered; offset/limit; optional grep filter) or list a directory. Paths are relative to the workspace root.',
    schema: readSchema,
    label: (a) => `read_file ${a.path ?? a.file_path ?? ''}`,
    execute: async (a) => doRead(state, fence, a, false),
  };
}

export function haetReadTool(state: FileToolState, fence: FenceConfig): ToolExecutor<z.infer<typeof readSchema>> {
  return {
    name: 'haet_read',
    description: 'Read a workspace file and receive its content_hash (SHA-256 of the exact bytes) for a hash-anchored edit with haet_edit.',
    schema: readSchema,
    label: (a) => `haet_read ${a.path ?? a.file_path ?? ''}`,
    execute: async (a) => doRead(state, fence, a, true),
  };
}

/**
 * REQ-TOOLS-136: the four-level match. Level 1 is the exact text anywhere (a substring, so a fragment of
 * a line matches); levels 2–4 are line windows of the old text's height. Returns the line indices of every
 * match at the deciding level and, at level 1, the character offsets to replace at.
 */
export function matchEdit(lines: readonly string[], oldText: string): { level: 1 | 2 | 3 | 4; starts: number[]; offsets?: number[]; similarity?: number } | null {
  const text = lines.join('\n');
  const offsets: number[] = [];
  if (oldText.length > 0) {
    for (let i = text.indexOf(oldText); i !== -1; i = text.indexOf(oldText, i + oldText.length)) offsets.push(i);
  }
  if (offsets.length) return { level: 1, starts: offsets.map((o) => text.slice(0, o).split('\n').length - 1), offsets };
  const oldLines = oldText.split('\n');
  const k = oldLines.length;
  const windows = lines.length - k + 1;
  const at = (i: number) => lines.slice(i, i + k);
  const eq = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const rtrim = (xs: readonly string[]) => xs.map((x) => x.replace(/\s+$/, ''));
  const l2: number[] = [];
  for (let i = 0; i < windows; i += 1) if (eq(rtrim(at(i)), rtrim(oldLines))) l2.push(i);
  if (l2.length) return { level: 2, starts: l2 };
  const l3: number[] = [];
  const indent = (s: string) => /^\s*/.exec(s)?.[0] ?? '';
  for (let i = 0; i < windows; i += 1) {
    const w = at(i);
    const first = w[0] as string;
    const firstOld = oldLines[0] as string;
    const shift = indent(first).length - indent(firstOld).length;
    if (shift === 0) continue;
    const shifted = oldLines.map((l) => (shift > 0 ? `${indent(first).slice(0, shift)}${l}` : l.startsWith(indent(firstOld).slice(0, -shift)) ? l.slice(-shift) : null));
    if (shifted.every((x) => x !== null) && eq(w, shifted as string[])) l3.push(i);
  }
  if (l3.length) return { level: 3, starts: l3 };
  let best: { i: number; s: number } | null = null;
  for (let i = 0; i < windows; i += 1) {
    const s = similarity(at(i).join('\n'), oldText);
    if (s >= 0.85 && (best === null || s > best.s)) best = { i, s };
  }
  if (best) return { level: 4, starts: [best.i], similarity: best.s };
  return null;
}

/** Apply the single match: a level-1 match replaces the exact span; a window match replaces whole lines. */
function applyMatch(text: string, lines: readonly string[], m: NonNullable<ReturnType<typeof matchEdit>>, oldText: string, newText: string): string {
  if (m.level === 1 && m.offsets) {
    const o = m.offsets[0] as number;
    return `${text.slice(0, o)}${newText}${text.slice(o + oldText.length)}`;
  }
  const start = m.starts[0] as number;
  const k = oldText.split('\n').length;
  return [...lines.slice(0, start), ...newText.split('\n'), ...lines.slice(start + k)].join('\n');
}

const writeSchema = z.object({
  operation: z.enum(['create', 'edit', 'overwrite', 'insert', 'undo']),
  path: z.string().optional(),
  file_path: z.string().optional(),
  content: z.string().optional(),
  old_string: z.string().optional(),
  new_string: z.string().optional(),
  replace_all: z.boolean().default(false),
  insert_line: z.number().int().min(0).optional(),
}).refine((a) => a.path !== undefined || a.file_path !== undefined, { message: 'path is required' });

export function writeFileTool(state: FileToolState, fence: FenceConfig): ToolExecutor<z.infer<typeof writeSchema>> {
  return {
    name: 'write_file',
    description: 'Create, edit (old_string → new_string), overwrite, insert into, or undo the last write of a workspace file. Read a file before editing it.',
    schema: writeSchema,
    label: (a) => `write_file ${a.operation} ${a.path ?? a.file_path ?? ''}`,
    execute: async (a) => {
      const path = (a.path ?? a.file_path) as string;
      const t = readTarget(fence, path, 'write');
      if (!t.ok) return t.obs;
      const { resolved, rel } = t;
      const exists = existsSync(resolved);
      const current = exists ? decodeText(readFileSync(resolved)) : null;
      if (current?.binary) return errorObservation(`Binary file. Cannot edit ${rel}.`);
      const before = current?.text ?? null;
      const mustHaveRead = () => (!state.wasRead(resolved) ? errorObservation(`You must read ${rel} before editing it. Call read_file(path="${rel}") first, then retry your edit.`) : null);
      const commit = (after: string, message: string): Observation => {
        state.pushUndo(resolved, before);
        atomicWrite(resolved, after);
        state.markRead(resolved);
        return observation(`${message} (sha256 ${sha256(after)})`, { diff: renderDiff(rel, before, after) });
      };
      switch (a.operation) {
        case 'create': {
          if (exists) return errorObservation(`File already exists: ${rel}. Use 'overwrite' or 'edit'.`);
          const content = a.content ?? '';
          return commit(content, `Created ${rel}: ${content.split('\n').length} line(s) created.`);
        }
        case 'overwrite': {
          if (!exists) return errorObservation(`File does not exist: ${rel}. Use 'create'.`);
          const gate = mustHaveRead();
          if (gate) return gate;
          const content = a.content ?? '';
          return commit(content, `Overwrote ${rel}: ${content.split('\n').length} line(s) replaced ${(before ?? '').split('\n').length}.`);
        }
        case 'insert': {
          if (!exists) return errorObservation(`File does not exist: ${rel}. Use 'create'.`);
          const gate = mustHaveRead();
          if (gate) return gate;
          if (a.insert_line === undefined) return errorObservation('insert requires insert_line (0 = beginning).');
          const lines = (before ?? '').split('\n');
          if (a.insert_line > lines.length) return errorObservation(`insert_line ${a.insert_line} is beyond the end of ${rel} (${lines.length} lines).`);
          const ins = (a.content ?? '').split('\n');
          lines.splice(a.insert_line, 0, ...ins);
          return commit(lines.join('\n'), `Inserted ${ins.length} line(s) into ${rel} at line ${a.insert_line}.`);
        }
        case 'edit': {
          if (!exists) return errorObservation(`File does not exist: ${rel}. Use 'create'.`);
          const gate = mustHaveRead();
          if (gate) return gate;
          if (a.old_string === undefined || a.new_string === undefined) return errorObservation('edit requires old_string and new_string.');
          if (a.old_string === a.new_string) return errorObservation('old_string and new_string are identical; nothing to change.');
          const lines = (before ?? '').split('\n');
          if (a.replace_all) {
            const count = (before ?? '').split(a.old_string).length - 1;
            if (count === 0) return errorObservation(`old_string was not found in ${rel} (${lines.length} lines). Read the file again or use 'overwrite'.`);
            return commit((before ?? '').split(a.old_string).join(a.new_string), `Edited ${rel}: ${count} occurrence(s) replaced.`);
          }
          const m = matchEdit(lines, a.old_string);
          if (!m) return errorObservation(`old_string was not found in ${rel} at any of the four match levels (exact, trailing-whitespace, indentation shift, fuzzy ≥ 0.85); the file has ${lines.length} lines. Read the file again or use 'overwrite'.`);
          if (m.starts.length > 1) return errorObservation(`Found ${m.starts.length} occurrences of old_str at lines ${m.starts.map((s) => s + 1).join(', ')}. Add surrounding context to make the match unique, or set replace_all.`);
          const start = m.starts[0] as number;
          const k = a.old_string.split('\n').length;
          const after = applyMatch(before ?? '', lines, m, a.old_string, a.new_string);
          const note = m.level > 1 ? ` Match level: ${m.level}${m.level === 4 ? ` (similarity: ${m.similarity!.toFixed(2)}). Verify the result.` : '.'}` : '';
          return commit(after, `Edited ${rel}: ${k} line(s) changed at line ${start + 1}.${note}`);
        }
        case 'undo': {
          const previous = state.popUndo(resolved);
          if (previous === undefined) return errorObservation(`No edit history for ${rel}.`);
          const after = previous ?? '';
          atomicWrite(resolved, after);
          return observation(`Restored ${rel} to its previous content (${after.split('\n').length} line(s)).`, { diff: renderDiff(rel, before, after) });
        }
        default:
          return errorObservation(`Unsupported operation: ${String(a.operation)}`);
      }
    },
  };
}

const haetEditSchema = z.object({
  path: z.string().optional(),
  file_path: z.string().optional(),
  content_hash: z.string().regex(/^[0-9a-f]{64}$/, 'content_hash must be 64 lowercase hex characters'),
  old_string: z.string(),
  new_string: z.string(),
  replace_all: z.boolean().default(false),
}).refine((a) => a.path !== undefined || a.file_path !== undefined, { message: 'path is required' });

export function haetEditTool(state: FileToolState, fence: FenceConfig, name: 'haet_edit' | 'haet' = 'haet_edit'): ToolExecutor<z.infer<typeof haetEditSchema>> {
  return {
    name,
    description: 'Hash-anchored exact edit: replace old_string with new_string in a file whose current SHA-256 equals content_hash (from haet_read). Reports the new content_hash.',
    schema: haetEditSchema,
    label: (a) => `${name} ${a.path ?? a.file_path ?? ''}`,
    execute: async (a) => {
      const path = (a.path ?? a.file_path) as string;
      const t = readTarget(fence, path, 'write');
      if (!t.ok) return t.obs;
      const { resolved, rel } = t;
      if (!existsSync(resolved)) return errorObservation(`File does not exist: ${rel}.`);
      const bytes = readFileSync(resolved);
      const current = sha256(bytes);
      if (current !== a.content_hash) return errorObservation(`${rel} changed since the hash you hold was taken. Read it again with haet_read before retrying.`);
      const before = decodeText(bytes).text;
      const lines = before.split('\n');
      let after: string;
      let message: string;
      if (a.replace_all) {
        const count = before.split(a.old_string).length - 1;
        if (count === 0) return errorObservation(`old_string was not found in ${rel}. Read it again with haet_read.`);
        after = before.split(a.old_string).join(a.new_string);
        message = `Edited ${rel}: ${count} occurrence(s) replaced.`;
      } else {
        const m = matchEdit(lines, a.old_string);
        if (!m || m.level !== 1) return errorObservation(`old_string was not found exactly in ${rel}. Read it again with haet_read.`);
        if (m.starts.length > 1) return errorObservation(`Found ${m.starts.length} occurrences of old_str at lines ${m.starts.map((s) => s + 1).join(', ')}. Add surrounding context to make the match unique, or set replace_all.`);
        const start = m.starts[0] as number;
        const k = a.old_string.split('\n').length;
        after = applyMatch(before, lines, m, a.old_string, a.new_string);
        message = `Edited ${rel}: ${k} line(s) changed at line ${start + 1}.`;
      }
      state.pushUndo(resolved, before);
      atomicWrite(resolved, after);
      state.markRead(resolved);
      return observation(`${message} content_hash: ${sha256(after)}`, { diff: renderDiff(rel, before, after) });
    },
  };
}

export { realPathOf, relPosix };
