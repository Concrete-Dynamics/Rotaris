import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import { checkFence, type FenceConfig } from './fence.js';
import { renderDiff } from './diff.js';
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
});

describe('read_file (REQ-TOOLS-134)', () => {
  it('line-numbered content with the header; offset/limit; grep with context; a directory lists; binary is rejected', async () => {
    const t = readFileTool(state, fence);
    const r = await t.execute({ path: 'src/a.ts', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    expect(r.text.split('\n')[0]).toBe('[path: src/a.ts | total_lines: 4 | shown: lines 1-4 | truncated: false]');
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
    expect(e1.text).toMatch(/^Edited src\/a\.ts: 1 line\(s\) changed at line 1\. \(sha256 [0-9a-f]{64}\)$/);
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
    expect(all.text).toContain('2 occurrence(s) replaced');
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
    expect(c.text).toMatch(/^Created new\/n\.txt: 2 line\(s\) created\./);
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
  it('REQ-TOOLS-188: matchEdit is deterministic — the lower line wins a fuzzy tie', () => {
    const m = matchEdit(['abcdefghij', 'x', 'abcdefghik'], 'abcdefghiz');
    expect(m).toMatchObject({ level: 4, starts: [0] });
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
    expect(r.text).toContain('2 phase(s) sent here were not added');
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
