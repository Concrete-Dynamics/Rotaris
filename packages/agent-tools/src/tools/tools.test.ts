import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import { checkFence, realPathOf, type FenceConfig } from './fence.js';
import { diffChanges as lineChangesOf, renderDiff } from './diff.js';
import { FileToolState, haetEditTool, haetReadTool, matchEdit, readFileTool, sha256, writeFileTool } from './files.js';
import { globToRegExp, globTool, grepTool, parseGitignore, ignoredBy } from './search.js';
import { TodoList, todoTool } from './todo.js';
import type { ToolContext } from './types.js';

let root: string;
let outside: string;
let fence: FenceConfig;
let state: FileToolState;
const clock = new FakeClock();
const ctx = (): ToolContext => ({ workspaceRoot: root, sessionId: 's', agentName: 'a', persona: 'p', monotonic: clock, wall: clock, signal: new AbortController().signal, warn: () => undefined });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rotaris-tools-'));
  outside = mkdtempSync(join(tmpdir(), 'rotaris-outside-'));
  fence = { workspaceRoot: root, allowOutsideWorkspace: false, additionalReadOnlyRoots: [] };
  state = new FileToolState();
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(root, 'src', 'a.ts'), 'const a = 1;\nconst b = 2;\nexport { a, b };\n');
  writeFileSync(join(root, 'src', 'b.ts'), 'import { a } from "./a";\n');
  writeFileSync(join(root, 'node_modules', 'x', 'index.js'), 'const a = 0;');
  writeFileSync(join(root, 'bin.dat'), Buffer.from([0x50, 0x4b, 0x00, 0x01]));
  writeFileSync(join(root, 'README.md'), '# hi\n');
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });

describe('the path fence (REQ-TOOLS-129/130/132)', () => {
  it('a relative path resolves against the root; an escape fails with the fixed message; the opt-out admits it; a read-only root admits reads only', () => {
    expect(checkFence(fence, 'src/a.ts', 'read')).toMatchObject({ ok: true, rel: 'src/a.ts', inside: true });
    const esc = checkFence(fence, '../elsewhere.txt', 'read');
    expect(esc.ok).toBe(false);
    expect(!esc.ok && esc.message).toMatch(/^Path '.*elsewhere\.txt' is outside workspace root '.*'$/);
    expect(checkFence({ ...fence, allowOutsideWorkspace: true }, join(outside, 'x.txt'), 'write').ok).toBe(true);
    const ro = { ...fence, additionalReadOnlyRoots: [outside] };
    expect(checkFence(ro, join(outside, 'x.txt'), 'read')).toMatchObject({ ok: true, readOnlyRoot: true });
    expect(checkFence({ ...ro, allowOutsideWorkspace: true }, join(outside, 'x.txt'), 'write').ok).toBe(false);
  });

  it('realPathOf rebuilds the missing tail of a relative path whole — REQ-TOOLS-129 rests on it answering rightly for every input', () => {
    // Until 2026-09-28 the walk that reached `.` dropped the first character of the first segment: `specs/index.md`
    // came back as `<cwd>/pecs/index.md` and `D:/ws` on POSIX as `<cwd>/:/ws` (docs/defects/fixed/realpathof-drops-a-character-from-a-relative-path.md).
    const cwd = realpathSync.native(process.cwd());
    expect(realPathOf(join('zz-absent-9f3c', 'child', 'index.md'))).toBe(join(cwd, 'zz-absent-9f3c', 'child', 'index.md'));
    expect(realPathOf('zz-absent-9f3c')).toBe(join(cwd, 'zz-absent-9f3c'));
    expect(realPathOf('.')).toBe(cwd);
    // an absolute path under an existing directory: the existing part is its real path, the rest is appended as given
    expect(realPathOf(join(root, 'src', 'absent', 'deep.ts'))).toBe(join(realpathSync.native(root), 'src', 'absent', 'deep.ts'));
    expect(realPathOf(join(root, 'src', 'a.ts'))).toBe(join(realpathSync.native(root), 'src', 'a.ts'));
    // the fence, over the same input: a workspace-relative path that does not exist yet is inside, and a root spelled relative is one directory, not another
    expect(checkFence(fence, 'src/absent/deep.ts', 'write')).toMatchObject({ ok: true, inside: true, rel: 'src/absent/deep.ts' });
    const rel = { ...fence, workspaceRoot: 'zz-absent-9f3c/ws' };
    expect(checkFence(rel, 'a.ts', 'read')).toMatchObject({ ok: true, inside: true, rel: 'a.ts' });
  });
});

