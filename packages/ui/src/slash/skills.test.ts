import { describe, expect, it } from 'vitest';
import type { SkillRow, SkillsState } from '@rotaris/contracts';
import { buildCatalogue, type CatalogueOptions } from './catalogue.js';
import { createSlashRegistry } from './registry.js';
import {
  bindSkillsReader, cachedSkills, catalogueNormalForm, freeName, readSkills, registerSkillCommands,
  skillCommandDescription, skillRegistrations, triggerCommandName,
} from './skills.js';

const row = (over: Partial<SkillRow> = {}): SkillRow => ({
  name: 'alpha', declaredName: 'alpha', description: 'Alpha does things.', path: '/ws/alpha/SKILL.md', directory: '/ws/alpha',
  scope: 'project', triggers: [], shadowed: [], loadMode: 'name-only', invocationMode: 'default', forcedThisSession: false, userInvocable: true,
  ...over,
});
const state = (skills: SkillRow[], enabled = true): SkillsState => ({ enabled, skills, skipped: [] });

describe('REQ-SHELL-056 — the catalogue normal form a generated entry takes', () => {
  it('lower-cases, collapses whitespace and underscore runs to one hyphen, and REMOVES everything else', () => {
    expect(catalogueNormalForm('Build UI')).toBe('build-ui');
    expect(catalogueNormalForm('build__ui')).toBe('build-ui');
    // The difference from REQ-WORKSPACE-054's form, which is ESC-39: `+` is deleted here and hyphenated there.
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

describe('REQ-SHELL-056 — collisions are suffixed, never skipped (ESC-39)', () => {
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
