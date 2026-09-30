import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import { countNoun, similarity } from '@rotaris/kernel';
import { renderDiff } from './diff.js';
import { lineCount, splitLines } from './lines.js';
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

/**
 * Why REQ-TOOLS-134's parent listing could not be taken, read from the filesystem rather than assumed.
 * A linked worktree's `.git` is a file, not a directory, and answering `read_file .git/HEAD` with "its
 * parent directory does not exist either" sent an agent hunting for a path that was there all along.
 */
function unlistableParent(parent: string, relParent: string): string {
  if (!existsSync(parent)) return 'Its parent directory does not exist either.';
  const name = relParent === '' || relParent === '.' ? 'The workspace root' : `'${relParent}'`;
  try {
    if (!statSync(parent).isDirectory()) return `${name} is a file, not a directory.`;
  } catch {
    return `${name} could not be read.`;
  }
  return `${name} could not be listed.`;
}

/**
 * The two code-intelligence tools that answer the `memory:` namespace, HANDED IN rather than written here.
 *
 * REQ-MCP-116 makes the generated manifest the only place a runtime tool name is spelled, and a literal here
 * would be a second place — caught by `code-intelligence.test.ts` on the first run of this repair, which is
 * what the rule is for. This layer cannot import `@rotaris/config` either, so the names arrive from the run
 * host, which can, and reads them from `CODE_INTELLIGENCE_MEMORY_GATE`.
 */
export interface MemoryNamespaceTools {
  /** The manifest's `tiers.read.memoryReading`. */
  readonly read: string;
  /** The manifest's `tiers.read.memoryListing`. */
  readonly list: string;
}

/**
 * A `memory:` path is not a file and never will be, so the parent listing REQ-TOOLS-134 owes it answers a
 * question nobody asked. Observed 2026-09-20, run `2e21e324`: an agent that had just listed its memories
 * reached for two of them with `read_file` and was told `Its parent directory does not exist either.` —
 * truthful, naming no tool, so the next move was a guess.
 *
 * With no tools handed in the refusal still corrects the shape of the mistake; it just cannot name the way
 * out, which is better than naming a tool this build might not have.
 */
function namespacedElsewhere(rel: string, tools: MemoryNamespaceTools | undefined): string | null {
  const head = rel.split(/[\\/]/, 1)[0] ?? '';
  if (!/^memory:/i.test(head)) return null;
  const name = rel.slice(rel.indexOf(':') + 1);
  const opening = `Memory not found through read_file: ${rel}.\n`
    + `'memory:' is not a path on disk — it is the code-intelligence server's own namespace.`;
  if (tools === undefined) return opening;
  return `${opening} Read it with ${tools.read} (memory_file_name: '${name}'), and list what is there with ${tools.list}.`;
}

/** REQ-TOOLS-134: the parent listing and up to five close matches at ≥ 0.45 under REQ-TOOLS-188. */
function missingPathMessage(resolved: string, rel: string, memoryTools?: MemoryNamespaceTools): string {
  const namespaced = namespacedElsewhere(rel, memoryTools);
  if (namespaced !== null) return namespaced;
  const parent = dirname(resolved);
  const wanted = basename(resolved).toLowerCase();
  let names: string[] = [];
  try {
    names = readdirSync(parent);
  } catch {
    return `File not found: ${rel}. ${unlistableParent(parent, dirname(rel))}`;
  }
  const scored = names.map((n) => ({ n, s: similarity(wanted, n.toLowerCase()) })).filter((x) => x.s >= 0.45).sort((a, b) => b.s - a.s || a.n.localeCompare(b.n)).slice(0, 5);
  const suggestions = scored.length ? `\nDid you mean: ${scored.map((x) => x.n).join(', ')}?` : '';
  return `File not found: ${rel}.\nContents of ${dirname(rel) || '.'}:\n${names.length ? names.sort().join('\n') : '(empty directory)'}${suggestions}`;
}

interface ReadRender { text: string; hash: string; totalLines: number }