describe('read_file (REQ-TOOLS-134)', () => {
  it('line-numbered content with the header; offset/limit; grep with context; a directory lists; binary is rejected', async () => {
    const t = readFileTool(state, fence);
    const r = await t.execute({ path: 'src/a.ts', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    // Three lines, each ended by a newline: 4 was the count before a final newline stopped starting a phantom line.
    expect(r.text.split('\n')[0]).toBe('[path: src/a.ts | total_lines: 3 | shown: lines 1-3 | truncated: false]');
    expect(r.text).toContain('2: const b = 2;');
    const page = await t.execute({ file_path: 'src/a.ts', offset: 2, limit: 1, grep_context: 3 }, ctx());
    expect(page.text).toContain('shown: lines 2-2 | truncated: true');
    const g = await t.execute({ path: 'src/a.ts', offset: 1, limit: 2000, grep: 'const b', grep_context: 0 }, ctx());
    expect(g.text).toContain("1 match(es) for 'const b':");
    expect(g.text).toContain('>2: const b = 2;');
    const none = await t.execute({ path: 'src/a.ts', offset: 1, limit: 2000, grep: 'zzz', grep_context: 3 }, ctx());
    expect(none.text).toMatch(/^No matches for pattern/);
    const dir = await t.execute({ path: 'src', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    expect(dir.text).toContain('a.ts\nb.ts');
    const top = await t.execute({ path: '.', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    expect(top.text).not.toContain('node_modules');
    expect(top.text).toContain('src/');
    const bin = await t.execute({ path: 'bin.dat', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    expect(bin).toMatchObject({ isError: true, text: 'Binary file (4 bytes). Cannot display content.' });
  });
  it('a missing path returns the parent listing and close matches at ≥ 0.45, highest first', async () => {
    const r = await readFileTool(state, fence).execute({ path: 'src/a.tsx', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    expect(r.isError).toBe(true);
    expect(r.text).toContain('Contents of src:');
    expect(r.text).toContain('Did you mean: a.ts, b.ts?');
  });
  it('a path under a file says the parent is a file; a path under nothing keeps the absent answer (REQ-TOOLS-134)', async () => {
    writeFileSync(join(root, '.git'), `gitdir: ${join(outside, 'worktrees', 'w')}\n`);
    const t = readFileTool(state, fence);
    const underFile = await t.execute({ path: '.git/HEAD', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    expect(underFile).toMatchObject({ isError: true, text: "File not found: .git/HEAD. '.git' is a file, not a directory." });
    const underNothing = await t.execute({ path: 'nowhere/at/all.txt', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    expect(underNothing).toMatchObject({ isError: true, text: 'File not found: nowhere/at/all.txt. Its parent directory does not exist either.' });
    const linked = await t.execute({ path: '.git', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    expect(linked.isError).not.toBe(true);
    expect(linked.text).toContain('gitdir:');
  });
  it('a memory: path names the tools it is given rather than listing a parent that never existed', async () => {
    // The names are stand-ins on purpose. REQ-MCP-116 makes the generated manifest the only place a real
    // runtime tool name is written, so a test that spelled them would be a second place — and injecting
    // them here is also what proves they are injected rather than baked into the refusal.
    const named = { read: 'memory-reader', list: 'memory-lister' };
    const args = { path: 'memory:punchclock/build-and-styling-gotchas', offset: 1, limit: 2000, grep_context: 3 };
    const r = await readFileTool(state, fence, named).execute(args, ctx());
    expect(r.isError).toBe(true);
    expect(r.text).toContain('Memory not found through read_file: memory:punchclock/build-and-styling-gotchas.');
    expect(r.text).toContain("memory-reader (memory_file_name: 'punchclock/build-and-styling-gotchas')");
    expect(r.text).toContain('memory-lister');
    // The refusal it replaced said only this, about a namespace that has no parent to speak of.
    expect(r.text).not.toContain('Its parent directory does not exist either.');
    // With no tools handed in the shape of the mistake is still corrected; only the way out goes unnamed.
    const bare = await readFileTool(state, fence).execute(args, ctx());
    expect(bare.text).toContain("'memory:' is not a path on disk");
    expect(bare.text).not.toContain('memory-reader');
    expect(bare.text).not.toContain('Its parent directory does not exist either.');
  });
  it('the 30,000-character cap carries a continuation hint', async () => {
    writeFileSync(join(root, 'big.txt'), Array.from({ length: 3000 }, (_, i) => `line ${i + 1} ${'x'.repeat(20)}`).join('\n'));
    const r = await readFileTool(state, fence).execute({ path: 'big.txt', offset: 1, limit: 5000, grep_context: 3 }, ctx());
    expect(r.text.length).toBeLessThan(30_300);
    expect(r.text).toMatch(/\(Output capped at ~30000 chars\. \d+ more lines\. Use offset=\d+ to continue\.\)$/);
  });
});

describe('write_file (REQ-TOOLS-132/133/135/136) and the diff row (REQ-CHAT-050)', () => {
  it('create refuses an existing file; edit needs a prior read; edits match at four levels; multiple occurrences are reported; undo pops', async () => {
    const w = writeFileTool(state, fence);
    const r = readFileTool(state, fence);
    // REQ-TOOLS-135's text exactly. It says nothing about who read or wrote the file, because the read record is
    // the workspace's, shared by every agent (REQ-TOOLS-133), and cannot answer for the caller.
    const clash = await w.execute({ operation: 'create', path: 'src/a.ts', content: 'x', replace_all: false }, ctx());
    expect(clash.isError).toBe(true);
    expect(clash.text).toBe("File already exists: src/a.ts. Use 'overwrite' or 'edit'.");
    const gated = await w.execute({ operation: 'edit', path: 'src/a.ts', old_string: 'const a = 1;', new_string: 'const a = 10;', replace_all: false }, ctx());
    expect(gated.text).toBe('You must read src/a.ts before editing it. Call read_file(path="src/a.ts") first, then retry your edit.');
    await r.execute({ path: 'src/a.ts', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    const e1 = await w.execute({ operation: 'edit', path: 'src/a.ts', old_string: 'const a = 1;', new_string: 'const a = 10;', replace_all: false }, ctx());
    expect(e1.isError).toBe(false);
    expect(e1.text).toMatch(/^Edited src\/a\.ts: 1 line replaced by 1 at line 1 \(\+1 -1\)\. \(sha256 [0-9a-f]{64}\)$/);
    expect(e1.diff).toBe('src/a.ts +1 -1\n[1]- const a = 1;\n[1]+ const a = 10;');
    expect(readFileSync(join(root, 'src/a.ts'), 'utf8')).toContain('const a = 10;');
    // level 2: trailing whitespace; level 3: indentation shift; level 4: fuzzy
    const e2 = await w.execute({ operation: 'edit', path: 'src/a.ts', old_string: 'const b = 2;   ', new_string: 'const b = 20;', replace_all: false }, ctx());
    expect(e2.text).toContain('Match level: 2.');
    const e3 = await w.execute({ operation: 'edit', path: 'src/a.ts', old_string: '  export { a, b };', new_string: 'export { a, b, c };', replace_all: false }, ctx());
    expect(e3.text).toContain('Match level: 3.');
    const e4 = await w.execute({ operation: 'edit', path: 'src/a.ts', old_string: 'export { a, b, d };', new_string: 'export { a };', replace_all: false }, ctx());
    expect(e4.text).toMatch(/Match level: 4 \(similarity: 0\.\d\d\)\. Verify the result\./);
    expect(await w.execute({ operation: 'edit', path: 'src/a.ts', old_string: 'nothing here at all', new_string: 'x', replace_all: false }, ctx())).toMatchObject({ isError: true });
    expect(await w.execute({ operation: 'edit', path: 'src/a.ts', old_string: 'x', new_string: 'x', replace_all: false }, ctx())).toMatchObject({ isError: true });
    writeFileSync(join(root, 'dup.txt'), 'a\nb\na\n');
    await r.execute({ path: 'dup.txt', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    const dup = await w.execute({ operation: 'edit', path: 'dup.txt', old_string: 'a', new_string: 'c', replace_all: false }, ctx());
    expect(dup.text).toMatch(/^Found 2 occurrences of old_str at lines 1, 3\./);
    const all = await w.execute({ operation: 'edit', path: 'dup.txt', old_string: 'a', new_string: 'c', replace_all: true }, ctx());
    expect(all.text).toContain('2 occurrences replaced, 2 lines replaced by 2 (+2 -2)');
    expect(readFileSync(join(root, 'dup.txt'), 'utf8')).toBe('c\nb\nc\n');
    const undo = await w.execute({ operation: 'undo', path: 'dup.txt', replace_all: false }, ctx());
    expect(undo.isError).toBe(false);
    expect(readFileSync(join(root, 'dup.txt'), 'utf8')).toBe('a\nb\na\n');
    await w.execute({ operation: 'undo', path: 'dup.txt', replace_all: false }, ctx());
    expect(await w.execute({ operation: 'undo', path: 'dup.txt', replace_all: false }, ctx())).toMatchObject({ isError: true, text: 'No edit history for dup.txt.' });
  });
  it('create, insert, overwrite; an escape is refused; the diff row is capped at 50 changed lines', async () => {
    const w = writeFileTool(state, fence);
    const c = await w.execute({ operation: 'create', path: 'new/n.txt', content: 'one\ntwo', replace_all: false }, ctx());
    expect(c.text).toMatch(/^Created new\/n\.txt: 2 lines created\./);
    expect(c.diff).toBe('new/n.txt [Created] +2 -0\n[1]+ one\n[2]+ two');
    expect(await w.execute({ operation: 'insert', path: 'new/n.txt', content: 'zero', insert_line: 0, replace_all: false }, ctx())).toMatchObject({ isError: false });
    expect(readFileSync(join(root, 'new/n.txt'), 'utf8')).toBe('zero\none\ntwo');
    expect(await w.execute({ operation: 'insert', path: 'new/n.txt', content: 'x', insert_line: 9, replace_all: false }, ctx())).toMatchObject({ isError: true });
    expect(await w.execute({ operation: 'overwrite', path: 'new/n.txt', content: 'only', replace_all: false }, ctx())).toMatchObject({ isError: false });
    expect(await w.execute({ operation: 'create', path: '../escape.txt', content: 'x', replace_all: false }, ctx())).toMatchObject({ isError: true });
    const big = renderDiff('f', null, Array.from({ length: 80 }, (_, i) => `l${i}`).join('\n'));
    expect(big.split('\n')).toHaveLength(52);
    expect(big.split('\n').at(-1)).toBe('… +30 more lines, diff truncated');
  });
  it('REQ-CHAT-050: an edit to a file past 2000 lines draws the lines it changed, and its row agrees with its message', async () => {
    // docs/defects/fixed/an-edit-diff-row-of-a-file-past-2000-lines-counts-every-line-as-added-and-removed.md: the row's
    // LCS spanned the whole file and, past its bound, drew `+2001 -2001` and the file's first 50 lines for a one-line edit.
    const w = writeFileTool(state, fence);
    const r = readFileTool(state, fence);
    writeFileSync(join(root, 'long.txt'), `${Array.from({ length: 2001 }, (_, i) => `line ${i + 1}`).join('\n')}\n`);
    await r.execute({ path: 'long.txt', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    const e = await w.execute({ operation: 'edit', path: 'long.txt', old_string: 'line 1500\n', new_string: 'line fifteen hundred\n', replace_all: false }, ctx());
    expect(e.isError).toBe(false);
    expect(e.text).toContain('(+1 -1)');
    expect(e.diff).toBe('long.txt +1 -1\n[1500]- line 1500\n[1500]+ line fifteen hundred');
    // Two lines added near the end of a 3,000-line file and one removed near its start: each numbered in its own file.
    const before = Array.from({ length: 3000 }, (_, i) => `row ${i + 1}`);
    const after = [...before.slice(0, 9), ...before.slice(10, 2990), 'new a', 'new b', ...before.slice(2990)];
    expect(renderDiff('wide.txt', `${before.join('\n')}\n`, `${after.join('\n')}\n`)).toBe('wide.txt +2 -1\n[10]- row 10\n[2990]+ new a\n[2991]+ new b');
  });
  it('REQ-CHAT-050: past the table\'s bound the row still counts a least change, and its lines are the ones that changed', () => {
    // Regions of 2,100 to 2,400 lines a side (past the 4,000,000-cell table), changed in a few hundred places over a small
    // alphabet so many alignments tie: the counts equal the LCS's (computed here in rolling rows), and taking the drawn
    // `-` lines out of the before and the `+` lines out of the after leaves the same lines.
    let seed = 7;
    const rand = (k: number): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % k; };
    for (let round = 0; round < 3; round += 1) {
      const before = Array.from({ length: 2100 + rand(300) }, () => `t${rand(6)}`);
      const after = [...before];
      for (let e = 0; e < 150; e += 1) {
        const at = rand(after.length);
        if (rand(2) === 0) after.splice(at, 1); else after.splice(at, 0, `t${rand(6)}`);
      }
      let prev = new Uint32Array(after.length + 1);
      for (let i = before.length - 1; i >= 0; i -= 1) {
        const row = new Uint32Array(after.length + 1);
        for (let j = after.length - 1; j >= 0; j -= 1) row[j] = before[i] === after[j] ? prev[j + 1]! + 1 : Math.max(prev[j]!, row[j + 1]!);
        prev = row;
      }
      const lcs = prev[0]!;
      const text = renderDiff('r', `x\n${before.join('\n')}\ny`, `x\n${after.join('\n')}\ny`);
      const [header] = text.split('\n');
      expect(header).toBe(`r +${after.length - lcs} -${before.length - lcs}`);
      const changes = lineChangesOf(`x\n${before.join('\n')}\ny`, `x\n${after.join('\n')}\ny`);
      const removed = new Set(changes.filter((c) => c.sign === '-').map((c) => c.line));
      const added = new Set(changes.filter((c) => c.sign === '+').map((c) => c.line));
      const kept = (lines: string[], gone: Set<number>) => lines.filter((_, i) => !gone.has(i + 1));
      expect(kept(['x', ...after, 'y'], added)).toEqual(kept(['x', ...before, 'y'], removed));
    }
  });
  it('REQ-TOOLS-135: write_file\'s description names its required `operation` field, each value, and the fields each reads', () => {
    // Live run 2026-09-29 (WF1): two children's first write_file omitted `operation` and regenerated their whole file
    // after the refusal. The prose the model reads first said "Create, edit … or undo" without naming the field.
    const d = writeFileTool(state, fence).description;
    expect(d).toContain('`operation`');
    expect(d).toContain('create {path, content}');
    expect(d).toContain('edit {path, old_string, new_string, replace_all?}');
    expect(d).toContain('overwrite {path, content}');
    expect(d).toContain('insert {path, content, insert_line}');
    expect(d).toContain('undo {path}');
    expect(d).toMatch(/Example: \{"operation": "create", "path": "[^"]+", "content": "[^"]*"\}/);
  });
  it('REQ-TOOLS-188: matchEdit is deterministic — the lower line wins a fuzzy tie', () => {
    const m = matchEdit(['abcdefghij', 'x', 'abcdefghik'], 'abcdefghiz');
    expect(m).toMatchObject({ level: 4, starts: [0] });
  });
});

describe('line counts: a trailing newline ends the last line, it does not start another (REQ-TOOLS-134, REQ-TOOLS-135, REQ-CHAT-050)', () => {
  // Live run 2026-09-29 (L6): `probe-ok\n` was reported "2 line(s) created", its diff showed an empty line 2, and
  // read_file said total_lines: 2 — the model spent a terminal call on `wc` to check.
  // docs/defects/fixed/a-trailing-newline-counts-as-a-line.md.
  it('create, read, overwrite, undo and the diff count a newline-terminated file by its lines', async () => {
    const w = writeFileTool(state, fence);
    const c = await w.execute({ operation: 'create', path: 'probe.txt', content: 'probe-ok\n', replace_all: false }, ctx());
    expect(c.text).toMatch(/^Created probe\.txt: 1 line/);
    expect(c.diff).toBe('probe.txt [Created] +1 -0\n[1]+ probe-ok');
    const r = await readFileTool(state, fence).execute({ path: 'probe.txt', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    expect(r.text).toBe('[path: probe.txt | total_lines: 1 | shown: lines 1-1 | truncated: false]\n1: probe-ok');
    const blank = await readFileTool(state, fence).execute({ path: 'probe.txt', offset: 1, limit: 2000, grep: '^$', grep_context: 0 }, ctx());
    expect(blank.text).toMatch(/^No matches for pattern/);
    const o = await w.execute({ operation: 'overwrite', path: 'probe.txt', content: 'a\nb\n', replace_all: false }, ctx());
    expect(o.text).toMatch(/^Overwrote probe\.txt: 2 line\S* replaced 1\./);
    const u = await w.execute({ operation: 'undo', path: 'probe.txt', replace_all: false }, ctx());
    expect(u.text).toMatch(/\(1 line/);
    // an unterminated last line is still a line, and an empty file has none
    expect((await w.execute({ operation: 'create', path: 'bare.txt', content: 'one\ntwo', replace_all: false }, ctx())).text).toMatch(/: 2 line\S* created/);
    writeFileSync(join(root, 'empty.txt'), '');
    const e = await readFileTool(state, fence).execute({ path: 'empty.txt', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    expect(e.text.split('\n')[0]).toBe('[path: empty.txt | total_lines: 0 | shown: lines 0-0 | truncated: false]');
  });
  it('insert places lines between lines: no phantom line after the last, and a terminated insert adds no blank line', async () => {
    const w = writeFileTool(state, fence);
    writeFileSync(join(root, 'ins.txt'), 'a\nb\n');
    await readFileTool(state, fence).execute({ path: 'ins.txt', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    const mid = await w.execute({ operation: 'insert', path: 'ins.txt', content: 'X\n', insert_line: 1, replace_all: false }, ctx());
    expect(mid.text).toMatch(/^Inserted 1 line/);
    expect(readFileSync(join(root, 'ins.txt'), 'utf8')).toBe('a\nX\nb\n');
    const end = await w.execute({ operation: 'insert', path: 'ins.txt', content: 'Z', insert_line: 3, replace_all: false }, ctx());
    expect(end.isError).toBe(false);
    expect(readFileSync(join(root, 'ins.txt'), 'utf8')).toBe('a\nX\nb\nZ\n');
    expect(await w.execute({ operation: 'insert', path: 'ins.txt', content: 'Q', insert_line: 5, replace_all: false }, ctx())).toMatchObject({ isError: true, text: expect.stringContaining('(4 lines)') });
    // a file with no trailing newline keeps none
    writeFileSync(join(root, 'bare.txt'), 'a\nb');
    await readFileTool(state, fence).execute({ path: 'bare.txt', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    await w.execute({ operation: 'insert', path: 'bare.txt', content: 'c', insert_line: 2, replace_all: false }, ctx());
    expect(readFileSync(join(root, 'bare.txt'), 'utf8')).toBe('a\nb\nc');
  });
  it('an edit that finds nothing names the file\'s true line count', async () => {
    const w = writeFileTool(state, fence);
    await readFileTool(state, fence).execute({ path: 'src/a.ts', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    const miss = await w.execute({ operation: 'edit', path: 'src/a.ts', old_string: 'nothing here at all', new_string: 'x', replace_all: false }, ctx());
    expect(miss.text).toContain('the file has 3 lines');
  });
});

describe('haet_read / haet_edit (REQ-TOOLS-137/189)', () => {
  it('the read carries content_hash; an edit with a stale hash is refused without quoting content; a matching hash satisfies read-before-write; level 1 only', async () => {
    const hr = haetReadTool(state, fence);
    const he = haetEditTool(state, fence);
    const r = await hr.execute({ path: 'src/b.ts', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    const hash = /content_hash: ([0-9a-f]{64})/.exec(r.text)![1]!;
    expect(hash).toBe(sha256(readFileSync(join(root, 'src/b.ts'))));
    const stale = await he.execute({ path: 'src/b.ts', content_hash: 'a'.repeat(64), old_string: 'import', new_string: 'IMPORT', replace_all: false }, ctx());
    expect(stale).toMatchObject({ isError: true });
    expect(stale.text).toMatch(/changed since the hash you hold was taken/);
    expect(stale.text).not.toContain('import { a }');
    // The refusal says which of the two situations this is, so the next move is not a guess. It still
    // quotes no content, and it still does NOT hand back the current hash: the hash moved because the
    // content moved, and naming it would buy a round trip at the price of a blind, wrong edit.
    expect(stale.text).toContain('Your old_string is still present in the current content');
    expect(stale.text).not.toMatch(/[0-9a-f]{64}/);
    const goneStale = await he.execute({ path: 'src/b.ts', content_hash: 'a'.repeat(64), old_string: 'text-that-is-not-in-the-file', new_string: 'x', replace_all: false }, ctx());
    expect(goneStale.text).toContain('Your old_string is NO LONGER present in the current content');
    const fresh = new FileToolState();
    const ok = await haetEditTool(fresh, fence).execute({ path: 'src/b.ts', content_hash: hash, old_string: 'import { a }', new_string: 'import { a, b }', replace_all: false }, ctx());
    expect(ok.isError).toBe(false);
    expect(ok.text).toMatch(/content_hash: [0-9a-f]{64}$/);
    const fuzzy = await he.execute({ path: 'src/b.ts', content_hash: sha256(readFileSync(join(root, 'src/b.ts'))), old_string: 'import { a, b }   ', new_string: 'x', replace_all: false }, ctx());
    expect(fuzzy).toMatchObject({ isError: true });
  });
  it('an edit whose old and new strings are identical is refused and changes nothing, as write_file\'s edit is (REQ-TOOLS-135, REQ-TOOLS-189)', async () => {
    // Live run 2026-09-29 (L5): haet_edit applied a no-op edit, pushed an undo entry and reported a line changed;
    // the model noticed "the first one was a no-op which should have errored but didn't".
    const hash = sha256(readFileSync(join(root, 'src/b.ts')));
    const same = await haetEditTool(state, fence).execute({ path: 'src/b.ts', content_hash: hash, old_string: 'import { a }', new_string: 'import { a }', replace_all: false }, ctx());
    expect(same).toMatchObject({ isError: true, text: 'old_string and new_string are identical; nothing to change.' });
    const all = await haetEditTool(state, fence, 'haet').execute({ path: 'src/b.ts', content_hash: hash, old_string: 'a', new_string: 'a', replace_all: true }, ctx());
    expect(all).toMatchObject({ isError: true, text: 'old_string and new_string are identical; nothing to change.' });
    // nothing entered the undo history, so an undo has nothing to pop
    expect(await writeFileTool(state, fence).execute({ operation: 'undo', path: 'src/b.ts', replace_all: false }, ctx())).toMatchObject({ isError: true, text: 'No edit history for src/b.ts.' });
  });
});

describe('grep and glob (REQ-TOOLS-138..141)', () => {
  it('grep returns file:line:content, honours the ignore components and gitignore, skips binaries, refuses a bad regex', async () => {
    writeFileSync(join(root, '.gitignore'), 'ignored/\n*.log\n');
    mkdirSync(join(root, 'ignored'));
    writeFileSync(join(root, 'ignored', 'z.ts'), 'const a = 3;');
    writeFileSync(join(root, 'debug.log'), 'const a = 4;');
    const g = grepTool(fence);
    const r = await g.execute({ pattern: 'const a', max_matches: 100 }, ctx());
    expect(r.text.split('\n').sort()).toEqual(['src/a.ts:1:const a = 1;']);
    expect(await g.execute({ pattern: '(', max_matches: 100 }, ctx())).toMatchObject({ isError: true });
    expect((await g.execute({ pattern: '(', max_matches: 100 }, ctx())).text).toMatch(/^Invalid regex pattern: /);
    expect((await g.execute({ pattern: 'nope', max_matches: 100 }, ctx())).text).toBe('No matches found');
    expect((await g.execute({ pattern: 'const', paths: 'src/a.ts', max_matches: 1 }, ctx())).text.split('\n')).toHaveLength(1);
    // paths outside the workspace are skipped, never served
    writeFileSync(join(outside, 'o.ts'), 'const a = 9;');
    expect((await g.execute({ pattern: 'const a', paths: [outside], max_matches: 100 }, ctx())).text).toBe('No matches found');
  });
  it('a leading inline flag group sets the flag instead of failing to parse (REQ-TOOLS-141: the accelerator dialect)', async () => {
    writeFileSync(join(root, 'src', 'case.ts'), 'const Needle = 1;\nconst other = 2;\n');
    const g = grepTool(fence);
    expect((await g.execute({ pattern: 'needle', max_matches: 100 }, ctx())).text).toBe('No matches found');
    expect((await g.execute({ pattern: '(?i)needle', max_matches: 100 }, ctx())).text).toBe('src/case.ts:1:const Needle = 1;');
    // several groups, several letters, and a scoped modifier the host engine already understands
    expect((await g.execute({ pattern: '(?i)(?m)^const needle', max_matches: 100 }, ctx())).text).toBe('src/case.ts:1:const Needle = 1;');
    expect((await g.execute({ pattern: '(?im)^const needle', max_matches: 100 }, ctx())).text).toBe('src/case.ts:1:const Needle = 1;');
    expect((await g.execute({ pattern: '(?i:needle)', max_matches: 100 }, ctx())).text).toBe('src/case.ts:1:const Needle = 1;');
    // the flag is consumed, not matched as text: `(?i)` alone is every line, not a literal
    expect((await g.execute({ pattern: '(?i)', max_matches: 1 }, ctx())).text).not.toBe('No matches found');
    // a flag with no counterpart is refused rather than dropped, and a misplaced group says where it belongs
    const unsupported = await g.execute({ pattern: '(?x) needle', max_matches: 100 }, ctx());
    expect(unsupported).toMatchObject({ isError: true });
    expect(unsupported.text).toBe("Invalid regex pattern: Inline flag 'x' is not supported. The supported inline flags are i, m, s and u.");
    const misplaced = await g.execute({ pattern: 'const(?i)needle', max_matches: 100 }, ctx());
    expect(misplaced).toMatchObject({ isError: true });
    expect(misplaced.text).toMatch(/^Invalid regex pattern: .*Inline flags are read only at the start of the pattern/);
    // read_file's grep filter is written in the same dialect (REQ-TOOLS-134)
    const rf = readFileTool(state, fence);
    expect((await rf.execute({ path: 'src/case.ts', offset: 1, limit: 2000, grep: '(?i)needle', grep_context: 0 }, ctx())).text).toContain('>1: const Needle = 1;');
    expect((await rf.execute({ path: 'src/case.ts', offset: 1, limit: 2000, grep: 'const(?i)needle', grep_context: 0 }, ctx())).text).toMatch(/Inline flags are read only at the start/);
  });
  it('glob returns sorted workspace-relative POSIX paths; a bad base_path is ignored; absolute patterns are relativised or dropped', async () => {
    const gl = globTool(fence);
    expect((await gl.execute({ pattern: '**/*.ts' }, ctx())).text).toBe('src/a.ts\nsrc/b.ts');
    expect((await gl.execute({ pattern: '*.ts', base_path: 'src' }, ctx())).text).toBe('src/a.ts\nsrc/b.ts');
    expect((await gl.execute({ pattern: '*.md', base_path: '../nope' }, ctx())).text).toBe('README.md');
    expect((await gl.execute({ pattern: '**/*.py' }, ctx())).text).toBe('No files found');
    expect((await gl.execute({ pattern: `${outside.replace(/\\/g, '/')}/*` }, ctx())).text).toBe('No files found');
  });
  it('glob brace alternatives are globs, not literals (REQ-TOOLS-141): what ripgrep accepts is not refused here', async () => {
    /*
     * The shape that found this: `packages/*` + a `{*.json,*.ts}` group. Each alternative used to be escaped as a
     * literal, so its leading star survived into the regex source and the engine refused the whole pattern with
     * `Nothing to repeat` — a message quoting a regex the caller never wrote.
     */
    const gl = globTool(fence);
    expect((await gl.execute({ pattern: '{src,docs}/*.ts' }, ctx())).text).toBe('src/a.ts\nsrc/b.ts');
    expect((await gl.execute({ pattern: '**/{*.ts,*.md}' }, ctx())).text).toBe('README.md\nsrc/a.ts\nsrc/b.ts');
    // The compiler's own cases (nested groups, `/` inside an alternative, an unclosed brace) are `kernel.test.ts`'s.
    expect(globToRegExp('{a,{b,c}}.ts').test('c.ts')).toBe(true);
    /*
     * REQ-TOOLS-138: whatever the caller writes, the answer is an observation. The compiler escapes everything it
     * does not translate, so no pattern should reach the RegExp constructor invalid any more — and the guard at the
     * call site is what makes that a property of the tool rather than of this reading of the compiler.
     */
    for (const pattern of ['packages/*/{*.json,*.js,*.ts,*.cjs,*.mjs}', '[unterminated', '{', '}', '{,}', '**/{a,{b,}}', '*{']) {
      const r = await gl.execute({ pattern }, ctx());
      expect(r.text).not.toContain('Invalid regular expression');
      expect(r.isError ?? false).toBe(false);
    }
  });

  it('the gitignore reader: anchors, directories, negation, whole labels', () => {
    const rules = parseGitignore('/build\nlogs/\n*.tmp\n!keep.tmp\nsrc/**/gen\n');
    expect(ignoredBy(rules, 'build', true)).toBe(true);
    expect(ignoredBy(rules, 'x/build', true)).toBe(false);
    expect(ignoredBy(rules, 'logs', true)).toBe(true);
    expect(ignoredBy(rules, 'logs', false)).toBe(false);
    expect(ignoredBy(rules, 'a/b.tmp', false)).toBe(true);
    expect(ignoredBy(rules, 'a/keep.tmp', false)).toBe(false);
    expect(ignoredBy(rules, 'src/x/y/gen', true)).toBe(true);
  });
});

describe('todo (REQ-TOOLS-144..147)', () => {
  it('REQ-TOOLS-032: schema refusals name the expected shape — write_file, haet_edit, ask_questions', async () => {
    const w = writeFileTool(state, fence);
    // The run's first use omitted `operation`; the hook names the selector and shows one example.
    const noOp = w.validationError!({}, 'Required');
    expect(noOp.isError).toBe(true);
    expect(noOp.text).toMatch(/write_file requires an operation: one of create, edit, overwrite, insert, undo/);
    expect(noOp.text).toMatch(/\{"operation": "edit", "path": "notes\.txt"/);
    const badOp = w.validationError!({ operation: 'fix' }, 'operation: invalid option');
    expect(badOp.text).toMatch(/do not match the write_file schema/);
    expect(badOp.text).toMatch(/The operations are create, edit, overwrite, insert, undo/);
    const he = haetEditTool(state, fence);
    const noPath = he.validationError!({ content_hash: 'a'.repeat(64), old_string: 'a', new_string: 'b' }, 'Required');
    expect(noPath.isError).toBe(true);
    expect(noPath.text).toMatch(/haet_edit requires a path/);
    expect(noPath.text).toMatch(/content_hash.*64 hex chars from haet_read/);
  });
  it('operations, ids, the single IN_PROGRESS invariant, replace protection, hints, no-op update', async () => {
    const list = new TodoList();
    const t = todoTool(list);
    // REQ-TOOLS-144's five are the schema's now, so a wrong operation is refused BEFORE `execute` — which is
    // where the mandated words have to be, or the gate answers with its generic schema message instead.
    expect(t.schema.safeParse({ operation: 'bogus' }).success).toBe(false);
    expect(t.validationError!({ operation: 'bogus' }, 'operation: invalid option').text).toMatch(/^Unsupported operation: bogus\./);
    expect(t.validationError!({ operation: 'bogus' }, 'operation: invalid option').isError).toBe(true);
    const p = await t.execute({ operation: 'add_phase', name: 'main' }, ctx());
    const phaseId = /\(([0-9a-f]{8})\)/.exec(p.text)![1]!;
    expect(p.text).toContain('Todo state:');
    const a = await t.execute({ operation: 'add_task', phase_id: phaseId, title: 'first', state: 'IN_PROGRESS' }, ctx());
    const t1 = /\(([0-9a-f]{8})\)/.exec(a.text)![1]!;
    const b = await t.execute({ operation: 'add_task', phase_id: phaseId, name: 'second' }, ctx());
    const t2 = /\(([0-9a-f]{8})\)/.exec(b.text)![1]!;
    const clash = await t.execute({ operation: 'update', task_id: t2, state: 'IN_PROGRESS' }, ctx());
    expect(clash.text).toBe(`Only one task can be IN_PROGRESS at a time. Active task: ${t1} (first). Mark it COMPLETED or ABANDONED before moving another task to IN_PROGRESS.`);
    expect((await t.execute({ operation: 'update', task_id: t2 }, ctx())).text).toMatch(/^Todo update made no changes/);
    expect((await t.execute({ operation: 'update', task_id: 'zzzzzzzz', state: 'COMPLETED' }, ctx())).text).toMatch(/Unknown task id 'zzzzzzzz'\. Available phases: main/);
    expect((await t.execute({ operation: 'add_task', phase_id: 'nope', name: 'x' }, ctx())).text).toMatch(/Unknown phase id/);
    // replace: the active task is restored by id with its state, a protected task omitted is kept in position, a second IN_PROGRESS is refused
    const bad = await t.execute({ operation: 'replace', phases: [{ name: 'main', tasks: [{ id: t2, name: 'second', state: 'IN_PROGRESS' }] }] }, ctx());
    expect(bad.isError).toBe(true);
    const rep = await t.execute({ operation: 'replace', phases: [{ name: 'main', tasks: [{ id: t1, name: 'renamed', state: 'PENDING' }, { name: 'third' }] }] }, ctx());
    expect(rep.isError).toBe(false);
    expect(list.findTask(t1)?.task).toMatchObject({ name: 'first', state: 'IN_PROGRESS' });
    expect(list.phases[0]!.tasks.map((x) => x.name)).toEqual(['first', 'third']);
    expect((await t.execute({ operation: 'update', task_id: t1, state: 'COMPLETED' }, ctx())).isError).toBe(false);
    const rep2 = await t.execute({ operation: 'replace', phases: [{ name: 'only', tasks: [{ name: 'fresh' }] }] }, ctx());
    expect(rep2.isError).toBe(false);
    expect(list.phases[0]!.tasks.map((x) => `${x.name}:${x.state}`)).toEqual(['first:COMPLETED', 'fresh:PENDING']);
    expect((await t.execute({ operation: 'remove_task', task_id: t1 }, ctx())).text).toMatch(/^Removed task first/);
    expect(list.render()).toContain('[PENDING] fresh');
  });

  /*
   * PD-TOOLS-008 (OQ-163): the default live run's `frictions` orchestrator opened with a `replace` marking two tasks
   * IN_PROGRESS over an empty list, was told "Active task: 3c55ec35 (Create friction-probe.txt)" — an id the rejected list
   * minted and never stored — and its `update 3c55ec35` was refused "Unknown task id" (live-run finding a71-7,
   * docs/defects/fixed/a-rejected-todo-replace-names-an-active-task-it-never-stored.md).
   */
  it('a replace whose own list marks two tasks IN_PROGRESS while none is active is refused, saying so and that nothing was saved (PD-TOOLS-008)', async () => {
    const list = new TodoList();
    const t = todoTool(list);
    const r = await t.execute({ operation: 'replace', phases: [{ name: 'Friction probe', tasks: [{ name: 'Create friction-probe.txt', state: 'IN_PROGRESS' }, { name: 'Run and SIGINT the node timer', state: 'IN_PROGRESS' }, { name: 'Report', state: 'PENDING' }] }] }, ctx());
    expect(r.isError).toBe(true);
    expect(r.text).toBe("Only one task can be IN_PROGRESS at a time. The submitted list marks 2 tasks IN_PROGRESS ('Create friction-probe.txt', 'Run and SIGINT the node timer'), so the replace was rejected and nothing was saved. Send it again with at most one task IN_PROGRESS.");
    expect(r.text).not.toMatch(/Active task|[0-9a-f]{8}/);
    expect(list.phases).toEqual([]);
    // With a task active, REQ-TOOLS-146's case still answers in REQ-TOOLS-145's own sentence, naming the stored task.
    const p = await t.execute({ operation: 'add_phase', name: 'main' }, ctx());
    const phaseId = /\(([0-9a-f]{8})\)/.exec(p.text)![1]!;
    const a = await t.execute({ operation: 'add_task', phase_id: phaseId, name: 'active one', state: 'IN_PROGRESS' }, ctx());
    const active = /\(([0-9a-f]{8})\)/.exec(a.text)![1]!;
    const other = await t.execute({ operation: 'replace', phases: [{ name: 'main', tasks: [{ name: 'x', state: 'IN_PROGRESS' }, { name: 'y', state: 'IN_PROGRESS' }] }] }, ctx());
    expect(other.text).toBe(`Only one task can be IN_PROGRESS at a time. Active task: ${active} (active one). Mark it COMPLETED or ABANDONED before moving another task to IN_PROGRESS.`);
    // And the list it refused can be sent again with one task in progress.
    expect((await t.execute({ operation: 'update', task_id: active, state: 'COMPLETED' }, ctx())).isError).toBe(false);
    const again = await t.execute({ operation: 'replace', phases: [{ name: 'Friction probe', tasks: [{ name: 'Create friction-probe.txt', state: 'IN_PROGRESS' }, { name: 'Run and SIGINT the node timer', state: 'PENDING' }] }] }, ctx());
    expect(again.isError).toBe(false);
  });

  /**
   * Observed live 2026-09-16 (run `a26918e8`): a run sent five phases to `add_phase` — a call the advertised
   * schema accepts, since `phases` is one of its fields — and read back the six words `add_phase requires a
   * name.` It retried with `name` AND `phases` together, which adds one empty phase and drops the rest.
   * REQ-TOOLS-147 mandates a hint for a missing id and says nothing about a missing name; that silence is what
   * the string filled.
   */
  it('a batch sent to add_phase is refused by naming the operation that takes one (REQ-TOOLS-013/147)', async () => {
    const list = new TodoList();
    const t = todoTool(list);
    const r = await t.execute({ operation: 'add_phase', phases: [{ name: 'Discovery', tasks: [] }, { name: 'Build', tasks: [] }] }, ctx());
    expect(r.isError).toBe(true);
    expect(r.text).toContain('add_phase requires a name.');
    expect(r.text).toContain('2 phases sent here were not added');
    expect(r.text).toContain('call replace with the whole `phases` array');
    expect(list.phases).toEqual([]);

    // The same fault in `add_task`, which had no hint at all where its siblings all have one.
    const withPhase = await t.execute({ operation: 'add_phase', name: 'main' }, ctx());
    const phaseId = /\(([0-9a-f]{8})\)/.exec(withPhase.text)![1]!;
    const task = await t.execute({ operation: 'add_task', phase_id: phaseId, phases: [{ name: 'Build', tasks: [] }] }, ctx());
    expect(task.text).toContain('add_task requires a task name (or title).');
    expect(task.text).toContain('call replace with the whole `phases` array');
    expect(task.text).toContain('Available phases: main');

    // A plain miss keeps its hint and says nothing about a batch nobody sent.
    const bare = await t.execute({ operation: 'add_phase' }, ctx());
    expect(bare.text).toContain('Available phases: main');
    expect(bare.text).not.toContain('replace');
  });

  it('the description names the fields each operation reads, which is the only per-operation guidance there is', () => {
    const d = todoTool(new TodoList()).description;
    expect(d).toContain('replace {phases: [{name, tasks: [{name, description, state}]}]}');
    expect(d).toContain('the only operation that takes a batch');
    expect(d).toContain('add_phase {name}');
    expect(d).toContain('it does not read `phases`');
    expect(d).toContain('add_task {phase_id, name, description, state}');
    expect(d).toContain('update {task_id, name, description, state}');
    expect(d).toContain('remove_task {task_id}');
  });
});

/**
 * Live-run finding G6 (default run at 27a5127): a 4-line `old_string` replaced by 9 lines was reported "4 lines changed
 * at line 38" while the row's diff read `+5 -0`, and the model re-read the file to find out which was true
 * (docs/defects/fixed/an-edit-reports-the-old-strings-line-count-as-the-lines-it-changed.md). REQ-TOOLS-135's success message
 * reports what the edit did: the lines it replaced, what replaced them, and the lines added and removed.
 */
describe('REQ-TOOLS-135: an edit reports the lines it replaced and the lines it added and removed (write_file, haet_edit)', () => {
  // The run's shape: a 4-line block at line 38 (here line 3), extended with a 5-line function after it.
  const BEFORE = ['// head', '', 'export function remaining(todos) {', '  return todos.filter((todo) => !todo.done).length;', '}', '', '// tail', ''].join('\n');
  const OLD = 'export function remaining(todos) {\n  return todos.filter((todo) => !todo.done).length;\n}\n';
  const GROWN = `${OLD}\n/** REQ-103: drop every done todo. */\nexport function clearCompleted(todos) {\n  return todos.filter((todo) => !todo.done);\n}\n`;
  const SHRUNK = 'export const remaining = (todos) => todos.filter((t) => !t.done).length;\n';
  const SAME = 'export function remaining(list) {\n  return list.filter((todo) => !todo.done).length;\n}\n';
  const CASES = [
    ['grows', GROWN, 'Edited src/todos.js: 3 lines replaced by 8 at line 3 (+5 -0).'],
    ['shrinks', SHRUNK, 'Edited src/todos.js: 3 lines replaced by 1 at line 3 (+1 -3).'],
    ['keeps its line count', SAME, 'Edited src/todos.js: 3 lines replaced by 3 at line 3 (+2 -2).'],
  ] as const;

  for (const [shape, next, message] of CASES) {
    it(`write_file edit: a replacement that ${shape}`, async () => {
      writeFileSync(join(root, 'src/todos.js'), BEFORE);
      await readFileTool(state, fence).execute({ path: 'src/todos.js', offset: 1, limit: 2000, grep_context: 3 }, ctx());
      const r = await writeFileTool(state, fence).execute({ operation: 'edit', path: 'src/todos.js', old_string: OLD, new_string: next, replace_all: false }, ctx());
      expect(r.isError).toBe(false);
      expect(r.text.replace(/ \(sha256 [0-9a-f]{64}\)$/, '')).toBe(message);
      // The counts are the row's own: the diff header says the same `+A -R`.
      expect(r.diff!.split('\n')[0]).toBe(`src/todos.js ${/\((\+\d+ -\d+)\)/.exec(message)![1]}`);
    });

    it(`haet_edit: a replacement that ${shape}`, async () => {
      writeFileSync(join(root, 'src/todos.js'), BEFORE);
      const r = await haetEditTool(state, fence).execute({ path: 'src/todos.js', content_hash: sha256(Buffer.from(BEFORE)), old_string: OLD, new_string: next, replace_all: false }, ctx());
      expect(r.isError).toBe(false);
      expect(r.text.replace(/ content_hash: [0-9a-f]{64}$/, '')).toBe(message);
      expect(r.diff!.split('\n')[0]).toBe(`src/todos.js ${/\((\+\d+ -\d+)\)/.exec(message)![1]}`);
    });
  }

  it('an edit inside one line replaces that line by one, whatever the strings\' own line counts', async () => {
    writeFileSync(join(root, 'src/todos.js'), BEFORE);
    await readFileTool(state, fence).execute({ path: 'src/todos.js', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    const r = await writeFileTool(state, fence).execute({ operation: 'edit', path: 'src/todos.js', old_string: '.length', new_string: '', replace_all: false }, ctx());
    expect(r.text.replace(/ \(sha256 [0-9a-f]{64}\)$/, '')).toBe('Edited src/todos.js: 1 line replaced by 1 at line 4 (+1 -1).');
  });

  /*
   * A replacement whose old string ends in a newline its new string does not (or the reverse) moves a line boundary: the
   * line after the match merges into the replacement, or the replacement splits its own line. The region the message counts
   * is the lines the edit touched in the file, not the old string's lines alone, so its counts are the row's header
   * (the verifier's probe of fin18: 'a\nb\nc\n' with 'b\n' -> 'x' read "1 line removed (+0 -1)" beside `+1 -2`).
   */
  const BOUNDARY = [
    ['the old string ends in a newline the new one does not', 'b\n', 'x', 'a\nxc\n', 'Edited src/f.txt: 2 lines replaced by 1 at line 2 (+1 -2).'],
    ['the new string ends in a newline the old one does not', 'b', 'x\n', 'a\nx\n\nc\n', 'Edited src/f.txt: 1 line replaced by 2 at line 2 (+2 -1).'],
    ['a mid-line old string ending in a newline is replaced by text without one', '= 1;\n', '= 10; ', 'const a = 10; const b = 2;\n', 'Edited src/f.txt: 2 lines replaced by 1 at line 1 (+1 -2).'],
  ] as const;
  for (const [shape, oldString, newString, result, message] of BOUNDARY) {
    const start = shape.startsWith('a mid-line') ? 'const a = 1;\nconst b = 2;\n' : 'a\nb\nc\n';
    it(`write_file edit: ${shape}`, async () => {
      writeFileSync(join(root, 'src/f.txt'), start);
      await readFileTool(state, fence).execute({ path: 'src/f.txt', offset: 1, limit: 2000, grep_context: 3 }, ctx());
      const r = await writeFileTool(state, fence).execute({ operation: 'edit', path: 'src/f.txt', old_string: oldString, new_string: newString, replace_all: false }, ctx());
      expect(r.isError).toBe(false);
      expect(readFileSync(join(root, 'src/f.txt'), 'utf8')).toBe(result);
      expect(r.text.replace(/ \(sha256 [0-9a-f]{64}\)$/, '')).toBe(message);
      expect(r.diff!.split('\n')[0]).toBe(`src/f.txt ${/\((\+\d+ -\d+)\)/.exec(message)![1]}`);
    });

    it(`haet_edit: ${shape}`, async () => {
      writeFileSync(join(root, 'src/f.txt'), start);
      const r = await haetEditTool(state, fence).execute({ path: 'src/f.txt', content_hash: sha256(Buffer.from(start)), old_string: oldString, new_string: newString, replace_all: false }, ctx());
      expect(r.isError).toBe(false);
      expect(readFileSync(join(root, 'src/f.txt'), 'utf8')).toBe(result);
      expect(r.text.replace(/ content_hash: [0-9a-f]{64}$/, '')).toBe(message);
      expect(r.diff!.split('\n')[0]).toBe(`src/f.txt ${/\((\+\d+ -\d+)\)/.exec(message)![1]}`);
    });
  }

  it('over 300 seeded random single replacements, the message\'s counts are always the diff header\'s', async () => {
    let seed = 0x5eed;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const piece = () => ['a', 'b', 'cc', '', '\n', '\n', 'd\n'][rand(7)] as string;
    let checked = 0;
    for (let i = 0; checked < 300 && i < 5000; i += 1) {
      const text = Array.from({ length: 2 + rand(10) }, piece).join('');
      if (text.length < 2) continue;
      const from = rand(text.length);
      const oldString = text.slice(from, from + 1 + rand(Math.min(6, text.length - from)));
      if (text.split(oldString).length !== 2) continue; // exactly one occurrence
      const newString = Array.from({ length: rand(4) }, piece).join('');
      if (newString === oldString) continue;
      writeFileSync(join(root, 'src/f.txt'), text);
      const r = await haetEditTool(state, fence).execute({ path: 'src/f.txt', content_hash: sha256(Buffer.from(text)), old_string: oldString, new_string: newString, replace_all: false }, ctx());
      expect(r.isError, JSON.stringify({ text, oldString, newString })).toBe(false);
      const counts = /\((\+\d+ -\d+)\)\. content_hash/.exec(r.text)?.[1];
      expect(`src/f.txt ${counts}`, JSON.stringify({ text, oldString, newString, message: r.text })).toBe(r.diff!.split('\n')[0]);
      checked += 1;
    }
    expect(checked).toBe(300);
  });

  /*
   * A replace-all reports lines too (the fin18 verifier's finding,
   * docs/defects/fixed/a-replace-all-edit-reports-occurrences-and-no-lines-changed.md): until fin21 its message was
   * "<n> occurrences replaced." and named no line.
   */
  const REPLACE_ALL = [
    ['two occurrences on one line and one on another', 'let a = a + 1;\nkeep\nreturn a;\n', 'a', 'total', 'Edited src/f.txt: 3 occurrences replaced, 2 lines replaced by 2 (+2 -2).'],
    ['a block that grows, in two places', 'x\nold\ny\nold\nz\n', 'old\n', 'new\nmore\n', 'Edited src/f.txt: 2 occurrences replaced, 4 lines replaced by 6 (+4 -2).'],
    ['an old string ending in a newline the new one lacks', 'a\nb\nc\nb\nd\n', 'b\n', 'x', 'Edited src/f.txt: 2 occurrences replaced, 4 lines replaced by 2 (+2 -4).'],
    ['occurrences on adjacent lines', 'q\nq\nq\n', 'q', 'r', 'Edited src/f.txt: 3 occurrences replaced, 3 lines replaced by 3 (+3 -3).'],
    ['an occurrence at the very start, opening with a newline', '\nx\n\ny\n', '\n', '\n\n', 'Edited src/f.txt: 4 occurrences replaced, 4 lines replaced by 8 (+4 -0).'],
  ] as const;
  for (const [shape, start, oldString, newString, message] of REPLACE_ALL) {
    it(`write_file replace_all: ${shape}`, async () => {
      writeFileSync(join(root, 'src/f.txt'), start);
      await readFileTool(state, fence).execute({ path: 'src/f.txt', offset: 1, limit: 2000, grep_context: 3 }, ctx());
      const r = await writeFileTool(state, fence).execute({ operation: 'edit', path: 'src/f.txt', old_string: oldString, new_string: newString, replace_all: true }, ctx());
      expect(r.isError).toBe(false);
      expect(readFileSync(join(root, 'src/f.txt'), 'utf8')).toBe(start.split(oldString).join(newString));
      expect(r.text.replace(/ \(sha256 [0-9a-f]{64}\)$/, '')).toBe(message);
      expect(r.diff!.split('\n')[0]).toBe(`src/f.txt ${/\((\+\d+ -\d+)\)/.exec(message)![1]}`);
    });

    it(`haet_edit replace_all: ${shape}`, async () => {
      writeFileSync(join(root, 'src/f.txt'), start);
      const r = await haetEditTool(state, fence).execute({ path: 'src/f.txt', content_hash: sha256(Buffer.from(start)), old_string: oldString, new_string: newString, replace_all: true }, ctx());
      expect(r.isError).toBe(false);
      expect(r.text.replace(/ content_hash: [0-9a-f]{64}$/, '')).toBe(message);
    });
  }

  it('over 300 seeded random replace-alls, the message\'s counts are always the diff header\'s', async () => {
    let seed = 0xa11;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const piece = () => ['a', 'b', 'cc', '', '\n', '\n', 'd\n'][rand(7)] as string;
    let checked = 0;
    for (let i = 0; checked < 300 && i < 5000; i += 1) {
      const text = Array.from({ length: 2 + rand(12) }, piece).join('');
      if (text.length < 2) continue;
      const from = rand(text.length);
      const oldString = text.slice(from, from + 1 + rand(Math.min(4, text.length - from)));
      const newString = Array.from({ length: rand(4) }, piece).join('');
      if (newString === oldString) continue;
      writeFileSync(join(root, 'src/f.txt'), text);
      const r = await haetEditTool(state, fence).execute({ path: 'src/f.txt', content_hash: sha256(Buffer.from(text)), old_string: oldString, new_string: newString, replace_all: true }, ctx());
      expect(r.isError, JSON.stringify({ text, oldString, newString })).toBe(false);
      const counts = /\((\+\d+ -\d+)\)\. content_hash/.exec(r.text)?.[1];
      expect(`src/f.txt ${counts}`, JSON.stringify({ text, oldString, newString, message: r.text })).toBe(r.diff!.split('\n')[0]);
      checked += 1;
    }
    expect(checked).toBe(300);
  });

  it('a block removed outright is reported in REQ-TOOLS-135\'s word: replaced by 0', async () => {
    writeFileSync(join(root, 'src/todos.js'), BEFORE);
    await readFileTool(state, fence).execute({ path: 'src/todos.js', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    const r = await writeFileTool(state, fence).execute({ operation: 'edit', path: 'src/todos.js', old_string: OLD, new_string: '', replace_all: false }, ctx());
    expect(r.text.replace(/ \(sha256 [0-9a-f]{64}\)$/, '')).toBe('Edited src/todos.js: 3 lines replaced by 0 at line 3 (+0 -3).');
    expect(readFileSync(join(root, 'src/todos.js'), 'utf8')).toBe('// head\n\n\n// tail\n');
  });
});

/**
 * Finding N2 of the final duress live run at c2a9444: undoing a create wrote an empty file where there had been none and
 * answered "Restored <p> to its previous content (0 lines)", so a child with no terminal was left with a stray file it could
 * not remove (docs/defects/fixed/undoing-a-create-leaves-an-empty-file.md).
 */
describe('undo puts the path back as it was before the write: a create is undone by removing the file (REQ-TOOLS-132, REQ-TOOLS-135, REQ-CHAT-050)', () => {
  const exists = (rel: string): boolean => existsSync(join(root, rel));

  it('create then undo removes the file and says so; a second undo has no history', async () => {
    const w = writeFileTool(state, fence);
    expect(await w.execute({ operation: 'create', path: '.tmp-run-tests.sh', content: 'placeholder\n', replace_all: false }, ctx())).toMatchObject({ isError: false });
    const u = await w.execute({ operation: 'undo', path: '.tmp-run-tests.sh', replace_all: false }, ctx());
    expect(u).toMatchObject({ isError: false, text: 'Removed .tmp-run-tests.sh: it did not exist before the create this undoes (1 line removed).' });
    // REQ-CHAT-050: the diff of the restoration, every line of the file removed.
    expect(u.diff).toBe('.tmp-run-tests.sh +0 -1\n[1]- placeholder');
    expect(exists('.tmp-run-tests.sh')).toBe(false);
    expect(await w.execute({ operation: 'undo', path: '.tmp-run-tests.sh', replace_all: false }, ctx())).toMatchObject({ isError: true, text: 'No edit history for .tmp-run-tests.sh.' });
    expect(exists('.tmp-run-tests.sh')).toBe(false);
    // the child in the run reasoned "I can't delete files with these tools": the prose it reads says what an undone create does
    expect(w.description).toContain('undo {path} (undoing a create removes the file it made)');
  });

  it('the directories a create made are removed with its file when nothing else is in them; one that existed or holds another file stays', async () => {
    const w = writeFileTool(state, fence);
    await w.execute({ operation: 'create', path: 'new/deep/n.txt', content: 'one\ntwo', replace_all: false }, ctx());
    const u = await w.execute({ operation: 'undo', path: 'new/deep/n.txt', replace_all: false }, ctx());
    expect(u.text).toBe('Removed new/deep/n.txt: it did not exist before the create this undoes (2 lines removed). Also removed the empty directory new/ the create made.');
    expect(exists('new')).toBe(false);
    // a directory that was already there is never the create's to remove
    await w.execute({ operation: 'create', path: 'src/c.ts', content: 'c', replace_all: false }, ctx());
    expect((await w.execute({ operation: 'undo', path: 'src/c.ts', replace_all: false }, ctx())).text).toBe('Removed src/c.ts: it did not exist before the create this undoes (1 line removed).');
    expect(exists('src/a.ts')).toBe(true);
    // a directory the create made that has gained another file since keeps it, and only the empty one below it goes
    await w.execute({ operation: 'create', path: 'gen/sub/x.txt', content: 'x', replace_all: false }, ctx());
    writeFileSync(join(root, 'gen', 'other.txt'), 'kept');
    const v = await w.execute({ operation: 'undo', path: 'gen/sub/x.txt', replace_all: false }, ctx());
    expect(v.text).toBe('Removed gen/sub/x.txt: it did not exist before the create this undoes (1 line removed). Also removed the empty directory gen/sub/ the create made.');
    expect(exists('gen/sub')).toBe(false);
    expect(readFileSync(join(root, 'gen', 'other.txt'), 'utf8')).toBe('kept');
  });

  it('a file removed since its create is not written back: the undo says nothing was there to remove', async () => {
    const w = writeFileTool(state, fence);
    await w.execute({ operation: 'create', path: 'gone.txt', content: 'g\n', replace_all: false }, ctx());
    rmSync(join(root, 'gone.txt'));
    const u = await w.execute({ operation: 'undo', path: 'gone.txt', replace_all: false }, ctx());
    expect(u).toMatchObject({ isError: false, text: 'gone.txt did not exist before the create this undoes, and it does not exist now: nothing to remove.' });
    expect(u.diff).toBe('gone.txt +0 -0');
    expect(exists('gone.txt')).toBe(false);
  });

  it('edit then undo restores the previous content and keeps the file; each undo steps back one write, the create last', async () => {
    const w = writeFileTool(state, fence);
    await readFileTool(state, fence).execute({ path: 'src/a.ts', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    await w.execute({ operation: 'edit', path: 'src/a.ts', old_string: 'const b = 2;', new_string: 'const b = 3;', replace_all: false }, ctx());
    const u = await w.execute({ operation: 'undo', path: 'src/a.ts', replace_all: false }, ctx());
    expect(u).toMatchObject({ isError: false, text: 'Restored src/a.ts to its previous content (3 lines).' });
    expect(readFileSync(join(root, 'src', 'a.ts'), 'utf8')).toBe('const a = 1;\nconst b = 2;\nexport { a, b };\n');
    expect(await w.execute({ operation: 'undo', path: 'src/a.ts', replace_all: false }, ctx())).toMatchObject({ isError: true, text: 'No edit history for src/a.ts.' });
    expect(exists('src/a.ts')).toBe(true);

    // create, overwrite, edit through haet_edit (the same stack, REQ-TOOLS-189): three undos walk back to no file at all
    await w.execute({ operation: 'create', path: 'notes.txt', content: 'one\n', replace_all: false }, ctx());
    await w.execute({ operation: 'overwrite', path: 'notes.txt', content: 'two\n', replace_all: false }, ctx());
    await haetEditTool(state, fence).execute({ path: 'notes.txt', content_hash: sha256('two\n'), old_string: 'two', new_string: 'three', replace_all: false }, ctx());
    expect((await w.execute({ operation: 'undo', path: 'notes.txt', replace_all: false }, ctx())).text).toBe('Restored notes.txt to its previous content (1 line).');
    expect(readFileSync(join(root, 'notes.txt'), 'utf8')).toBe('two\n');
    expect((await w.execute({ operation: 'undo', path: 'notes.txt', replace_all: false }, ctx())).text).toBe('Restored notes.txt to its previous content (1 line).');
    expect(readFileSync(join(root, 'notes.txt'), 'utf8')).toBe('one\n');
    expect((await w.execute({ operation: 'undo', path: 'notes.txt', replace_all: false }, ctx())).text).toBe('Removed notes.txt: it did not exist before the create this undoes (1 line removed).');
    expect(exists('notes.txt')).toBe(false);
    expect(await w.execute({ operation: 'undo', path: 'notes.txt', replace_all: false }, ctx())).toMatchObject({ isError: true, text: 'No edit history for notes.txt.' });
  });

  it('an untouched create is removed by its undo: the file still holds exactly what the create wrote', async () => {
    const w = writeFileTool(state, fence);
    await w.execute({ operation: 'create', path: 'kept-as-written.txt', content: 'mine\n', replace_all: false }, ctx());
    // rewritten by another writer to the very same bytes is still what the create wrote
    writeFileSync(join(root, 'kept-as-written.txt'), 'mine\n');
    expect(await w.execute({ operation: 'undo', path: 'kept-as-written.txt', replace_all: false }, ctx())).toMatchObject({ isError: false, text: 'Removed kept-as-written.txt: it did not exist before the create this undoes (1 line removed).' });
    expect(exists('kept-as-written.txt')).toBe(false);
  });

  it('a created file another writer has rewritten since is left in place: the undo refuses, names the path, and quotes nothing', async () => {
    const w = writeFileTool(state, fence);
    await w.execute({ operation: 'create', path: 'shared/out.txt', content: 'mine\n', replace_all: false }, ctx());
    // a terminal command or another agent writes over it outside the file tools
    writeFileSync(join(root, 'shared', 'out.txt'), 'someone else\nwrote\n');
    const u = await w.execute({ operation: 'undo', path: 'shared/out.txt', replace_all: false }, ctx());
    expect(u).toMatchObject({ isError: true, text: 'Cannot undo the create of shared/out.txt: the file changed since it was created, so it was left in place. Read it again before changing it.' });
    expect(u.text).not.toContain('someone else');
    expect(readFileSync(join(root, 'shared', 'out.txt'), 'utf8')).toBe('someone else\nwrote\n');
    // the refusal changed nothing, so the create stays on the stack: refused again while the other content stands ...
    expect((await w.execute({ operation: 'undo', path: 'shared/out.txt', replace_all: false }, ctx())).text).toMatch(/^Cannot undo the create of shared\/out\.txt:/);
    // ... and undoable once the file holds what the create wrote again, the directory it made going with it
    writeFileSync(join(root, 'shared', 'out.txt'), 'mine\n');
    expect((await w.execute({ operation: 'undo', path: 'shared/out.txt', replace_all: false }, ctx())).text).toBe('Removed shared/out.txt: it did not exist before the create this undoes (1 line removed). Also removed the empty directory shared/ the create made.');
    expect(exists('shared')).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('the directory the answer names is the platform\'s parent of the path, so a backslash in a POSIX name is not a separator', async () => {
    const w = writeFileTool(state, fence);
    await w.execute({ operation: 'create', path: 'we\\ird/x.txt', content: 'x', replace_all: false }, ctx());
    expect(exists('we\\ird/x.txt')).toBe(true);
    expect((await w.execute({ operation: 'undo', path: 'we\\ird/x.txt', replace_all: false }, ctx())).text).toBe('Removed we\\ird/x.txt: it did not exist before the create this undoes (1 line removed). Also removed the empty directory we\\ird/ the create made.');
    expect(exists('we\\ird')).toBe(false);
  });

  it('a create read from a call with no operation (PD-TOOLS-007) is undone the same way', async () => {
    const w = writeFileTool(state, fence);
    const inferred = w.inferArguments?.({ path: 'inferred.txt', content: 'i\n' });
    expect(inferred?.args).toMatchObject({ operation: 'create' });
    await w.execute({ ...(inferred!.args as { operation: 'create'; path: string; content: string }), replace_all: false }, ctx());
    expect(exists('inferred.txt')).toBe(true);
    expect((await w.execute({ operation: 'undo', path: 'inferred.txt', replace_all: false }, ctx())).text).toMatch(/^Removed inferred\.txt:/);
    expect(exists('inferred.txt')).toBe(false);
  });
});
