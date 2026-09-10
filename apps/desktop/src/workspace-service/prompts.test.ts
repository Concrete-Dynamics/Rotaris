import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promptRootDirectories, readPromptFrontmatter, readPromptRoots } from './prompts.js';

/** Part AO — REQ-CHAT-160's read of the three roots in the workspace service: the order, the frontmatter grammar, the skips. */
describe('workspace-service/prompts — the frontmatter grammar', () => {
  it('no frontmatter: the whole text is the body', () => {
    expect(readPromptFrontmatter('Hello $1')).toEqual({ ok: true, fields: {}, body: 'Hello $1' });
  });
  it('a closed block yields its fields (quotes stripped) and the body below it', () => {
    const r = readPromptFrontmatter('---\ndescription: "Greets someone"\nargument-hint: <name>\n\n---\nHello $1\nbye');
    expect(r).toEqual({ ok: true, fields: { description: 'Greets someone', 'argument-hint': '<name>' }, body: 'Hello $1\nbye' });
  });
  it('an unclosed block and a line that is not key: value are MALFORMED, with the reason', () => {
    expect(readPromptFrontmatter('---\ndescription: x\n')).toEqual({ ok: false, reason: 'malformed frontmatter: the opening --- is never closed' });
    // Inside an unclosed block the first line that is not a pair is what the reader meets first, and that is the reason it gives.
    expect(readPromptFrontmatter('---\ndescription: x\nHello')).toEqual({ ok: false, reason: 'malformed frontmatter: line 3 is not a "key: value" line' });
    expect(readPromptFrontmatter('---\nnot a pair\n---\nbody')).toEqual({ ok: false, reason: 'malformed frontmatter: line 2 is not a "key: value" line' });
  });
});

describe('workspace-service/prompts — the three roots', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-prompts-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('searches <workspace>/.agents/prompts, then ~/.agents/prompts, then <config>/prompts — in that order', () => {
    const env = { workspaceRoot: join(root, 'ws'), home: join(root, 'home'), configDir: join(root, 'config') };
    expect(promptRootDirectories(env).map((d) => d.root)).toEqual(['workspace', 'home', 'config']);
    expect(promptRootDirectories(env).map((d) => d.dir)).toEqual([join(root, 'ws', '.agents', 'prompts'), join(root, 'home', '.agents', 'prompts'), join(root, 'config', 'prompts')]);
  });

  it('answers only .md files lying DIRECTLY inside an existing root, in root order then name order; skips the malformed with a reason and never another file for it', () => {
    const env = { workspaceRoot: join(root, 'ws'), home: join(root, 'home'), configDir: join(root, 'config') };
    const ws = join(root, 'ws', '.agents', 'prompts');
    const cfg = join(root, 'config', 'prompts');
    mkdirSync(join(ws, 'nested'), { recursive: true });
    mkdirSync(cfg, { recursive: true });
    writeFileSync(join(ws, 'Greet Me.md'), '---\ndescription: Greets\n---\nHello $1');
    writeFileSync(join(ws, 'bad.md'), '---\ndescription: never closed\n');
    writeFileSync(join(ws, 'notes.txt'), 'not a prompt');
    writeFileSync(join(ws, 'nested', 'deep.md'), 'not directly inside');
    writeFileSync(join(cfg, 'alpha.md'), 'from the config root');
    // No home root at all: not a fault.
    const logged: string[] = [];
    const r = readPromptRoots(env, (m) => logged.push(m));
    expect(r.files.map((f) => [f.root, f.stem, f.body])).toEqual([['workspace', 'Greet Me', 'Hello $1'], ['config', 'alpha', 'from the config root']]);
    expect(r.files[0]!.description).toBe('Greets');
    expect(r.skipped).toEqual([{ path: join(ws, 'bad.md'), reason: 'malformed frontmatter: the opening --- is never closed' }]);
    expect(logged.some((m) => m.includes('bad.md') && m.includes('malformed'))).toBe(true);
  });
});