function renderRead(rel: string, content: string, offset: number, limit: number, grep: string | undefined, grepContext: number, extraHeader = ''): ReadRender {
  const lines = splitLines(content);
  const totalLines = lines.length;
  const hash = sha256(content);
  let body: string[];
  // An empty file has no line to show; `1-0` would name a line that is not there.
  let shownFrom = totalLines === 0 ? 0 : offset;
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

function doRead(state: FileToolState, fence: FenceConfig, args: z.infer<typeof readSchema>, hashHeader: boolean, memoryTools?: MemoryNamespaceTools): Observation {
  const path = (args.path ?? args.file_path) as string;
  const t = readTarget(fence, path, 'read');
  if (!t.ok) return t.obs;
  if (!existsSync(t.resolved)) return errorObservation(missingPathMessage(t.resolved, t.rel, memoryTools));
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

export function readFileTool(state: FileToolState, fence: FenceConfig, memoryTools?: MemoryNamespaceTools): ToolExecutor<z.infer<typeof readSchema>> {
  return {
    name: 'read_file',
    // The re-read rule is stated here because the corpus already answers it and nothing was telling the model:
    // REQ-TOOLS-189 makes a current `content_hash` satisfy REQ-TOOLS-133's read-before-write rule, "so a caller
    // holding a current hash never has to read a file twice". Run `a26918e8` read one lockfile four times in
    // five minutes; every read was a true read of the disk, which is why the repair is guidance and not a cache.
    description: 'Read a workspace file (line-numbered; offset/limit; optional grep filter) or list a directory. Paths are relative to the workspace root. A file you have already read is unchanged unless you or a command changed it: re-read it to see an edit you did not make yourself, not to recall what it said. To edit, prefer haet_read, whose content_hash is what a later haet_edit needs.',
    schema: readSchema,
    label: (a) => `read_file ${a.path ?? a.file_path ?? ''}`,
    execute: async (a) => doRead(state, fence, a, false, memoryTools),
  };
}

export function haetReadTool(state: FileToolState, fence: FenceConfig): ToolExecutor<z.infer<typeof readSchema>> {
  return {
    name: 'haet_read',
    description: 'Read a workspace file and receive its content_hash (SHA-256 of the exact bytes) for a hash-anchored edit with haet_edit. Holding a current hash is what satisfies the read-before-write rule, so a file does not have to be read twice; and haet_edit reports the file\'s new content_hash, so consecutive edits chain without a read in between.',
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
    /*
     * The field is named in the prose because the prose is what a model reads first. The live run of 2026-09-29
     * (WF1) had two children send `path` and `content` with no `operation`, be refused, and regenerate their
     * whole file: the schema they were sent names the field, but the sentence they acted on listed the
     * operations as verbs and never said they were the values of a required selector. REQ-TOOLS-135 names the
     * selector `operation` and nothing fixes this wording (docs/defects/
     * write-files-first-use-refusal-recurred-under-duress.md). The duress run after it still had 1 of 4 children omit
     * the field; reading the selector from the call instead is a fourth REQ-TOOLS-032 repair, so it is OQ-139's.
     */
    description: 'Create, edit, overwrite, insert into, or undo the last write of a workspace file. Every call names its `operation` — one of create, edit, overwrite, insert, undo — with the fields that operation reads: create {path, content}; edit {path, old_string, new_string, replace_all?}; overwrite {path, content}; insert {path, content, insert_line} (0 = beginning); undo {path}. Example: {"operation": "create", "path": "notes.txt", "content": "hello\\n"}. Read a file before editing or overwriting it.',
    schema: writeSchema,
    /**
     * REQ-TOOLS-032's recoverable refusal, with the expected shape named: the run's first uses omitted
     * `operation` (the selector REQ-TOOLS-135 names, which no `command` facet may stand in for), and the
     * gate's generic "do not match its schema" left the model to guess the key. Anything else keeps the
     * gate's detail and gains the per-operation fields, which is the only place a caller that sent the
     * wrong shape will read them.
     */
    validationError: (args, detail) => {
      if (args['operation'] === undefined) {
        return errorObservation(`write_file requires an operation: one of create, edit, overwrite, insert, undo. Example: {"operation": "edit", "path": "notes.txt", "old_string": "a", "new_string": "b"}. (${detail})`);
      }
      const op = String(args['operation']);
      const fields: Record<string, string> = {
        create: 'create reads `path` and `content`.',
        edit: 'edit reads `path`, `old_string` and `new_string` (plus `replace_all?`).',
        overwrite: 'overwrite reads `path` and `content`, and the file must have been read first.',
        insert: 'insert reads `path`, `content` and `insert_line` (0 = beginning).',
        undo: 'undo reads `path`.',
      };
      return errorObservation(`The arguments for '${op}' do not match the write_file schema (${detail}). ${fields[op] ?? 'The operations are create, edit, overwrite, insert, undo.'}`);
    },
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
          if (exists) {
            // REQ-TOOLS-135 fixes this text. A 2026-09-22 extension added whether "this agent" had read the path,
            // and the read record cannot answer that: it is shared by every agent and run on the workspace root
            // (REQ-TOOLS-133, REQ-TOOLS-137), so a sibling's create read as the caller's own. Sibling collisions
            // are PD-TOOLS-006's write scopes to prevent. The history is in docs/defects/fixed/
            // the-create-guard-tells-an-agent-it-read-a-file-its-sibling-wrote.md.
            return errorObservation(`File already exists: ${rel}. Use 'overwrite' or 'edit'.`);
          }
          const content = a.content ?? '';
          return commit(content, `Created ${rel}: ${countNoun(lineCount(content), 'line')} created.`);
        }
        case 'overwrite': {
          if (!exists) return errorObservation(`File does not exist: ${rel}. Use 'create'.`);
          const gate = mustHaveRead();
          if (gate) return gate;
          const content = a.content ?? '';
          return commit(content, `Overwrote ${rel}: ${countNoun(lineCount(content), 'line')} replaced ${lineCount(before ?? '')}.`);
        }
        case 'insert': {
          if (!exists) return errorObservation(`File does not exist: ${rel}. Use 'create'.`);
          const gate = mustHaveRead();
          if (gate) return gate;
          if (a.insert_line === undefined) return errorObservation('insert requires insert_line (0 = beginning).');
          // Positions count lines as `splitLines` does, so the one after a final newline is not a place to insert
          // after, and a terminated `content` is its lines rather than its lines and a blank one. The result ends
          // in a newline when the file did, or when the insert lands at the end and its own content does.
          const text = before ?? '';
          const lines = splitLines(text);
          if (a.insert_line > lines.length) return errorObservation(`insert_line ${a.insert_line} is beyond the end of ${rel} (${countNoun(lines.length, 'line')}).`);
          const content = a.content ?? '';
          const ins = splitLines(content);
          const terminated = text.endsWith('\n') || (a.insert_line === lines.length && content.endsWith('\n'));
          lines.splice(a.insert_line, 0, ...ins);
          return commit(`${lines.join('\n')}${terminated && lines.length > 0 ? '\n' : ''}`, `Inserted ${countNoun(ins.length, 'line')} into ${rel} at line ${a.insert_line}.`);
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
            if (count === 0) return errorObservation(`old_string was not found in ${rel} (${countNoun(lineCount(before ?? ''), 'line')}). Read the file again or use 'overwrite'.`);
            return commit((before ?? '').split(a.old_string).join(a.new_string), `Edited ${rel}: ${countNoun(count, 'occurrence')} replaced.`);
          }
          const m = matchEdit(lines, a.old_string);
          if (!m) return errorObservation(`old_string was not found in ${rel} at any of the four match levels (exact, trailing-whitespace, indentation shift, fuzzy ≥ 0.85); the file has ${countNoun(lineCount(before ?? ''), 'line')}. Read the file again or use 'overwrite'.`);
          if (m.starts.length > 1) return errorObservation(`Found ${m.starts.length} occurrences of old_str at lines ${m.starts.map((s) => s + 1).join(', ')}. Add surrounding context to make the match unique, or set replace_all.`);
          const start = m.starts[0] as number;
          const k = Math.max(1, lineCount(a.old_string));
          const after = applyMatch(before ?? '', lines, m, a.old_string, a.new_string);
          const note = m.level > 1 ? ` Match level: ${m.level}${m.level === 4 ? ` (similarity: ${m.similarity!.toFixed(2)}). Verify the result.` : '.'}` : '';
          return commit(after, `Edited ${rel}: ${countNoun(k, 'line')} changed at line ${start + 1}.${note}`);
        }
        case 'undo': {
          const previous = state.popUndo(resolved);
          if (previous === undefined) return errorObservation(`No edit history for ${rel}.`);
          const after = previous ?? '';
          atomicWrite(resolved, after);
          return observation(`Restored ${rel} to its previous content (${countNoun(lineCount(after), 'line')}).`, { diff: renderDiff(rel, before, after) });
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
    /**
     * REQ-TOOLS-032's recoverable refusal, with the expected shape named: the run's first uses omitted
     * `path` (or sent a stale hash), and the gate's generic "do not match its schema" left the model to
     * guess the key. Anything else keeps the gate's detail and gains the field list, which is the only
     * place a caller that sent the wrong shape will read it.
     */
    validationError: (args, detail) => {
      if (args['path'] === undefined && args['file_path'] === undefined) {
        return errorObservation(`${name} requires a path (or file_path). Example: {"path": "notes.txt", "content_hash": "<64 hex chars from haet_read>", "old_string": "a", "new_string": "b"}. (${detail})`);
      }
      return errorObservation(`The arguments for '${name}' do not match its schema (${detail}). It takes {path, content_hash (64 lowercase hex from haet_read), old_string, new_string, replace_all?}.`);
    },
    label: (a) => `${name} ${a.path ?? a.file_path ?? ''}`,
    execute: async (a) => {
      const path = (a.path ?? a.file_path) as string;
      const t = readTarget(fence, path, 'write');
      if (!t.ok) return t.obs;
      const { resolved, rel } = t;
      if (!existsSync(resolved)) return errorObservation(`File does not exist: ${rel}.`);
      const bytes = readFileSync(resolved);
      const current = sha256(bytes);
      if (current !== a.content_hash) {
        /*
         * The re-read direction is REQ-TOOLS-052's and stands. What is added is the one fact the caller
         * cannot get without another round trip and that decides their next move: whether the text they
         * meant to replace is still in the file.
         *
         * Run `1ddeb71b` (2026-09-21) spent its last stretch on this loop — a stale hash, then a blind
         * retry, then `old_string was not found exactly` — each attempt paying a wall-clock wait and a user
         * approval. The two refusals were each correct and arrived one at a time.
         *
         * The CURRENT HASH IS DELIBERATELY NOT HANDED BACK. It would let a caller retry without looking,
         * and the reason the hash moved is that the content moved: their `old_string` was computed against
         * text that is gone. Naming the hash would buy a round trip and sell a wrong edit.
         */
        const stillThere = decodeText(bytes).text.includes(a.old_string);
        const fate = stillThere
          ? `Your old_string is still present in the current content, so re-reading and retrying should work.`
          : `Your old_string is NO LONGER present in the current content — the edit may already have been applied, or the region was rewritten. Read it before deciding whether it is still wanted.`;
        return errorObservation(`${rel} changed since the hash you hold was taken. Read it again with haet_read before retrying. ${fate}`);
      }
      // REQ-TOOLS-135's rule for `write_file`'s edit, read as binding its twin: REQ-TOOLS-189 fixes the same
      // old_string/new_string surface and says nothing either way, and reports its other outcomes "as REQ-TOOLS-136
      // reports them". Checked after the hash, as `write_file` checks it after its read gate. The live run of
      // 2026-09-29 (L5) applied a no-op here — an undo entry, a rewrite of the same bytes, a line "changed"
      // (docs/defects/fixed/haet-edit-applies-an-edit-that-changes-nothing.md).
      if (a.old_string === a.new_string) return errorObservation('old_string and new_string are identical; nothing to change.');
      const before = decodeText(bytes).text;
      const lines = before.split('\n');
      let after: string;
      let message: string;
      if (a.replace_all) {
        const count = before.split(a.old_string).length - 1;
        if (count === 0) return errorObservation(`old_string was not found in ${rel}. Read it again with haet_read.`);
        after = before.split(a.old_string).join(a.new_string);
        message = `Edited ${rel}: ${countNoun(count, 'occurrence')} replaced.`;
      } else {
        const m = matchEdit(lines, a.old_string);
        if (!m || m.level !== 1) return errorObservation(`old_string was not found exactly in ${rel}. Read it again with haet_read.`);
        if (m.starts.length > 1) return errorObservation(`Found ${m.starts.length} occurrences of old_str at lines ${m.starts.map((s) => s + 1).join(', ')}. Add surrounding context to make the match unique, or set replace_all.`);
        const start = m.starts[0] as number;
        const k = Math.max(1, lineCount(a.old_string));
        after = applyMatch(before, lines, m, a.old_string, a.new_string);
        message = `Edited ${rel}: ${countNoun(k, 'line')} changed at line ${start + 1}.`;
      }
      state.pushUndo(resolved, before);
      atomicWrite(resolved, after);
      state.markRead(resolved);
      return observation(`${message} content_hash: ${sha256(after)}`, { diff: renderDiff(rel, before, after) });
    },
  };
}

export { realPathOf, relPosix };
