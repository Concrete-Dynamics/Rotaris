import { describe, expect, it } from 'vitest';
import { EMPTY_SKILLS_STATE, SKILLS_DISCOVERING_CODE, SKILLS_DISCOVERY_STALLED_CODE, SKILLS_NO_REPLY_CODE, type PromptFile, type PromptsRootsResult, type SkillRow, type SkillsState } from '@rotaris/contracts';
import { buildCatalogue, type CatalogueOptions } from './catalogue.js';
import { registerPromptCommands } from './prompts.js';
import { createSlashRegistry } from './registry.js';
import {
  askUntilDiscovered, bindSkillsReader, cachedSkills, catalogueNormalForm, freeName, readSkills, registerSkillCommands,
  skillCommandDescription, skillPathCommand, skillRegistrations, skillsListCommand, triggerCommandName,
  SKILLS_LIST_COMMAND_NAME, SKILLS_LIST_DESCRIPTION,
} from './skills.js';

const row = (over: Partial<SkillRow> = {}): SkillRow => ({
  name: 'alpha', declaredName: 'alpha', description: 'Alpha does things.', path: '/ws/alpha/SKILL.md', directory: '/ws/alpha',
  scope: 'project', triggers: [], shadowed: [], loadMode: 'name-only', invocationMode: 'default', forcedThisSession: false, userInvocable: true,
  ...over,
});
const state = (skills: SkillRow[], enabled = true): SkillsState => ({ enabled, skills, skipped: [] });
const prompt = (stem: string): PromptFile => ({ root: 'workspace', path: `/ws/.agents/prompts/${stem}.md`, stem, body: 'body' });

describe('REQ-SHELL-056 — the catalogue normal form a generated entry takes', () => {
  it('lower-cases, collapses whitespace and underscore runs to one hyphen, and REMOVES everything else', () => {
    expect(catalogueNormalForm('Build UI')).toBe('build-ui');
    expect(catalogueNormalForm('build__ui')).toBe('build-ui');
    // The difference from REQ-WORKSPACE-054's form, kept apart by ESC-39: `+` is deleted here and hyphenated there.
    expect(catalogueNormalForm('c++ build')).toBe('c-build');
    expect(catalogueNormalForm('--x--')).toBe('x');
  });
  it('yields nothing at all for a name that reduces to the empty string', () => {
    expect(catalogueNormalForm('***')).toBe('');
    expect(skillRegistrations([row({ declaredName: '***' })], () => false).registrations).toHaveLength(0);
  });
  it('REQ-WORKSPACE-072: a slash-trigger keyword loses its leading slash, then normalises', () => {
    expect(triggerCommandName('/Render PDF')).toBe('render-pdf');
    expect(triggerCommandName('render')).toBe('render');
  });
});

describe('REQ-SHELL-056 — collisions are suffixed, never skipped (ESC-39, ruled)', () => {
  it('takes the first free -2, -3 … and leaves the holder its name', () => {
    const taken = new Set(['stop', 'stop-2']);
    expect(freeName('stop', (n) => taken.has(n))).toBe('stop-3');
    expect(freeName('free', (n) => taken.has(n))).toBe('free');
  });
  it('a renamed entry additionally names the skill it came from, so a suffix is never unexplained', () => {
    expect(skillCommandDescription(row(), false)).toBe('Alpha does things.');
    expect(skillCommandDescription(row(), true)).toBe('Alpha does things. (skill: alpha)');
    // REQ-SHELL-056: with no description, a sentence stating the skill is available and naming it.
    expect(skillCommandDescription(row({ description: '' }), false)).toBe('Skill alpha is available.');
  });
  it('registers a skill under its name AND each trigger, suffixing only what is taken', () => {
    const { registrations } = skillRegistrations([row({ declaredName: 'alpha', triggers: ['/a', 'stop'] })], (n) => n === 'stop');
    expect(registrations.map((r) => `${r.name}:${r.renamed}`)).toEqual(['alpha:false', 'a:false', 'stop-2:true']);
  });
  it('a skill that is not user-invocable yields no command at all (REQ-CHAT-034: auto-only, and `off`)', () => {
    expect(skillRegistrations([row({ userInvocable: false })], () => false).registrations).toHaveLength(0);
  });
});

