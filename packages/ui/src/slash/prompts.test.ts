import { describe, expect, it } from 'vitest';
import type { PromptFile, PromptsRootsResult } from '@rotaris/contracts';
import { bindPromptRootsReader, cachedPromptRoots, expandPromptBody, namedPromptArgument, normalisePromptStem, promptDescription, promptRegistrations, readPromptRoots, registerPromptCommands, splitPromptArguments } from './prompts.js';
import { buildCatalogue } from './catalogue.js';
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
    forceLoadSkill: async () => ({ ok: true }),
    submitAsPrompt: async (text) => { submitted.push(text); },
  });

  it('a built-in keeps its name; the prefixed form registers; the entry carries kind prompt, the description and the hint; a re-registration replaces its own names only', async () => {
    const registry = createSlashRegistry();
    registry.register({ name: 'stop', description: 'Stop the active run', kind: 'action', availability: () => ({ ok: true }), run: async () => ({ kind: 'executed' }) });
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

describe('slash/prompts — the reader and the answer it keeps (defect AO-2)', () => {
  it('keeps the last answer beside the reader, so a registry rebuilt afterwards registers without reading again, and binding a reader clears it', async () => {
    const result: PromptsRootsResult = { files: [file('workspace', 'Greet Me', 'hello')], skipped: [] };
    let reads = 0;
    bindPromptRootsReader(async () => { reads += 1; return result; });
    expect(cachedPromptRoots()).toBeNull();
    await readPromptRoots();
    expect(reads).toBe(1);
    expect(cachedPromptRoots()).toEqual(result);
    // What a rebuilt registry does: take the cached answer at once. Three directory listings and an IPC round trip are what
    // this saves (defect AO-1), and registering in the same tick is what defect AO-2 needed.
    const rebuilt = createSlashRegistry();
    expect(registerPromptCommands(rebuilt, cachedPromptRoots()!).names).toEqual(['prompts:greet-me', 'greet-me']);
    expect(reads).toBe(1);
    // A new binder is a new window and a new workspace: the previous window's answer is not this one's.
    bindPromptRootsReader(null);
    expect(cachedPromptRoots()).toBeNull();
    expect(readPromptRoots()).toBeNull();
  });

  it('defect AO-3: two callers in the same tick join one read, and a later one reads again', async () => {
    const result: PromptsRootsResult = { files: [file('workspace', 'Greet Me', 'hello')], skipped: [] };
    let reads = 0;
    let release: (() => void) | null = null;
    bindPromptRootsReader(async () => { reads += 1; await new Promise<void>((r) => { release = r; }); return result; });
    // The registrar's effect and the configuration key's effect, both at window start, neither with an answer to find.
    const first = readPromptRoots();
    const second = readPromptRoots();
    expect(reads).toBe(1);
    expect(second).toBe(first);
    release!();
    expect(await Promise.all([first, second])).toEqual([result, result]);
    // Settled: a focus or a configuration change still reads the disk.
    const third = readPromptRoots();
    expect(reads).toBe(2);
    expect(third).not.toBe(first);
    release!();
    await third;
    // Binding a reader (a new window, a new workspace) drops an in-flight read as well as the answer.
    bindPromptRootsReader(async () => { reads += 1; return result; });
    await readPromptRoots();
    expect(reads).toBe(3);
  });
});

describe('slash/prompts — the catalogue carries what the reader answered (defect AO-2)', () => {
  const catalogueOptions = { palette: [], runPalette: () => undefined, stashCount: 0, reachable: {} };
  it('registers the cached answer as the catalogue is BUILT, so a rebuilt registry lists the prompt files without waiting for an effect', async () => {
    bindPromptRootsReader(async () => ({ files: [file('workspace', 'Greet Me', 'hello'), file('home', 'stop', 'no')], skipped: [] }));
    // Before the first answer the catalogue holds the built-ins alone — the state the first window of a session builds in.
    expect(buildCatalogue(catalogueOptions).lookup('greet-me')).toBeUndefined();
    await readPromptRoots();
    const registry = buildCatalogue(catalogueOptions);
    expect(registry.lookup('greet-me')?.kind).toBe('prompt');
    expect(registry.lookup('prompts:greet-me')?.kind).toBe('prompt');
    // REQ-CHAT-160: the built-in keeps its name — `/stop` is the run control, never a prompt file called stop.md.
    expect(registry.lookup('stop')!.description).toBe('Stop the active run'); // PD-ORCH-005 clause 15
    expect(registry.lookup('prompts:stop')?.kind).toBe('prompt');
    bindPromptRootsReader(null);
  });

  it('a prompt file replaces a prompt file in place, and never a built-in', () => {
    const registry = createSlashRegistry();
    registry.register({ name: 'stop', description: 'built-in', kind: 'action', availability: () => ({ ok: true }), run: async () => ({ kind: 'executed' }) });
    expect(registerPromptCommands(registry, { files: [file('workspace', 'greet', 'one')], skipped: [] }).names).toEqual(['prompts:greet', 'greet']);
    expect(registerPromptCommands(registry, { files: [file('home', 'greet', 'two'), file('home', 'stop', 'x')], skipped: [] }).names).toEqual(['prompts:greet', 'greet', 'prompts:stop']);
    expect(registry.lookup('greet')!.description).toBe('Prompt file greet.md (home)');
    expect(registry.lookup('stop')!.description).toBe('built-in');
  });
});
