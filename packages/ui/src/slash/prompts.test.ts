import { describe, expect, it } from 'vitest';
import type { PromptFile, PromptsRootsResult } from '@rotaris/contracts';
import { expandPromptBody, namedPromptArgument, normalisePromptStem, promptDescription, promptRegistrations, registerPromptCommands, splitPromptArguments } from './prompts.js';
import { createSlashRegistry } from './registry.js';
import type { SlashContext } from './types.js';

/** Part AO — REQ-CHAT-160's naming and registration rules and REQ-CHAT-161's one-pass expansion, checked without a filesystem or a DOM. */
const file = (root: PromptFile['root'], stem: string, body = 'body', extra: Partial<PromptFile> = {}): PromptFile => ({ root, path: `${root}/${stem}.md`, stem, body, ...extra });

describe('slash/prompts — REQ-CHAT-160 naming', () => {
  it('lowercases, folds every run outside [a-z0-9:_-] to one dash, strips the ends, and an empty result names nothing', () => {
    expect(normalisePromptStem('Greet Me')).toBe('greet-me');
    expect(normalisePromptStem('  Fix!!  Bug (v2) ')).toBe('fix-bug-v2');
    expect(normalisePromptStem('a:b_c-d')).toBe('a:b_c-d');
    expect(normalisePromptStem('---')).toBe('');
    expect(normalisePromptStem('Ünïcode')).toBe('n-code');
  });

  it('registers prompts:<stem> and the bare stem when free; the first root wins outright; a held name stays with its holder', () => {
    const files = [file('workspace', 'Greet'), file('home', 'greet'), file('config', 'stop'), file('config', '!!!')];
    const { registrations, skipped } = promptRegistrations(files, (name) => name === 'stop');
    expect(registrations.map((r) => [r.name, r.file.root])).toEqual([['prompts:greet', 'workspace'], ['greet', 'workspace'], ['prompts:stop', 'config']]);
    expect(skipped.map((s) => s.path)).toEqual(['home/greet.md', 'config/!!!.md']);
    expect(skipped[0]!.reason).toContain('an earlier root yielded the same name');
    expect(skipped[1]!.reason).toContain('normalises to an empty command name');
  });

  it('the description is the frontmatter\'s, else the file\'s place', () => {
    expect(promptDescription(file('home', 'x', 'b', { description: 'Does x' }))).toBe('Does x');
    expect(promptDescription(file('home', 'x'))).toBe('Prompt file x.md (home)');
  });
});

describe('slash/prompts — REQ-CHAT-161 expansion', () => {
  it('splits on whitespace runs, a quoted span is one argument with the quotes removed, an unterminated quote runs to the end, no other escaping', () => {
    expect(splitPromptArguments(`one "two words" NAME=v 'x  y' "unterminated`)).toEqual(['one', 'two words', 'NAME=v', 'x  y', 'unterminated']);
    expect(splitPromptArguments('  a\\ b  ')).toEqual(['a\\', 'b']);
    expect(splitPromptArguments('')).toEqual([]);
  });

  it('names the FIRST NAME=value pair, or nothing', () => {
    expect(namedPromptArgument('a NAME=1 NAME=2', 'NAME')).toBe('1');
    expect(namedPromptArgument('a NAME="two words"', 'NAME')).toBe('two words');
    expect(namedPromptArgument('a', 'NAME')).toBeUndefined();
  });

  it('expands $$, $ARGUMENTS, $1..$9 and $UPPER_NAME in one pass; unsupplied values are empty; $10 is $1 then a literal 0', () => {
    const body = '$$ [$1] [$2] [$NAME] [$ARGUMENTS] [$9] [$NOPE] [$10] $';
    expect(expandPromptBody(body, '  one "two words" NAME=v  ')).toBe('$ [one] [two words] [v] [one "two words" NAME=v] [] [] [one0] $');
  });

  it('an expanded value is never rescanned: a positional holding a placeholder stays literal', () => {
    expect(expandPromptBody('$1', "'$2 x'")).toBe('$2 x');
    expect(expandPromptBody('$ARGUMENTS', '$$')).toBe('$$');
  });
});

describe('slash/prompts — registration on the catalogue\'s registry', () => {
  const ctx = (submitted: string[]): SlashContext => ({
    runState: 'idle', rowCount: 0, hasGit: false, models: [], personas: [], themes: [], providers: [],
    setModel: async () => undefined, setPersona: async () => undefined, setTheme: async () => undefined, logout: async () => undefined,
    control: async () => ({ ok: true, value: undefined }), open: () => undefined, stash: () => undefined, notify: () => undefined,
    submitAsPrompt: async (text) => { submitted.push(text); },
  });

  it('a built-in keeps its name; the prefixed form registers; the entry carries kind prompt, the description and the hint; a re-registration replaces its own names only', async () => {
    const registry = createSlashRegistry();
    registry.register({ name: 'stop', description: 'Cancel the active run', kind: 'action', availability: () => ({ ok: true }), run: async () => ({ kind: 'executed' }) });
    const result: PromptsRootsResult = { files: [file('workspace', 'Stop', 'Hello $1', { description: 'Greets', argumentHint: '<name>' }), file('home', 'greet', 'Hi $ARGUMENTS')], skipped: [{ path: 'home/bad.md', reason: 'malformed frontmatter' }] };
    const first = registerPromptCommands(registry, result);
    expect(first.names).toEqual(['prompts:stop', 'prompts:greet', 'greet']);
    // The file registered under its prefixed name; only the bare alias was withheld, and that is not a skip of the file.
    expect(first.skipped).toEqual([{ path: 'home/bad.md', reason: 'malformed frontmatter' }]);
    expect(registry.lookup('stop')!.kind).toBe('action');
    const prompt = registry.lookup('prompts:stop')!;
    expect(prompt.kind).toBe('prompt');
    expect(prompt.description).toBe('Greets');
    expect(prompt.argumentHint).toBe('<name>');
    const submitted: string[] = [];
    expect(await prompt.run('world', ctx(submitted))).toEqual({ kind: 'executed' });
    expect(submitted).toEqual(['Hello world']);
    // A file whose body expands to nothing is a failed outcome, never an empty prompt (REQ-CHAT-161's delivery has nothing to deliver).
    expect(await registry.lookup('greet')!.run('', ctx(submitted))).toEqual({ kind: 'executed' });
    expect(submitted.at(-1)).toBe('Hi ');
    const empty = registerPromptCommands(registry, { files: [file('home', 'blank', '$1')], skipped: [] }, new Set(first.names));
    expect(await registry.lookup('blank')!.run('', ctx(submitted))).toEqual({ kind: 'failed', message: 'Prompt file blank.md expanded to nothing.' });
    // The second registration re-claims the names the first one held (REQ-CHAT-028's rebuild) and nothing the built-ins hold.
    expect(empty.names).toEqual(['prompts:blank', 'blank']);
    expect(registry.lookup('stop')!.kind).toBe('action');
  });
});