describe('registration on the catalogue’s registry', () => {
  const options: CatalogueOptions = { runPalette: () => undefined, stashCount: 0, reachable: {}, palette: [] };

  it('keeps a built-in’s name with the built-in and offers the skill a suffixed one', () => {
    const registry = buildCatalogue(options);
    registerSkillCommands(registry, state([row({ name: 'stop', declaredName: 'stop' })]));
    // REQ-CHAT-034's first clause holds: the command already holding the name keeps it…
    expect(registry.lookup('stop')!.kind).toBe('action');
    // …and REQ-SHELL-056's "never silently unreachable" holds too.
    expect(registry.lookup('stop-2')!.kind).toBe('skill');
    // The description names the SKILL's own identity (REQ-WORKSPACE-054's form), not the command's.
    expect(registry.lookup('stop-2')!.description).toContain('(skill: stop)');
  });

  it('REQ-CHAT-034: after a rescan the catalogue lists EXACTLY the rescanned set', () => {
    const registry = buildCatalogue(options);
    const first = registerSkillCommands(registry, state([row({ name: 'alpha', declaredName: 'alpha' }), row({ name: 'beta', declaredName: 'beta' })]));
    expect(first.names.sort()).toEqual(['alpha', 'beta']);
    // `beta` is deleted from disk; registering the survivors is not enough, the stale command must go.
    const second = registerSkillCommands(registry, state([row({ name: 'alpha', declaredName: 'alpha' })]), new Set(first.names));
    expect(second.names).toEqual(['alpha']);
    expect(registry.lookup('alpha')).toBeDefined();
    expect(registry.lookup('beta')).toBeUndefined();
  });

  it('removes only names IT registered — a built-in a skill once shadowed is nobody’s to take away', () => {
    const registry = buildCatalogue(options);
    registerSkillCommands(registry, state([]), new Set(['stop', 'alpha']));
    expect(registry.lookup('stop')!.kind).toBe('action');
  });

  it('REQ-WORKSPACE-064: with the switch off the state carries nothing invocable, so nothing registers', () => {
    const registry = buildCatalogue(options);
    // The run host resolves `enabled: false` into `userInvocable: false` on every row, so no branch is needed here.
    const r = registerSkillCommands(registry, state([row({ userInvocable: false })], false));
    expect(r.names).toEqual([]);
  });

  it('REQ-CHAT-025: a skill command carries the `skill` kind badge', () => {
    const registry = createSlashRegistry();
    registerSkillCommands(registry, state([row()]));
    expect(registry.lookup('alpha')!.kind).toBe('skill');
  });
});

describe('REQ-WORKSPACE-073 — what invoking a skill command does', () => {
  const ctxWith = (forceLoadSkill: (name: string) => Promise<{ ok: true } | { ok: false; reason: string }>) => {
    const notices: string[] = [];
    const ctx = { notify: (t: string) => notices.push(t), forceLoadSkill } as never;
    return { ctx, notices };
  };

  it('force-loads and shows the toast REQ-CHAT-034 fixes', async () => {
    const registry = createSlashRegistry();
    registerSkillCommands(registry, state([row()]));
    const loaded: string[] = [];
    const { ctx, notices } = ctxWith(async (name) => { loaded.push(name); return { ok: true }; });
    expect(await registry.lookup('alpha')!.run('', ctx)).toEqual({ kind: 'executed' });
    expect(loaded).toEqual(['alpha']);
    expect(notices).toEqual(['Skill loaded for the next prompt: alpha']);
  });

  it('reports the host’s refusal verbatim and shows no toast', async () => {
    const registry = createSlashRegistry();
    registerSkillCommands(registry, state([row()]));
    const { ctx, notices } = ctxWith(async () => ({ ok: false, reason: 'Skills are disabled. Enable them in Settings.' }));
    expect(await registry.lookup('alpha')!.run('', ctx)).toEqual({ kind: 'failed', message: 'Skills are disabled. Enable them in Settings.' });
    expect(notices).toEqual([]);
  });

  it('the command is invoked by NAME and submits no prompt — the body reaching the agent is the whole of what it does', async () => {
    const registry = createSlashRegistry();
    registerSkillCommands(registry, state([row({ declaredName: 'Build UI', name: 'build-ui' })]));
    const loaded: string[] = [];
    const { ctx } = ctxWith(async (name) => { loaded.push(name); return { ok: true }; });
    // The typed name is the catalogue's form; the name the host is asked for is the SKILL's (REQ-WORKSPACE-054).
    await registry.lookup('build-ui')!.run('anything typed after it', ctx);
    expect(loaded).toEqual(['build-ui']);
  });
});

