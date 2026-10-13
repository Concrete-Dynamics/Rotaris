import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { z } from 'zod';
import { countNoun, similarity } from '@rotaris/kernel';
import { lineChanges, linePairs, renderDiff } from './diff.js';
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
 * One write's entry on REQ-TOOLS-132's undo stack: what the path held before it. `previous` is null when the write made the
 * file (a create), and `madeDir` is then the first directory that write made for it, absolute, so its undo can take away
 * the directories it made as well as the file. A create into a directory that was already there leaves `madeDir` unset.
 * `written` is a create's SHA-256 of the content it wrote: its undo removes the file only while the file's bytes still have
 * that digest, so content another writer put there since (a terminal command, another agent) is never removed with it.
 */
export interface UndoEntry {
  readonly previous: string | null;
  readonly madeDir?: string;
  readonly written?: string;
}

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
  /** REQ-TOOLS-132: the 10 most recent writes per path, each as what the path held before it. */
  readonly undo = new Map<string, UndoEntry[]>();
  key(resolved: string): string {
    return resolved.replace(/\\/g, '/').toLowerCase();
  }
  markRead(resolved: string): void {
    this.read.add(this.key(resolved));
  }
  wasRead(resolved: string): boolean {
    return this.read.has(this.key(resolved));
  }
  pushUndo(resolved: string, entry: UndoEntry): void {
    const k = this.key(resolved);
    const stack = this.undo.get(k) ?? [];
    stack.push(entry);
    while (stack.length > UNDO_DEPTH) stack.shift();
    this.undo.set(k, stack);
  }
  popUndo(resolved: string): UndoEntry | undefined {
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

/**
 * Temp-then-rename in the target's directory; the previous content is never partially replaced. Returns the first directory
 * it had to make for the target (absolute), or undefined when the target's directory was already there.
 */
export function atomicWrite(target: string, content: string): string | undefined {
  const madeDir = mkdirSync(dirname(target), { recursive: true });
  const tmp = join(dirname(target), `.${basename(target)}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`);
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
  return madeDir;
}

/**
 * The undo of a create (REQ-TOOLS-132, REQ-TOOLS-135): the path held no file before it, so the file is removed rather than
 * written empty, and then each directory the create made for it, deepest first, while it is empty. A directory that was
 * already there is never one the create made, and one that has gained another entry since stays, with every directory above
 * it. Returns the directories removed, deepest first.
 */
function removeCreated(resolved: string, madeDir: string | undefined): string[] {
  unlinkSync(resolved);
  const removed: string[] = [];
  if (madeDir === undefined) return removed;
  for (let dir = dirname(resolved); dir === madeDir || dir.startsWith(`${madeDir}${sep}`); dir = dirname(dir)) {
    try {
      rmdirSync(dir);
    } catch {
      break;
    }
    removed.push(dir);
  }
  return removed;
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
    // The same skip as the directory listing (REQ-TOOLS-134, REQ-TOOLS-140 with PD-TOOLS-012): two listings of one
    // directory agree, and a close match is drawn only from what is listed.
    names = readdirSync(parent).filter((n) => !IGNORE_COMPONENTS.has(n));
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
export interface EditMatch {
  level: 1 | 2 | 3 | 4;
  starts: number[];
  offsets?: number[];
  similarity?: number;
  /**
   * Level 3 only, one per start: the leading prefix that tells the window from `old_string`, and whether the file's lines
   * carry it in addition to `old_string`'s (`deeper`) or `old_string`'s carry it and the file's do not. Read by
   * `PD-TOOLS-014`'s near-miss reply, and by `write_file`'s level-3 apply, which carries it into `new_string` (`PD-TOOLS-015`).
   */
  shifts?: { prefix: string; deeper: boolean }[];
}

export function matchEdit(lines: readonly string[], oldText: string): EditMatch | null {
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
  const shifts: { prefix: string; deeper: boolean }[] = [];
  const indent = (s: string) => /^\s*/.exec(s)?.[0] ?? '';
  for (let i = 0; i < windows; i += 1) {
    const w = at(i);
    const first = w[0] as string;
    const firstOld = oldLines[0] as string;
    const shift = indent(first).length - indent(firstOld).length;
    if (shift === 0) continue;
    const shifted = oldLines.map((l) => (shift > 0 ? `${indent(first).slice(0, shift)}${l}` : l.startsWith(indent(firstOld).slice(0, -shift)) ? l.slice(-shift) : null));
    if (shifted.every((x) => x !== null) && eq(w, shifted as string[])) {
      l3.push(i);
      shifts.push(shift > 0 ? { prefix: indent(first).slice(0, shift), deeper: true } : { prefix: indent(firstOld).slice(0, -shift), deeper: false });
    }
  }
  if (l3.length) return { level: 3, starts: l3, shifts };
  let best: { i: number; s: number } | null = null;
  for (let i = 0; i < windows; i += 1) {
    const s = similarity(at(i).join('\n'), oldText);
    if (s >= 0.85 && (best === null || s > best.s)) best = { i, s };
  }
  if (best) return { level: 4, starts: [best.i], similarity: best.s };
  return null;
}

/**
 * REQ-TOOLS-135's success message for one replacement (`write_file`'s `edit`, and `haet_edit` under REQ-TOOLS-189): the
 * lines it replaced, how many lines replaced them, where, and the lines it added and removed — what the edit DID. Until
 * 2026-10-06 the message was "<k> lines changed at line <n>" with `k` the old string's line count alone: the live run at
 * 27a5127 was told "4 lines changed" for a 4-line block that became 9, beside a row reading `+5 -0`, and re-read the file
 * to see which was true (live-run finding G6,
 * docs/defects/fixed/an-edit-reports-the-old-strings-line-count-as-the-lines-it-changed.md).
 *
 * The replaced region is read from the file, not from the strings. It starts at the match's first line (every line before
 * it is untouched) and ends where the two texts' common trailing lines begin, but never before the last line the match
 * spans, so the old string's own lines are always the ones it reports replacing. The falsified reading, kept beside its
 * replacement: the first repair took the region as the old string's `k` lines and their length after the edit as `k` plus
 * the change in the file's line count. That is true only while the edit moves no line boundary: an old string ending in a
 * newline its new string lacks merges the next line into the replacement, which that region left out, and `'a\nb\nc\n'`
 * with `'b\n'` -> `'x'` read "1 line removed (+0 -1)" beside a row of `+1 -2` (the fin18 verifier's probe). Lines outside
 * the region are equal on both sides, so the region's line LCS (`lineChanges`) is the row's own `+A -R`.
 */
function replacementMessage(rel: string, before: string, after: string, oldText: string, start: number): string {
  const b = splitLines(before);
  const a = splitLines(after);
  const spanned = Math.min(b.length, start + Math.max(1, lineCount(oldText)));
  let common = 0;
  while (common < b.length - spanned && common < a.length - start && b[b.length - 1 - common] === a[a.length - 1 - common]) common += 1;
  const replaced = b.slice(start, b.length - common);
  const by = a.slice(start, a.length - common);
  const { added, removed } = lineChanges(replaced, by);
  const k = replaced.length;
  // REQ-TOOLS-135's own word, "replaced", also when nothing is left: "3 lines replaced by 0" (until round 2, "3 lines removed").
  return `Edited ${rel}: ${countNoun(k, 'line')} replaced by ${by.length} at line ${start + 1} (+${added} -${removed}).`;
}

/**
 * REQ-TOOLS-135's success message for a replace-all (`write_file`'s `edit` and `haet_edit` with `replace_all`, REQ-TOOLS-136's
 * "every exact occurrence as plain text"): how many occurrences, the lines they touched, how many lines replaced those, and
 * the lines added and removed. Until fin21 it read "<n> occurrences replaced." and named no line at all, where the requirement
 * has success messages report lines changed (the fin18 verifier's finding,
 * docs/defects/fixed/a-replace-all-edit-reports-occurrences-and-no-lines-changed.md).
 *
 * Counted region by region, as `replacementMessage` counts its one region, so a file past the diff table's bound is still
 * counted line by line: each occurrence's region is the whole lines it spans, running on to the end of the line the first
 * character after it sits on (the next line too when the old string ends in a newline, the boundary case the single edit
 * meets), and occurrences whose regions overlap or meet become one region. Text outside the regions is the same on both sides, so a
 * region's replacement is the region's own text with its occurrences replaced.
 */
function replaceAllMessage(rel: string, before: string, oldText: string, newText: string, count: number, written?: readonly string[]): string {
  // `PD-TOOLS-017`: `written` holds each occurrence's replacement as written (its line endings carried), so the counts describe
  // the bytes written; each region's replacement is its text with its own occurrences spliced in order.
  const regions: [number, number, number[]][] = [];
  const lineEnd = (at: number): number => {
    const nl = before.indexOf('\n', at);
    return nl === -1 ? before.length : nl + 1;
  };
  if (oldText === '') regions.push([0, before.length, []]);
  else {
    for (let at = before.indexOf(oldText); at !== -1; at = before.indexOf(oldText, at + oldText.length)) {
      const from = at === 0 ? 0 : before.lastIndexOf('\n', at - 1) + 1;
      // The line the first character after the occurrence sits on: its own last line, or the next one after a newline.
      const to = lineEnd(at + oldText.length);
      const last = regions[regions.length - 1];
      if (last !== undefined && from <= last[1]) { last[1] = Math.max(last[1], to); last[2].push(at); }
      else regions.push([from, to, [at]]);
    }
  }
  let occurrence = 0;
  const replacedRegion = (from: number, to: number, ats: readonly number[]): string => {
    const region = before.slice(from, to);
    if (oldText === '') return region.split('').join(newText);
    if (written === undefined) return region.split(oldText).join(newText);
    let text = '';
    let cursor = from;
    for (const at of ats) {
      text += before.slice(cursor, at) + (written[occurrence] as string);
      occurrence += 1;
      cursor = at + oldText.length;
    }
    return text + before.slice(cursor, to);
  };
  let replaced = 0;
  let by = 0;
  let added = 0;
  let removed = 0;
  for (const [from, to, ats] of regions) {
    const region = before.slice(from, to);
    const b = splitLines(region);
    const a = splitLines(replacedRegion(from, to, ats));
    const changes = lineChanges(b, a);
    replaced += b.length;
    by += a.length;
    added += changes.added;
    removed += changes.removed;
  }
  return `Edited ${rel}: ${countNoun(count, 'occurrence')} replaced, ${countNoun(replaced, 'line')} replaced by ${by} (+${added} -${removed}).`;
}

/** REQ-TOOLS-134's cap on a read's output, which `PD-TOOLS-014` borrows for the near-miss quote. */
const NEAR_MISS_QUOTE_CAP = 30_000;

/**
 * REQ-TOOLS-136 level 1 over `text`: the 0-based line on which each occurrence of `needle` starts, found exactly as
 * `matchEdit` finds them (plain text, each search resuming after the last occurrence), so they are the lines a retry with
 * `needle` as `old_string` would be refused naming. Counted line by line as the search moves, never by re-splitting the text.
 */
function levelOneLines(text: string, needle: string): number[] {
  const out: number[] = [];
  if (needle.length === 0) return out;
  let line = 0;
  let scanned = 0;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) {
    for (let nl = text.indexOf('\n', scanned); nl !== -1 && nl < i; nl = text.indexOf('\n', nl + 1)) line += 1;
    scanned = i;
    out.push(line);
    // The occurrence's own newlines are counted by the next step, from where it starts.
  }
  return out;
}

/**
 * `PD-TOOLS-014`: the reply of a `haet_edit` miss whose `old_string` matches at REQ-TOOLS-136 level 2 or 3. The edit stays
 * refused (REQ-TOOLS-189 matches at level 1 only); what changes is that the fact `matchEdit` already computed reaches the
 * caller — which lines, which level, what differs — and, for one window, the window's own text, so a retry needs neither a
 * read nor a shell probe. The final duress run at `a68f121` (finding D5) spent seven failed edits and their `cat -A` probes
 * on six such misses (docs/defects/fixed/haet-edit-answers-a-whitespace-only-miss-with-not-found-exactly.md).
 *
 * The quote is the file's lines joined by `\n` — a substring of the file — so sent back as `old_string` it matches at level 1.
 * It is JSON because the difference is whitespace nobody can see in a plain quote. The facts come before it, so the
 * 2,000-character error record (REQ-SESSION-136) keeps them. Sent only after the hash matched: the text is what the
 * caller's hash already names, and the stale-hash refusal, which never quotes, is not reached here.
 */
function nearMissMessage(rel: string, lines: readonly string[], m: EditMatch, oldText: string, voice: NearMissVoice = haetVoice(rel)): string {
  const k = oldText.split('\n').length;
  const { head, reader } = voice;
  const kind = m.level === 2 ? 'match level 2 (trailing whitespace)' : 'match level 3 (indentation shift)';
  const range = (start: number) => (k === 1 ? `line ${start + 1}` : `lines ${start + 1}-${start + k}`);
  /*
   * Revision 2 (OQ-252, R-072, 2026-10-13): the window is whole lines but level 1 is a substring search, so a window's text
   * can occur again inside a longer line or across a line boundary, and sent back alone it would be refused "Found <n>
   * occurrences" (docs/defects/fixed/a-near-miss-quote-that-occurs-more-than-once-is-promised-to-match-exactly.md). Such a
   * reply names the occurrences and asks for one neighbouring line, unchanged, in both strings; the quote is never widened,
   * because a widened `old_string` would no longer line up with the `new_string` the caller wrote. A unique quote's reply is
   * revision 1's, word for word.
   */
  const text = lines.join('\n');
  const fileLines = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
  const repeats = new Map<string, number[]>();
  const occurrences = (start: number): number[] => {
    const q = lines.slice(start, start + k).join('\n');
    let at = repeats.get(q);
    if (at === undefined) { at = levelOneLines(text, q); repeats.set(q, at); }
    return at;
  };
  const listed = (xs: readonly number[]) => `${xs.slice(0, 10).map((x) => x + 1).join(', ')}${xs.length > 10 ? ` and ${xs.length - 10} more` : ''}`;
  // The window and one line on each side, clamped to the file's lines as the readers count them.
  const around = (start: number) => {
    const from = Math.max(1, start);
    const to = Math.max(from, Math.min(fileLines, start + k + 1));
    return { from, to, read: `offset ${from} limit ${to - from + 1}` };
  };
  const neighbour = 'add a neighbouring line, unchanged, to both old_string and new_string so that the text occurs once.';
  if (m.starts.length > 1) {
    const reads = m.starts.map((s) => `offset ${s + 1} limit ${k}`).join('; ');
    const base = `${head} It matches at ${kind} in ${m.starts.length} places, starting at lines ${m.starts.map((s) => s + 1).join(', ')}; nothing was written. Read the one you mean with ${reader} (${reads}) and send its exact text as old_string.`;
    const groups = new Map<string, { windows: number[]; at: number[] }>();
    for (const s of m.starts) {
      const at = occurrences(s);
      if (at.length < 2) continue;
      const q = lines.slice(s, s + k).join('\n');
      const g = groups.get(q);
      if (g === undefined) groups.set(q, { windows: [s], at });
      else g.windows.push(s);
    }
    if (groups.size === 0) return base;
    const all = [...groups.values()];
    const parts = all.slice(0, 10).map(({ windows, at }) => `the text of the window${windows.length === 1 ? '' : 's'} at line${windows.length === 1 ? '' : 's'} ${windows.map((s) => s + 1).join(', ')} occurs ${at.length} times in the file, starting at lines ${listed(at)}`);
    const more = all.length > 10 ? `; and ${countNoun(all.length - 10, 'more window text')}` : '';
    const readsAround = [...new Set(all.flatMap(({ windows }) => windows.map((s) => around(s).read)))].join('; ');
    const said = parts.join('; ');
    return `${base} ${said.charAt(0).toUpperCase()}${said.slice(1)}${more}, so sent back alone as old_string it would be refused as ambiguous. Read it with one line on each side (${readsAround}) and ${neighbour}`;
  }
  const start = m.starts[0] as number;
  const window = lines.slice(start, start + k);
  let differs: string;
  if (m.level === 2) {
    const oldLines = oldText.split('\n');
    const trail = (x: string) => /\s*$/.exec(x)?.[0] ?? '';
    const diff = window.flatMap((line, i) => (line === oldLines[i] ? [] : [`line ${start + i + 1} ends in ${JSON.stringify(trail(line))} in the file and ${JSON.stringify(trail(oldLines[i] as string))} in old_string`]));
    const shown = diff.slice(0, 10).join('; ');
    differs = `They differ only in trailing whitespace or carriage returns: ${shown}${diff.length > 10 ? `; and ${countNoun(diff.length - 10, 'more line')}` : ''}.`;
  } else {
    const shift = m.shifts?.[0] as { prefix: string; deeper: boolean };
    const what = `${JSON.stringify(shift.prefix)} (${countNoun(shift.prefix.length, 'character')})`;
    differs = shift.deeper
      ? `Every line of the file carries the leading prefix ${what} in addition to old_string's indentation.`
      : `Every line of old_string carries the leading prefix ${what} that the file's lines do not.`;
  }
  const at = occurrences(start);
  let flag = '';
  if (at.length > 1) {
    const { from, to, read } = around(start);
    flag = ` This text occurs ${at.length} times in the file, starting at lines ${listed(at)}, so sent back alone as old_string it would be refused as ambiguous. Read ${from === to ? `line ${from}` : `lines ${from}-${to}`} with ${reader} (${read}) and ${neighbour}`;
  }
  const facts = `${head} It matches ${range(start)} at ${kind}. ${differs}${voice.current} ${voice.ask}${flag}`;
  const fallback = `If these are not the lines you meant, read the file again with ${reader}.`;
  const quote = JSON.stringify(window.join('\n'));
  if (quote.length > NEAR_MISS_QUOTE_CAP) {
    if (flag !== '') return `${facts} The window is too long to quote here (${quote.length} characters as JSON). ${fallback}`;
    return `${facts} The window is too long to quote here (${quote.length} characters as JSON); read it with ${reader} (offset ${start + 1} limit ${k}) and send its exact text as old_string${voice.sameHash}. ${fallback}`;
  }
  if (flag !== '') return `${facts} The file's text over ${range(start)}, as this JSON string: ${quote} ${fallback}`;
  return `${facts} Sent back as old_string${voice.sameHash}, the file's text over ${range(start)} matches exactly, as this JSON string: ${quote} ${fallback}`;
}

/**
 * The wording `nearMissMessage` speaks in, per tool. `haet_edit`'s (`PD-TOOLS-014`) names the hash the caller holds and
 * `haet_read`; `write_file`'s (`PD-TOOLS-015`) has no hash, opens with the level-3 refusal's own sentence, asks for both
 * strings at the file's indentation and names `read_file`.
 */
interface NearMissVoice {
  /** The opening sentence. */
  head: string;
  /** The hash sentence after what differs, with its leading space, or empty. */
  current: string;
  /** Clause 4: what the caller is asked to send. */
  ask: string;
  /** The tool every pointer names. */
  reader: 'haet_read' | 'read_file';
  /** What a retry with the quote must carry besides it, with its leading space, or empty. */
  sameHash: string;
}

function haetVoice(rel: string): NearMissVoice {
  return {
    head: `old_string was not found exactly in ${rel}.`,
    current: ' Your content_hash is still current and nothing was written.',
    ask: "Give new_string the file's indentation and line endings.",
    reader: 'haet_read',
    sameHash: ' with the same content_hash',
  };
}

/**
 * `PD-TOOLS-015`: what a `write_file` edit that matched one window only at REQ-TOOLS-136 level 3 writes as its replacement.
 * The indentation of `new_string`'s first visible line decides. Equal to `old_string`'s first visible line's (O), the caller
 * wrote both strings from the same belief about the file's depth, so `new_string` takes the window's shift; equal to the
 * window's corresponding line's (W), it already sits at the file's depth and is written as given; with no visible
 * character it is a deletion, written as given. Level 3 requires O and W to differ, so the cases are disjoint. Anything else
 * — a third depth, or a shallower shift a visible line of `new_string` cannot take — leaves the tool unable to tell what the
 * caller meant, and is refused.
 *
 * Until OQ-233's ruling `write_file` wrote every level-3 `new_string` unshifted. The six level-3 misses of the final duress
 * pack at `a68f121` carried the same extra space in both strings (`PD-TOOLS-014`'s first execution), so each would have
 * landed one space off beside a success; shifting always would break the opposite case, a `new_string` at the file's depth.
 *
 * Lines with no visible character are never padded nor stripped: a blank line stays blank, a whitespace-only one as given.
 */
export type NewStringShift =
  | { kind: 'blank' | 'as-given'; text: string }
  | { kind: 'shifted'; text: string }
  | { kind: 'refuse'; line?: number };

export function shiftNewString(newText: string, oldText: string, window: readonly string[], shift: { prefix: string; deeper: boolean }): NewStringShift {
  const visible = (x: string) => /\S/.test(x);
  const indent = (x: string) => /^\s*/.exec(x)?.[0] ?? '';
  const newLines = newText.split('\n');
  const j = newLines.findIndex(visible);
  if (j === -1) return { kind: 'blank', text: newText };
  const oldLines = oldText.split('\n');
  const i = oldLines.findIndex(visible);
  const o = indent(oldLines[i] ?? '');
  const w = indent(window[i] ?? '');
  const n = indent(newLines[j] as string);
  if (n === o) {
    const { prefix, deeper } = shift;
    const out: string[] = [];
    for (const [at, line] of newLines.entries()) {
      if (!visible(line)) out.push(line);
      else if (deeper) out.push(`${prefix}${line}`);
      else if (line.startsWith(prefix)) out.push(line.slice(prefix.length));
      else return { kind: 'refuse', line: at + 1 };
    }
    return { kind: 'shifted', text: out.join('\n') };
  }
  if (n === w) return { kind: 'as-given', text: newText };
  return { kind: 'refuse' };
}

/**
 * `PD-TOOLS-016` (OQ-246, R-072, 2026-10-13): what a `write_file` edit that matched one window at REQ-TOOLS-136 level 2, 3 or
 * 4 writes as its replacement lines. At level 2 every line of `new_string` paired with an identical line of `old_string`
 * (`linePairs`, the diff row's own walk) is the window's own line, byte for byte, its trailing whitespace and `\r` included.
 * At every window level, a CRLF window — at least one of its lines followed by a line break in the file and every such line
 * ending in `\r`, or, with none, the file's other lines read the same way — gives `\r` to each replacement line a line
 * break follows that lacks one. Any other window's unpaired lines are written as given.
 *
 * Until this directive the replacement was `new_string`'s lines as given: on a CRLF file an LF `old_string` matches only at
 * level 2, so the file was left with LF lines among CRLF ones and an unchanged line counted as changed, and a hard break the
 * caller repeated without its spaces was dropped
 * (docs/defects/fixed/a-write-file-edit-at-match-level-2-on-a-crlf-file-writes-lf-lines-among-crlf-ones.md).
 */
export function carryWindow(newText: string, oldText: string, fileLines: readonly string[], start: number, level: 2 | 3 | 4): { text: string; crlfAdded: boolean } {
  const oldLines = oldText.split('\n');
  const k = oldLines.length;
  const out = newText.split('\n');
  if (level === 2) {
    const given = [...out];
    for (const [i, j] of linePairs(oldLines, given)) out[j] = fileLines[start + i] as string;
  }
  // A line break follows every line of the split but its last element, the text after the final break. A window has such a
  // line unless it is that last element alone; then the file's other lines are read instead.
  const windowEnd = Math.min(fileLines.length, start + k);
  const crlf = crlfLines(fileLines, start, windowEnd - 1);
  let crlfAdded = false;
  if (crlf) {
    const lastFollowed = windowEnd - 1 < fileLines.length - 1;
    for (let j = 0; j < out.length; j += 1) {
      const line = out[j] as string;
      if ((j < out.length - 1 || lastFollowed) && !line.endsWith('\r')) { out[j] = `${line}\r`; crlfAdded = true; }
    }
  }
  return { text: out.join('\n'), crlfAdded };
}

/**
 * `PD-TOOLS-016` clause 2's test, which `PD-TOOLS-017` and `PD-TOOLS-018` read too: the lines `first` to `last` of `fileLines` (a `split('\n')`
 * of the file) are CRLF when at least one of them is followed by a line break and every such line ends in `\r`; when none of
 * them is followed by one (the span lies in the file's unterminated last element), the file's other lines are read the same way.
 *
 * It reads only the lines it tests: `first` to `last`, or, for the last element, every other line once per `memo`. A
 * `replace_all` asks once per occurrence, and until the review of fin38 each question walked the whole file, so a 50,000-line
 * file with a token on every line took about 3 s to carry and the cost grew with the square of its length (`replace_all` had been
 * a linear split and join).
 */
export function crlfLines(fileLines: readonly string[], first: number, last: number, memo?: { otherLines?: boolean }): boolean {
  // A line break follows every element of the split but the last.
  const followed = fileLines.length - 1;
  const allCr = (from: number, to: number): boolean => {
    let any = false;
    for (let at = Math.max(0, from); at <= Math.min(to, followed - 1); at += 1) {
      if (!(fileLines[at] as string).endsWith('\r')) return false;
      any = true;
    }
    return any;
  };
  if (first < followed) return allCr(first, last);
  if (memo?.otherLines !== undefined) return memo.otherLines;
  const others = allCr(0, followed - 1);
  if (memo) memo.otherLines = others;
  return others;
}

/**
 * `PD-TOOLS-017` (OQ-254, R-072, 2026-10-13): an exact edit — REQ-TOOLS-136 level 1 through `write_file`, `haet_edit` and
 * `haet`, and every occurrence of a `replace_all` — keeps a CRLF file's line endings. Each occurrence of `oldText` at
 * `offsets` (ascending, non-overlapping) is tested on the lines its span touches, from the line holding its first character to
 * the line holding its last, by `PD-TOOLS-016` clause 2's test (`crlfLines`). For a CRLF occurrence every `\n` of the written
 * replacement, and a `\n` directly after it in the result, gains a `\r` when the character before it in the result is not
 * `\r`; a `\r` is never doubled, and every other occurrence is written as given. Decided on the result, so a span that took
 * the file's own `\r` with it (`PD-TOOLS-014`'s quote, `one\r\ntwo\r`, retried with `ONE\ntwo`) gives it back.
 *
 * Until this directive the replacement was `new_string` as given: `one\r\ntwo\r\n` edited `one` → `ONE\nX` left
 * `ONE\nX\r\ntwo\r\n` beside a clean success (docs/defects/fixed/a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file.md).
 * Returns the file's new text, each occurrence's written replacement (a `\r` added after the span is counted in it) and
 * whether a `\r` was added.
 */
export function carryExact(before: string, offsets: readonly number[], oldText: string, newText: string): { after: string; replacements: string[]; crlfAdded: boolean } {
  const fileLines = before.split('\n');
  const breaks: number[] = [];
  for (let nl = before.indexOf('\n'); nl !== -1; nl = before.indexOf('\n', nl + 1)) breaks.push(nl);
  // The line holding the character at `at`: the number of line breaks before it (a `\n` belongs to the line it ends).
  const lineOf = (at: number): number => {
    let lo = 0;
    let hi = breaks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((breaks[mid] as number) < at) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  let out = '';
  let cursor = 0;
  let crlfAdded = false;
  const replacements: string[] = [];
  const memo: { otherLines?: boolean } = {};
  for (let i = 0; i < offsets.length; i += 1) {
    const at = offsets[i] as number;
    const end = at + oldText.length;
    out += before.slice(cursor, at);
    let text = newText;
    if (oldText.length > 0 && crlfLines(fileLines, lineOf(at), lineOf(end - 1), memo)) {
      text = '';
      const prev = () => (text.length > 0 ? text[text.length - 1] : out[out.length - 1]);
      for (const ch of newText) {
        if (ch === '\n' && prev() !== '\r') { text += '\r'; crlfAdded = true; }
        text += ch;
      }
      if (before[end] === '\n' && offsets[i + 1] !== end && prev() !== '\r') { text += '\r'; crlfAdded = true; }
    }
    out += text;
    replacements.push(text);
    cursor = end;
  }
  return { after: out + before.slice(cursor), replacements, crlfAdded };
}

/** Every offset of `oldText` in `text`, found as REQ-TOOLS-136 level 1 and `replace_all` find them: plain text, each search resuming after the last occurrence. */
function occurrences(text: string, oldText: string): number[] {
  const out: number[] = [];
  if (oldText.length === 0) return out;
  for (let i = text.indexOf(oldText); i !== -1; i = text.indexOf(oldText, i + oldText.length)) out.push(i);
  return out;
}

/** `PD-TOOLS-017` clause 3's refusal: the carried edit would leave the file's bytes as they are. */
const LINE_ENDINGS_ONLY = "old_string and new_string differ only in line endings, which an edit keeps as the file's; nothing to change. Use write_file's 'overwrite' to change a file's line endings.";

/** `PD-TOOLS-017` clause 4's sentence, which `PD-TOOLS-016` clause 3 also adds. */
const CRLF_SENTENCE = " new_string was written with the file's CRLF line endings.";

/**
 * `PD-TOOLS-016` revision 3 clause 4's refusal (OQ-260, R-072, 2026-10-13): one window matched at `level` (2, 3 or 4), and the
 * replacement as carried is the window's own bytes. The window's lines are numbered from 1, and cut at the file's last line so
 * a window that takes in the empty element after a final line break names only lines the file has; the cut reaches the first
 * line too, so a window wholly in that element names the last line, never the one after it (`' '` → `''` on `foo\n` read
 * "(line 2)" until fin40, docs/defects/fixed/a-window-no-op-refusal-names-a-line-after-the-files-last-line.md). Until this clause the edit
 * rewrote the file unchanged beside "(+0 -0)", with an undo entry that restored the same content
 * (docs/defects/fixed/a-window-edit-that-lands-on-the-files-own-bytes-is-applied-as-a-success.md).
 */
export function windowNoOpMessage(rel: string, level: number, start: number, k: number, fileLineCount: number): string {
  const first = Math.min(start + 1, Math.max(1, fileLineCount));
  const last = Math.max(first, Math.min(start + k, fileLineCount));
  const where = first === last ? `line ${first}` : `lines ${first}-${last}`;
  return `old_string matches ${rel} only at match level ${level} (${where}), and those lines already hold new_string as this edit would write it; nothing to change. Use write_file's 'overwrite' to write a file exactly as given.`;
}

/** `PD-TOOLS-018` clause 3's sentence. */
const INSERT_CRLF_SENTENCE = " content was written with the file's CRLF line endings.";

/**
 * `PD-TOOLS-018` (OQ-259, R-072, 2026-10-13): what a `write_file` insert of `content` at line `at` writes into `text`. Positions
 * count lines as `splitLines` does, so the one after a final newline is not a place to insert after, and a terminated `content`
 * is its lines rather than its lines and a blank one; the result ends in a newline when the file did, or when the insert lands at
 * the end and its own content does.
 *
 * A non-empty `content` is tested by `PD-TOOLS-016` clause 2's test (`crlfLines`) on the file's line before the insertion point
 * and the line at it, where those exist, or, when neither is followed by a line break, on the file's other lines; an empty file
 * is not CRLF. For a CRLF insertion every line break the insert writes — the one after each inserted line that a break
 * follows, and the one added after a previously unterminated last line — gains `\r` when the character before it is not `\r`.
 * No byte of the file's existing lines changes, and every other insertion is written as given.
 *
 * Until this directive the inserted lines were joined with `\n` alone, so `a\r\nb\r\n` with `X` at line 1 left `a\r\nX\nb\r\n`
 * beside a clean success (docs/defects/fixed/a-write-file-insert-writes-lf-lines-into-a-crlf-file.md).
 */
export function carryInsert(text: string, content: string, at: number): { after: string; inserted: number; crlfAdded: boolean } {
  const lines = splitLines(text);
  const ins = splitLines(content);
  const terminated = text.endsWith('\n') || (at === lines.length && content.endsWith('\n'));
  const crlf = content !== '' && crlfLines(text.split('\n'), Math.max(0, at - 1), at);
  let crlfAdded = false;
  const cr = (line: string): string => {
    if (!crlf || line.endsWith('\r')) return line;
    crlfAdded = true;
    return `${line}\r`;
  };
  const head = lines.slice(0, at);
  // The break joining a previously unterminated last line to the inserted lines is the insert's.
  if (crlf && ins.length > 0 && at === lines.length && at > 0 && !text.endsWith('\n')) head[at - 1] = cr(head[at - 1] as string);
  const tail = lines.slice(at);
  // A line break follows each inserted line but the last of the result when the result is unterminated.
  const body = ins.map((line, j) => (j < ins.length - 1 || tail.length > 0 || terminated ? cr(line) : line));
  const out = [...head, ...body, ...tail];
  return { after: `${out.join('\n')}${terminated && out.length > 0 ? '\n' : ''}`, inserted: ins.length, crlfAdded };
}

/** Apply the single window match (levels 2 to 4): it replaces whole lines. A level-1 match is `carryExact`'s (`PD-TOOLS-017`). */
function applyWindow(lines: readonly string[], m: EditMatch, oldText: string, newText: string): string {
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

/**
 * PD-TOOLS-007: the target of a `write_file` call whose arguments are only those `create` reads — a path (or `file_path`)
 * and `content` as strings, and none of `old_string`, `new_string`, `insert_line` or a true `replace_all` — when the
 * fence lets it be written; null for any other call, whose operation cannot be read from its arguments alone.
 */
function createOnlyTarget(fence: FenceConfig, args: Readonly<Record<string, unknown>>): { resolved: string; rel: string } | null {
  const path = args['path'] ?? args['file_path'];
  if (typeof path !== 'string' || path === '' || typeof args['content'] !== 'string') return null;
  if (args['old_string'] !== undefined || args['new_string'] !== undefined || args['insert_line'] !== undefined || args['replace_all'] === true) return null;
  const t = readTarget(fence, path, 'write');
  return t.ok ? { resolved: t.resolved, rel: t.rel } : null;
}

export function writeFileTool(state: FileToolState, fence: FenceConfig): ToolExecutor<z.infer<typeof writeSchema>> {
  return {
    name: 'write_file',
    /*
     * The field is named in the prose because the prose is what a model reads first. The live run of 2026-09-29
     * (WF1) had two children send `path` and `content` with no `operation`, be refused, and regenerate their
     * whole file: the schema they were sent names the field, but the sentence they acted on listed the
     * operations as verbs and never said they were the values of a required selector. REQ-TOOLS-135 names the
     * selector `operation` and nothing fixes this wording (recorded as
     * docs/defects/fixed/write-files-first-use-refusal-recurred-under-duress.md). The duress run after it still had 1 of 4
     * children omit the field; reading the selector from the call is the fourth repair PD-TOOLS-007 allows (`inferArguments`).
     */
    description: 'Create, edit, overwrite, insert into, or undo the last write of a workspace file. Every call names its `operation` — one of create, edit, overwrite, insert, undo — with the fields that operation reads: create {path, content}; edit {path, old_string, new_string, replace_all?}; overwrite {path, content}; insert {path, content, insert_line} (0 = beginning); undo {path} (undoing a create removes the file it made). Example: {"operation": "create", "path": "notes.txt", "content": "hello\\n"}. Read a file before editing or overwriting it. An edit whose old_string matches only once its indentation is shifted moves new_string by the same shift when new_string shares old_string\'s indentation, writes it as given when it already has the file\'s, and otherwise is refused with the file\'s lines quoted. An edit or an insert keeps a CRLF file\'s line endings, and an edit at match level 2 keeps the exact bytes of every line new_string repeats unchanged from old_string.',
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
        // PD-TOOLS-007 reads a missing selector as `create` only for a file that does not exist; say why this one was not.
        const target = createOnlyTarget(fence, args);
        const exists = target !== null && existsSync(target.resolved) ? ` ${target.rel} already exists, so the call was not read as a create; name 'overwrite' or 'edit'.` : '';
        return errorObservation(`write_file requires an operation: one of create, edit, overwrite, insert, undo. Example: {"operation": "edit", "path": "notes.txt", "old_string": "a", "new_string": "b"}.${exists} (${detail})`);
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
    /*
     * PD-TOOLS-007 (OQ-139, ruled by the owner under R-071): a call with a path and content, no `operation` and no field
     * only another operation reads, aimed at a file that does not exist, can only be a create, so it is read as one and
     * its result says so. A file that exists is never inferred into: such a call is refused as REQ-TOOLS-032 says, and
     * `execute`'s create still refuses a file that appeared since, so no inference can overwrite. The duress runs refused
     * 1 to 4 children's first write this way, each then resending its whole file
     * (docs/defects/fixed/write-files-first-use-refusal-recurred-under-duress.md).
     */
    inferArguments: (args) => {
      if (args['operation'] !== undefined) return null;
      const target = createOnlyTarget(fence, args);
      if (target === null || existsSync(target.resolved)) return null;
      return { args: { ...args, operation: 'create' }, note: `No operation was given, so this call was read as 'create': ${target.rel} did not exist. Name the operation on every write_file call.` };
    },
    label: (a) => `write_file ${a.operation} ${a.path ?? a.file_path ?? ''}`,
    execute: async (a) => {
      const path = (a.path ?? a.file_path) as string;
      const t = readTarget(fence, path, 'write');
      if (!t.ok) return t.obs;
      const { resolved, rel } = t;
      const exists = existsSync(resolved);
      const bytes = exists ? readFileSync(resolved) : null;
      const current = bytes === null ? null : decodeText(bytes);
      if (current?.binary) return errorObservation(`Binary file. Cannot edit ${rel}.`);
      const before = current?.text ?? null;
      const mustHaveRead = () => (!state.wasRead(resolved) ? errorObservation(`You must read ${rel} before editing it. Call read_file(path="${rel}") first, then retry your edit.`) : null);
      const commit = (after: string, message: string): Observation => {
        // The directory a create had to make is known only once it is made, so the entry is completed after the write.
        const madeDir = atomicWrite(resolved, after);
        if (before !== null) state.pushUndo(resolved, { previous: before });
        else state.pushUndo(resolved, madeDir === undefined ? { previous: null, written: sha256(after) } : { previous: null, madeDir, written: sha256(after) });
        state.markRead(resolved);
        return observation(`${message} (sha256 ${sha256(after)})`, { diff: renderDiff(rel, before, after) });
      };
      switch (a.operation) {
        case 'create': {
          if (exists) {
            // REQ-TOOLS-135 fixes this text. A 2026-09-22 extension added whether "this agent" had read the path,
            // and the read record cannot answer that: it is shared by every agent and run on the workspace root
            // (REQ-TOOLS-133, REQ-TOOLS-137), so a sibling's create read as the caller's own. Sibling collisions
            // are PD-TOOLS-006's write scopes to prevent. The history is in
            // docs/defects/fixed/the-create-guard-tells-an-agent-it-read-a-file-its-sibling-wrote.md.
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
          // Positions count lines as `splitLines` does; `carryInsert` places the lines and keeps a CRLF file's line endings (PD-TOOLS-018).
          const text = before ?? '';
          const lines = splitLines(text);
          if (a.insert_line > lines.length) return errorObservation(`insert_line ${a.insert_line} is beyond the end of ${rel} (${countNoun(lines.length, 'line')}).`);
          const content = a.content ?? '';
          const carried = carryInsert(text, content, a.insert_line);
          return commit(carried.after, `Inserted ${countNoun(carried.inserted, 'line')} into ${rel} at line ${a.insert_line}.${carried.crlfAdded ? INSERT_CRLF_SENTENCE : ''}`);
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
            if (a.old_string === '') return commit((before ?? '').split(a.old_string).join(a.new_string), replaceAllMessage(rel, before ?? '', a.old_string, a.new_string, count));
            // PD-TOOLS-017: every occurrence keeps a CRLF file's line endings; an edit left with the file's own bytes is refused.
            const carried = carryExact(before ?? '', occurrences(before ?? '', a.old_string), a.old_string, a.new_string);
            if (carried.after === before) return errorObservation(LINE_ENDINGS_ONLY);
            return commit(carried.after, `${replaceAllMessage(rel, before ?? '', a.old_string, a.new_string, count, carried.replacements)}${carried.crlfAdded ? CRLF_SENTENCE : ''}`);
          }
          const m = matchEdit(lines, a.old_string);
          if (!m) return errorObservation(`old_string was not found in ${rel} at any of the four match levels (exact, trailing-whitespace, indentation shift, fuzzy ≥ 0.85); the file has ${countNoun(lineCount(before ?? ''), 'line')}. Read the file again or use 'overwrite'.`);
          if (m.starts.length > 1) return errorObservation(`Found ${m.starts.length} occurrences of old_str at lines ${m.starts.map((s) => s + 1).join(', ')}. Add surrounding context to make the match unique, or set replace_all.`);
          const start = m.starts[0] as number;
          // PD-TOOLS-015: one level-3 window carries its shift into new_string, writes it as given, or is refused.
          let replacement = a.new_string;
          let said = '';
          if (m.level === 3 && /\S/.test(a.old_string)) {
            const shift = m.shifts?.[0] as { prefix: string; deeper: boolean };
            const k = a.old_string.split('\n').length;
            const decided = shiftNewString(a.new_string, a.old_string, lines.slice(start, start + k), shift);
            if (decided.kind === 'refuse') {
              const what = `${JSON.stringify(shift.prefix)} (${countNoun(shift.prefix.length, 'character')})`;
              const head = decided.line === undefined
                ? `old_string matches ${rel} only at match level 3 (indentation shift), and new_string's indentation matches neither old_string's nor the file's, so nothing was written.`
                : `old_string matches ${rel} only at match level 3 (indentation shift), and line ${decided.line} of new_string does not begin with the leading prefix ${what} that is removed from old_string's lines, so new_string cannot take the same shift and nothing was written.`;
              return errorObservation(nearMissMessage(rel, lines, m, a.old_string, { head, current: '', ask: "Give old_string and new_string the file's indentation.", reader: 'read_file', sameHash: '' }));
            }
            replacement = decided.text;
            if (decided.kind === 'shifted') said = ` new_string was shifted by the same leading prefix ${JSON.stringify(shift.prefix)} (${countNoun(shift.prefix.length, 'character')} ${shift.deeper ? 'added' : 'removed'}) to the file's indentation.`;
            if (decided.kind === 'as-given') said = " new_string already carries the file's indentation and was written as given.";
          }
          // PD-TOOLS-016: a window match keeps the file's line endings, and at level 2 the bytes of the lines it leaves unchanged.
          if (m.level > 1) {
            const carried = carryWindow(replacement, a.old_string, lines, start, m.level as 2 | 3 | 4);
            replacement = carried.text;
            if (carried.crlfAdded) said += CRLF_SENTENCE;
          }
          // PD-TOOLS-017: an exact match keeps a CRLF file's line endings; an edit left with the file's own bytes is refused.
          let after: string;
          if (m.level === 1) {
            const carried = carryExact(before ?? '', [m.offsets?.[0] as number], a.old_string, replacement);
            if (carried.after === before) return errorObservation(LINE_ENDINGS_ONLY);
            after = carried.after;
            if (carried.crlfAdded) said = CRLF_SENTENCE;
          } else {
            after = applyWindow(lines, m, a.old_string, replacement);
            // PD-TOOLS-016 revision 3 clause 4 (OQ-260): a window carried onto its own bytes is refused, not applied.
            if (after === before) return errorObservation(windowNoOpMessage(rel, m.level, start, a.old_string.split('\n').length, lineCount(before ?? '')));
          }
          const note = m.level > 1 ? ` Match level: ${m.level}${m.level === 4 ? ` (similarity: ${m.similarity!.toFixed(2)}). Verify the result.` : '.'}${said}` : said;
          return commit(after, `${replacementMessage(rel, before ?? '', after, a.old_string, start)}${note}`);
        }
        case 'undo': {
          const entry = state.popUndo(resolved);
          if (entry === undefined) return errorObservation(`No edit history for ${rel}.`);
          if (entry.previous === null) {
            /*
             * The write being undone made the file, so undoing it removes the file. Until 2026-10-06 this wrote
             * `previous ?? ''`: an empty file where there had been none, "Restored <p> to its previous content (0 lines)",
             * and a second undo with no history. The final duress run's continuation child (finding N2) was left with a
             * stray `.tmp-run-tests.sh` it had no tool to remove
             * (docs/defects/fixed/undoing-a-create-leaves-an-empty-file.md). A file gone since is not written back.
             */
            if (before === null) return observation(`${rel} did not exist before the create this undoes, and it does not exist now: nothing to remove.`, { diff: `${rel} +0 -0` });
            /*
             * Only the file the create made is the create's to remove. Until fin26 (2026-10-06) the undo removed whatever the
             * path held, so content a terminal command or another agent wrote over the created file was lost with it
             * (docs/defects/fixed/undoing-a-create-removes-another-writers-content.md). The file's bytes are compared with the
             * digest the create kept; a file that differs is left in place, the refusal names the path and quotes nothing (the
             * shape of REQ-TOOLS-189's changed-since refusal), and the entry goes back, since nothing changed.
             */
            if (entry.written !== undefined && bytes !== null && sha256(bytes) !== entry.written) {
              state.pushUndo(resolved, entry);
              return errorObservation(`Cannot undo the create of ${rel}: the file changed since it was created, so it was left in place. Read it again before changing it.`);
            }
            let dirs: string[];
            try {
              dirs = removeCreated(resolved, entry.madeDir);
            } catch (cause) {
              // Nothing changed, so the write stays undoable.
              state.pushUndo(resolved, entry);
              return errorObservation(`Could not remove ${rel}: ${cause instanceof Error ? cause.message : String(cause)}`);
            }
            const outermost = dirs[dirs.length - 1];
            // The directory's own spelling is `rel`'s parent once per segment between it and the file, taken by the
            // platform's path module: on POSIX a backslash is part of a name, never a separator.
            const depth = outermost === undefined ? 0 : relative(outermost, resolved).split(sep).length;
            let dirRel = rel;
            for (let i = 0; i < depth; i += 1) dirRel = dirname(dirRel);
            const also = outermost === undefined ? '' : ` Also removed the empty directory ${dirRel}/ the create made.`;
            return observation(`Removed ${rel}: it did not exist before the create this undoes (${countNoun(lineCount(before), 'line')} removed).${also}`, { diff: renderDiff(rel, before, '') });
          }
          const after = entry.previous;
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
    description: 'Hash-anchored exact edit: replace old_string with new_string in a file whose current SHA-256 equals content_hash (from haet_read). Reports the new content_hash. A miss that differs from the file only in trailing whitespace or a uniform indentation shift is refused, names the lines and quotes the file\'s text; a retry with that text needs the same content_hash and no read. An edit keeps a CRLF file\'s line endings.',
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
      // PD-TOOLS-017: an exact edit and every replace_all occurrence keep a CRLF file's line endings, and an edit left with
      // the file's own bytes is refused before anything is written.
      if (a.replace_all) {
        const count = before.split(a.old_string).length - 1;
        if (count === 0) return errorObservation(`old_string was not found in ${rel}. Read it again with haet_read.`);
        if (a.old_string === '') {
          after = before.split(a.old_string).join(a.new_string);
          message = replaceAllMessage(rel, before, a.old_string, a.new_string, count);
        } else {
          const carried = carryExact(before, occurrences(before, a.old_string), a.old_string, a.new_string);
          if (carried.after === before) return errorObservation(LINE_ENDINGS_ONLY);
          after = carried.after;
          message = `${replaceAllMessage(rel, before, a.old_string, a.new_string, count, carried.replacements)}${carried.crlfAdded ? CRLF_SENTENCE : ''}`;
        }
      } else {
        const m = matchEdit(lines, a.old_string);
        // PD-TOOLS-014: a level-2 or level-3 near miss says so; a level-4 match and no match keep REQ-TOOLS-189's reply.
        // An old_string with no visible character is no near miss: its "window" is blank lines, and a blank quote could
        // never match at level 1 as clause 5 promises (an empty one never does), so the caller would retry it forever.
        if (m && (m.level === 2 || m.level === 3) && /\S/.test(a.old_string)) return errorObservation(nearMissMessage(rel, lines, m, a.old_string));
        if (!m || m.level !== 1) return errorObservation(`old_string was not found exactly in ${rel}. Read it again with haet_read.`);
        if (m.starts.length > 1) return errorObservation(`Found ${m.starts.length} occurrences of old_str at lines ${m.starts.map((s) => s + 1).join(', ')}. Add surrounding context to make the match unique, or set replace_all.`);
        const start = m.starts[0] as number;
        const carried = carryExact(before, [m.offsets?.[0] as number], a.old_string, a.new_string);
        if (carried.after === before) return errorObservation(LINE_ENDINGS_ONLY);
        after = carried.after;
        message = `${replacementMessage(rel, before, after, a.old_string, start)}${carried.crlfAdded ? CRLF_SENTENCE : ''}`;
      }
      state.pushUndo(resolved, { previous: before });
      atomicWrite(resolved, after);
      state.markRead(resolved);
      return observation(`${message} content_hash: ${sha256(after)}`, { diff: renderDiff(rel, before, after) });
    },
  };
}

export { realPathOf, relPosix };