describe('slash/skills — a walk in flight is not an answer about the catalogue (OQ-386 point 1, REQ-CHAT-034)', () => {
  const discovering = { ok: false as const, code: SKILLS_DISCOVERING_CODE, headline: 'h' };
  const stalled = { ok: false as const, code: SKILLS_DISCOVERY_STALLED_CODE, headline: 'h' };
  it('asks again through both refusals, naming each, and returns the first answer', async () => {
    const noReply = { ok: false as const, code: SKILLS_NO_REPLY_CODE, headline: 'h' };
    const answers = [discovering, noReply, stalled, { ok: true as const }];
    const waited: unknown[] = [];
    let asked = 0;
    const r = await askUntilDiscovered(async () => answers[asked++]!, (refused) => waited.push(refused));
    expect(r).toEqual({ ok: true });
    expect(asked).toBe(4);
    expect(waited).toEqual([discovering, noReply, stalled]);
  });
  it('takes any other refusal as the answer: a configuration that does not load is not on its way', async () => {
    const fatal = { ok: false as const, code: 'config.fatal' };
    let asked = 0;
    expect(await askUntilDiscovered(async () => { asked += 1; return fatal; })).toBe(fatal);
    expect(asked).toBe(1);
  });
  it('stops asking once the asker has gone', async () => {
    let asked = 0;
    let gone = false;
    const r = await askUntilDiscovered(async () => { asked += 1; gone = true; return discovering; }, undefined, () => gone);
    expect(r).toBeNull();
    expect(asked).toBe(1);
  });
  it('caches nothing during the walk and the catalogue after it, with no gesture between', async () => {
    const answer = state([row()]);
    const replies: ({ ok: true; value: SkillsState } | typeof discovering)[] = [discovering, discovering, { ok: true, value: answer }];
    // The renderer's reader (renderer/main.tsx): the refusals never reach `lastSkills`, so nothing empty is cached.
    bindSkillsReader(async () => {
      const r = await askUntilDiscovered(async () => replies.shift()!);
      return r !== null && r.ok ? r.value : EMPTY_SKILLS_STATE;
    });
    const read = readSkills();
    expect(cachedSkills()).toBeNull();
    expect(await read).toEqual(answer);
    expect(cachedSkills()).toEqual(answer);
    expect(replies).toEqual([]);
    bindSkillsReader(null);
  });
});

describe('slash/skills — the reader keeps what it has and what it is waiting for (defect AO-3)', () => {
  it('three callers in the same tick join one read, and a later one reads the catalog again', async () => {
    const answer = state([row()]);
    let reads = 0;
    let release: (() => void) | null = null;
    bindSkillsReader(async () => { reads += 1; await new Promise<void>((r) => { release = r; }); return answer; });
    // The registrar's effect, the configuration key's and the rescan counter's, all at window start, none with an answer to find.
    const first = readSkills();
    const second = readSkills();
    const third = readSkills();
    expect(reads).toBe(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
    release!();
    expect(await Promise.all([first, second, third])).toEqual([answer, answer, answer]);
    expect(cachedSkills()).toEqual(answer);
    // Settled: a rescan or a configuration change still asks the run host.
    const later = readSkills();
    expect(reads).toBe(2);
    expect(later).not.toBe(first);
    release!();
    await later;
    // A new window or a new workspace drops the answer and any read still running with it.
    bindSkillsReader(null);
    expect(cachedSkills()).toBeNull();
    expect(readSkills()).toBeNull();
  });
});

describe('REQ-CHAT-162 — `/skills`, the listing written as one saved system row', () => {
  it('is a catalogue command of the `skill` kind that takes no argument', () => {
    const command = skillsListCommand(async () => ({ ok: true, count: 0 }));
    expect(command.name).toBe(SKILLS_LIST_COMMAND_NAME);
    expect(command.kind).toBe('skill');
    expect(command.description).toBe(SKILLS_LIST_DESCRIPTION);
    expect(command.argumentHint).toBeUndefined();
    expect(command.availability({} as never)).toEqual({ ok: true });
  });

  it('asks once, and the row that appears is the report — no toast of its own', async () => {
    let asked = 0;
    const notices: string[] = [];
    const command = skillsListCommand(async () => { asked += 1; return { ok: true, count: 3 }; });
    expect(await command.run('ignored words', { notify: (t: string) => notices.push(t) } as never)).toEqual({ kind: 'executed' });
    expect(asked).toBe(1);
    expect(notices).toEqual([]);
  });

  it('surfaces a refusal, and a throw, as `failed` with the reason', async () => {
    expect(await skillsListCommand(async () => ({ ok: false, reason: 'Open or start a session first.' })).run('', {} as never))
      .toEqual({ kind: 'failed', message: 'Open or start a session first.' });
    expect(await skillsListCommand(async () => { throw new Error('the bridge went away'); }).run('', {} as never))
      .toEqual({ kind: 'failed', message: 'the bridge went away' });
  });
});

describe('REQ-SHELL-056 — `/skill` and `/skills` are built-ins and keep their names against a generated entry', () => {
  const fixed = (registry: ReturnType<typeof createSlashRegistry>) => {
    registry.register(skillPathCommand(async () => ({ ok: true, name: 'x' }), () => undefined));
    registry.register(skillsListCommand(async () => ({ ok: true, count: 0 })));
  };
  const named = state([row({ name: 'skill', declaredName: 'skill' }), row({ name: 'skills', declaredName: 'Skills' })]);

  it('the fixed commands registered FIRST: each skill is offered -2, and the fixed commands are untouched', () => {
    const registry = createSlashRegistry();
    fixed(registry);
    const r = registerSkillCommands(registry, named);
    expect(r.names).toEqual(['skill-2', 'skills-2']);
    expect(registry.lookup('skill')!.argumentHint).toBe('<path>');
    expect(registry.lookup('skills')!.description).toBe(SKILLS_LIST_DESCRIPTION);
    expect(registry.lookup('skill-2')!.description).toContain('(skill: skill)');
  });

  it('the generated commands registered FIRST: the same names, so neither registration order loses a command', () => {
    // The defect this rule repairs: a holder of kind `skill` read as the registrar's own work, so the generated
    // `skill` took the name here and the fixed `/skill` then replaced it — the skill silently unreachable.
    const registry = createSlashRegistry();
    const r = registerSkillCommands(registry, named);
    fixed(registry);
    expect(r.names).toEqual(['skill-2', 'skills-2']);
    expect(registry.lookup('skill-2')!.kind).toBe('skill');
    expect(registry.lookup('skill')!.argumentHint).toBe('<path>');
    expect(registry.lookup('skills')!.description).toBe(SKILLS_LIST_DESCRIPTION);
  });

  it('a rescan never removes a fixed command, even one a skill of that name once stood beside', () => {
    const registry = createSlashRegistry();
    fixed(registry);
    const first = registerSkillCommands(registry, named);
    registerSkillCommands(registry, state([]), new Set(first.names));
    expect(registry.lookup('skill')).toBeDefined();
    expect(registry.lookup('skills')).toBeDefined();
    expect(registry.lookup('skill-2')).toBeUndefined();
  });

  it('REQ-CHAT-160: a prompt file named `skills.md` or `skill.md` never takes either name, in the order the composer mounts', () => {
    // The sequence the window runs: `buildCatalogue` applies the cached prompt roots to a fresh registry, the registrar's
    // mount effect applies them again and records its names, the fixed commands' effects register, and the next re-read
    // (the configuration key's, or any composer focus) applies a fresh answer with the names it recorded. Before the fix
    // the bare stems were free at the first step, recorded as the registrar's own at the second, and taken back from the
    // fixed commands at the fourth — `/skills` then ran the prompt, not the listing.
    const prompts: PromptsRootsResult = { files: [prompt('skills'), prompt('skill')], skipped: [] };
    const registry = createSlashRegistry();
    registerPromptCommands(registry, prompts);
    const mounted = registerPromptCommands(registry, prompts, new Set());
    fixed(registry);
    const reread = registerPromptCommands(registry, prompts, new Set(mounted.names));
    for (const r of [mounted, reread]) {
      expect(r.names).toEqual(['prompts:skills', 'prompts:skill']);
      expect(r.skipped.map((s) => s.path)).toEqual([]);
    }
    expect(registry.lookup('skills')!.description).toBe(SKILLS_LIST_DESCRIPTION);
    expect(registry.lookup('skill')!.argumentHint).toBe('<path>');
    // The files stay reachable under REQ-CHAT-160's prefixed names, which is all the requirement promises a held stem.
    expect(registry.lookup('prompts:skills')!.kind).toBe('prompt');
    expect(registry.lookup('prompts:skill')!.kind).toBe('prompt');
  });
});
