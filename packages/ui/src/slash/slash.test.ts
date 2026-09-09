import { describe, expect, it } from 'vitest';
import { contrastRatio, oklchToSrgb, parseOklch, srgbToHex, THEMES, type ControlOp } from '@rotaris/contracts';
import { err, ok, type Result } from '@rotaris/kernel';
import { COMMANDS, slashDescription, slashName } from '../commands/registry.js';
import { BUILT_IN_NAMES, buildCatalogue, mirrorPalette, NO_GIT_SERVICE, NO_MODELS, NO_RUN_ACTIVE, SKILL_COMMANDS_NOT_BUILT, STASH_EMPTY, TRANSCRIPT_EMPTY, unknownValueMessage, usageMessage, type CatalogueOptions } from './catalogue.js';
import { blendToward, ensureContrast, slashRoleColours, slashRoleContrast, slashTokenSplit, slashTokenState } from './highlight.js';
import { COMMAND_NOT_RUN_TITLE, defaultUnavailableReason, parseSlash, slashNameToken, slashOutcomeMessage, slashPopupShouldOpen } from './parse.js';
import { createSlashRegistry } from './registry.js';
import type { SlashCommand, SlashContext, SlashOutcome } from './types.js';

const command = (name: string, description = `${name} description`, extra: Partial<SlashCommand> = {}): SlashCommand => ({
  name, description, kind: 'action', availability: () => ({ ok: true }), run: async () => ({ kind: 'executed' }), ...extra,
});

describe('slash — REQ-CHAT-018: parsing', () => {
  it('recognises a single-line text starting with a slash; the first token lowercased is the name, the stripped remainder the argument', () => {
    expect(parseSlash('/Model   gpt-x  ')).toEqual({ kind: 'command', name: 'model', argument: 'gpt-x' });
    expect(parseSlash('/stop')).toEqual({ kind: 'command', name: 'stop', argument: '' });
    expect(parseSlash('/model a b  c')).toEqual({ kind: 'command', name: 'model', argument: 'a b  c' });
    expect(parseSlash('/')).toEqual({ kind: 'command', name: '', argument: '' });
  });
  it('treats the "/ " escape, a newline anywhere, and text not starting with a slash as an ordinary prompt', () => {
    expect(parseSlash('/ hello')).toEqual({ kind: 'prompt' });
    expect(parseSlash('/\thello')).toEqual({ kind: 'prompt' });
    expect(parseSlash('/stop\nnow')).toEqual({ kind: 'prompt' });
    expect(parseSlash('hello /stop')).toEqual({ kind: 'prompt' });
    expect(parseSlash(' /stop')).toEqual({ kind: 'prompt' });
    expect(parseSlash('')).toEqual({ kind: 'prompt' });
  });
});

describe('slash — REQ-CHAT-024: when the popup is open', () => {
  it('opens on a bare slash and on a name token with no whitespace after it; closes on an argument, the escape and a second line', () => {
    expect(slashPopupShouldOpen('/')).toBe(true);
    expect(slashPopupShouldOpen('/mo')).toBe(true);
    expect(slashPopupShouldOpen('/model')).toBe(true);
    expect(slashPopupShouldOpen('/model ')).toBe(false);
    expect(slashPopupShouldOpen('/ ')).toBe(false);
    expect(slashPopupShouldOpen('/mo\n')).toBe(false);
    expect(slashPopupShouldOpen('mo')).toBe(false);
    expect(slashNameToken('/mo')).toBe('mo');
    expect(slashNameToken('/')).toBe('');
    expect(slashNameToken('/model x')).toBe('');
  });
});

describe('slash — REQ-CHAT-020/021: outcomes and the notice', () => {
  it('names the notice and words every non-executed outcome; executed and not-a-command raise none', () => {
    expect(COMMAND_NOT_RUN_TITLE).toBe('Command not run');
    expect(slashOutcomeMessage({ kind: 'unknown', name: 'zzz' }, 'zzz')).toBe('Unknown command /zzz');
    expect(slashOutcomeMessage({ kind: 'unavailable', reason: 'No run is active.' }, 'stop')).toBe('No run is active.');
    expect(slashOutcomeMessage({ kind: 'unavailable', reason: '' }, 'theme')).toBe('/theme is not available right now.');
    expect(defaultUnavailableReason('x')).toBe('/x is not available right now.');
    expect(slashOutcomeMessage({ kind: 'failed', message: 'Usage: /model <name>' }, 'model')).toBe('Usage: /model <name>');
    expect(slashOutcomeMessage({ kind: 'executed' }, 'model')).toBeNull();
    expect(slashOutcomeMessage({ kind: 'not-a-command' }, 'model')).toBeNull();
  });
});

describe('slash — REQ-CHAT-022: the registry', () => {
  it('preserves registration order, lowercases names, replaces an existing name in place, and looks up case-insensitively', () => {
    const r = createSlashRegistry();
    r.register(command('Beta'));
    r.register(command('alpha'));
    r.register(command('BETA', 'replaced'));
    expect(r.list().map((c) => c.name)).toEqual(['beta', 'alpha']);
    expect(r.lookup('Beta')?.description).toBe('replaced');
    expect(r.lookup('/ALPHA')?.name).toBe('alpha');
    expect(r.lookup('gamma')).toBeUndefined();
  });
  it('ranks name-prefix ahead of name-substring ahead of description-substring, registration order within each rank; an empty filter lists all', () => {
    const r = createSlashRegistry();
    r.register(command('resume', 'Browse and resume sessions'));
    r.register(command('sessions', 'Browse and resume sessions'));
    r.register(command('model', 'Switch the model'));
    r.register(command('persona', 'Switch the persona'));
    r.register(command('pop', 'Apply a stashed prompt'));
    expect(r.filter('').map((c) => c.name)).toEqual(['resume', 'sessions', 'model', 'persona', 'pop']);
    // "se": prefix → sessions; substring → resume; description → nothing else.
    expect(r.filter('se').map((c) => c.name)).toEqual(['sessions', 'resume']);
    // "p": prefix → persona, pop (registration order); substring → none; description → nothing more ('Apply' contains p... via description of pop, already listed).
    expect(r.filter('p').map((c) => c.name)).toEqual(['persona', 'pop']);
    // "switch": no name matches; description → model, persona in registration order.
    expect(r.filter('switch').map((c) => c.name)).toEqual(['model', 'persona']);
    expect(r.filter('/MOD').map((c) => c.name)).toEqual(['model']);
    expect(r.filter('zzz')).toEqual([]);
  });
});

describe('slash — REQ-CHAT-027: highlighting', () => {
  const r = createSlashRegistry();
  r.register(command('model'));
  r.register(command('mission'));
  it('resolves an exact name, partial for a prefix of at least one name, unknown otherwise; nothing for multi-line text or the escape', () => {
    expect(slashTokenState('/model', r)).toBe('resolved');
    expect(slashTokenState('/MODEL x y', r)).toBe('resolved');
    expect(slashTokenState('/mod', r)).toBe('partial');
    expect(slashTokenState('/', r)).toBe('partial');
    expect(slashTokenState('/zzz', r)).toBe('unknown');
    expect(slashTokenState('/models', r)).toBe('unknown');
    expect(slashTokenState('/ hello', r)).toBeNull();
    expect(slashTokenState('/model\nmore', r)).toBeNull();
    expect(slashTokenState('hello', r)).toBeNull();
    expect(slashTokenSplit('/model  gpt')).toEqual({ token: '/model', rest: '  gpt' });
    expect(slashTokenSplit('/')).toEqual({ token: '/', rest: '' });
  });
  it('gives every theme four colours from the named roles, each clearing 4.5:1 on the input surface and none rendering the same', () => {
    for (const theme of THEMES) {
      const colours = slashRoleColours(theme);
      const ratios = slashRoleContrast(colours);
      for (const [role, ratio] of Object.entries(ratios)) expect(ratio, `${theme.name} ${role} ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5 - 1e-6);
      const hexes = [colours.resolved, colours.partial, colours.unknown, colours.argument].map((c) => srgbToHex(oklchToSrgb(parseOklch(c))));
      expect(new Set(hexes).size, `${theme.name}: ${hexes.join(' ')}`).toBe(4);
      // The partial shade keeps the accent's hue and is the accent blended toward the surface, so it is nearer the surface in chroma than the resolved shade.
      expect(parseOklch(colours.partial).h).toBe(parseOklch(colours.resolved).h);
      expect(parseOklch(colours.partial).c).toBeLessThan(parseOklch(colours.resolved).c);
      // The surface is the composer input's ground — the design's `.input` paints on `--rt-bg`.
      expect(colours.surface).toBe(theme.tokens.color['--rt-bg']);
    }
  });
  it('blends in OKLCH toward the surface and corrects lightness in the theme’s direction until the floor is met', () => {
    expect(blendToward('oklch(80% 0.1 292)', 'oklch(20% 0 0)', 0.5)).toBe('oklch(50% 0.05 292)');
    const raised = ensureContrast('oklch(30% 0.1 292)', 'oklch(21% 0 0)', true);
    expect(contrastRatio(raised, 'oklch(21% 0 0)')).toBeGreaterThanOrEqual(4.5 - 1e-6);
    expect(parseOklch(raised).l).toBeGreaterThan(0.3);
    const lowered = ensureContrast('oklch(90% 0.1 292)', 'oklch(97% 0 0)', false);
    expect(contrastRatio(lowered, 'oklch(97% 0 0)')).toBeGreaterThanOrEqual(4.5 - 1e-6);
    expect(parseOklch(lowered).l).toBeLessThan(0.9);
    // Already clearing the floor: returned untouched.
    expect(ensureContrast('oklch(94% 0 0)', 'oklch(21% 0 0)', true)).toBe('oklch(94% 0 0)');
  });
});

/** A context the tests control; every mutation is recorded so a test can assert what a command did and did not do. */
function fakeContext(overrides: Partial<SlashContext> & { readonly refuse?: Partial<Record<ControlOp, string>> } = {}): SlashContext & { readonly log: string[] } {
  const log: string[] = [];
  const { refuse = {}, ...rest } = overrides;
  return {
    log,
    runState: 'idle', rowCount: 0, hasGit: false, models: ['alpha', 'beta'], personas: ['orchestrator', 'coder'], themes: ['rotaris-dim', 'nocturne', 'high-contrast'], providers: ['openrouter'],
    setModel: async (name) => { log.push(`setModel ${name}`); },
    setPersona: async (name) => { log.push(`setPersona ${name}`); },
    setTheme: async (name) => { log.push(`setTheme ${name}`); },
    logout: async (provider) => { log.push(`logout ${provider}`); },
    control: async (op): Promise<Result<unknown, string>> => { log.push(`control ${op}`); const refusal = refuse[op]; return refusal === undefined ? ok(undefined) : err(refusal); },
    open: (dialog) => { log.push(`open ${dialog}`); },
    stash: () => { log.push('stash'); },
    notify: (text) => { log.push(`notify ${text}`); },
    submitAsPrompt: async (text) => { log.push(`prompt ${text}`); },
    ...rest,
  };
}
const everything: CatalogueOptions['reachable'] = { 'start-session': true, sessions: true, worktree: true, search: true, theme: true, logout: true, compress: true, clear: true };
const options = (extra: Partial<CatalogueOptions> = {}): CatalogueOptions => ({ runPalette: () => undefined, stashCount: 1, reachable: everything, ...extra });
const run = (registry: ReturnType<typeof buildCatalogue>, name: string, argument: string, ctx: SlashContext): Promise<SlashOutcome> => registry.lookup(name)!.run(argument, ctx);

describe('slash — REQ-CHAT-028..033, REQ-CHAT-159: the catalogue', () => {
  it('lists the built-ins in order, then every palette entry mirrored; a mirror never displaces a built-in name', () => {
    const registry = buildCatalogue(options());
    const names = registry.list().map((c) => c.name);
    expect(names.slice(0, 15)).toEqual(['stop', 'pause', 'compress', 'clear', 'search', 'new', 'resume', 'sessions', 'worktree', 'stash', 'pop', 'model', 'persona', 'theme', 'logout']);
    for (const c of COMMANDS) {
      const name = slashName(c.label);
      const entry = registry.lookup(name);
      expect(entry, name).toBeDefined();
      if (BUILT_IN_NAMES.has(name)) continue;
      expect(entry!.description.startsWith(c.label)).toBe(true);
    }
    // REQ-CHAT-028's collapse rule and description rule, on the registry's own entries.
    expect(slashName('About & Legal')).toBe('about-legal');
    expect(slashName('Open command palette')).toBe('open-command-palette');
    expect(registry.lookup('about-legal')?.description).toBe('About & Legal');
    expect(registry.lookup('open-command-palette')?.description).toBe('Open command palette (Ctrl+K)');
    // Two palette rows labelled "Open Settings" (Ctrl+7 and Ctrl+,) yield one name; REQ-CHAT-022 keeps the later registration.
    expect(registry.list().filter((c) => c.name === 'open-settings')).toHaveLength(1);
    expect(registry.lookup('open-settings')?.description).toBe('Open Settings (Ctrl+,)');
    expect(names.length).toBe(15 + new Set(COMMANDS.map((c) => slashName(c.label))).size);
    // Every entry carries a kind from the closed set, and none is a skill: REQ-CHAT-034/162 are not built, and the catalogue says so.
    expect(registry.list().every((c) => c.kind === 'action')).toBe(true);
    expect(SKILL_COMMANDS_NOT_BUILT).toContain('REQ-CHAT-034');
  });
  it('REQ-CHAT-028: a mirror runs the palette command through the caller and takes the caller’s availability', async () => {
    const ran: string[] = [];
    const registry = createSlashRegistry();
    mirrorPalette(registry, options({ runPalette: (c) => { ran.push(c.id); }, paletteAvailable: (c) => c.id !== 'about.open' }));
    const ctx = fakeContext();
    expect(await run(registry, 'open-git', '', ctx)).toEqual({ kind: 'executed' });
    expect(ran).toEqual(['view.git']);
    expect(registry.lookup('about-legal')!.availability(ctx)).toEqual({ ok: false, reason: '/about-legal is not available right now.' });
    // A mirror registered over a built-in name is refused by the mirror, never by the registry.
    const withBuiltIns = buildCatalogue(options({ palette: [{ id: 'x', label: 'Stop', keywords: [], available: () => true, run: () => undefined }] }));
    expect(withBuiltIns.lookup('stop')?.description).toBe('Cancel the active run');
  });
  it('REQ-CHAT-029: /stop, /pause and /compress are offered only while running, else listed with "No run is active." and start nothing', async () => {
    const registry = buildCatalogue(options());
    for (const state of ['idle', 'starting', 'pausing', 'paused', 'cancelling', 'completed', 'failed', 'stopped', 'recovery'] as const) {
      const ctx = fakeContext({ runState: state });
      for (const name of ['stop', 'pause', 'compress']) expect(registry.lookup(name)!.availability(ctx), `${name} while ${state}`).toEqual({ ok: false, reason: NO_RUN_ACTIVE });
    }
    const running = fakeContext({ runState: 'running' });
    for (const name of ['stop', 'pause', 'compress']) expect(registry.lookup(name)!.availability(running)).toEqual({ ok: true });
    expect(await run(registry, 'stop', '', running)).toEqual({ kind: 'executed' });
    expect(running.log).toEqual(['control cancel']);
    expect(await run(registry, 'pause', '', running)).toEqual({ kind: 'executed' });
    expect(await run(registry, 'compress', '', running)).toEqual({ kind: 'executed' });
    expect(running.log).toEqual(['control cancel', 'control pause', 'control forceCompression']);
    // A refused control is `failed` with the refusal's own words (what the run host answers for forceCompression until Part AO).
    const refused = fakeContext({ runState: 'running', refuse: { forceCompression: 'The run host does not support forceCompression yet.' } });
    expect(await run(registry, 'compress', '', refused)).toEqual({ kind: 'failed', message: 'The run host does not support forceCompression yet.' });
    expect(registry.lookup('stop')?.description).toBe('Cancel the active run');
    expect(registry.lookup('compress')?.description).toBe('Compress agent context');
  });
  it('REQ-CHAT-030: /clear and /search need at least one transcript row', async () => {
    const registry = buildCatalogue(options());
    const empty = fakeContext({ rowCount: 0 });
    expect(registry.lookup('clear')!.availability(empty)).toEqual({ ok: false, reason: TRANSCRIPT_EMPTY });
    expect(registry.lookup('search')!.availability(empty)).toEqual({ ok: false, reason: TRANSCRIPT_EMPTY });
    const rows = fakeContext({ rowCount: 3 });
    expect(registry.lookup('clear')!.availability(rows)).toEqual({ ok: true });
    expect(await run(registry, 'search', '', rows)).toEqual({ kind: 'executed' });
    expect(await run(registry, 'clear', '', rows)).toEqual({ kind: 'executed' });
    expect(rows.log).toEqual(['open search', 'control clearTranscript']);
    expect(registry.lookup('clear')?.description).toBe('Clear the transcript');
  });
  it('REQ-CHAT-031 / REQ-LIBRARY-142: /new, /resume, /sessions, /worktree, /stash and /pop', async () => {
    const registry = buildCatalogue(options({ stashCount: 2 }));
    const ctx = fakeContext({ hasGit: true });
    expect(registry.lookup('new')?.description).toBe('Start a new session');
    expect(registry.lookup('resume')?.description).toBe('Browse and resume sessions');
    expect(registry.lookup('sessions')?.description).toBe('Browse and resume sessions');
    expect(registry.lookup('worktree')?.description).toBe('Create a git worktree');
    expect(registry.lookup('stash')?.description).toBe('Stash the composer prompt');
    expect(registry.lookup('pop')?.description).toBe('Apply a stashed prompt');
    await run(registry, 'new', '', ctx); await run(registry, 'resume', '', ctx); await run(registry, 'sessions', '', ctx); await run(registry, 'worktree', '', ctx); await run(registry, 'pop', '', ctx);
    expect(ctx.log).toEqual(['open start-session', 'open sessions', 'open sessions', 'open worktree', 'open stash']);
    expect(registry.lookup('worktree')!.availability(fakeContext({ hasGit: false }))).toEqual({ ok: false, reason: NO_GIT_SERVICE });
    // /stash takes the prompt to stash (REQ-CHAT-159's usage message without one); /pop reflects the current stash.
    expect(await run(registry, 'stash', '', ctx)).toEqual({ kind: 'failed', message: 'Usage: /stash <prompt>' });
    expect(await run(registry, 'stash', 'keep this', ctx)).toEqual({ kind: 'executed' });
    expect(ctx.log.at(-1)).toBe('stash');
    expect(buildCatalogue(options({ stashCount: 0 })).lookup('pop')!.availability(ctx)).toEqual({ ok: false, reason: STASH_EMPTY });
    // What the composer has not been given an opener for stays listed and unavailable with REQ-CHAT-020's default reason.
    const unwired = buildCatalogue(options({ reachable: {} }));
    expect(unwired.lookup('new')!.availability(ctx)).toEqual({ ok: false, reason: '/new is not available right now.' });
    expect(unwired.lookup('worktree')!.availability(ctx)).toEqual({ ok: false, reason: NO_GIT_SERVICE });
    expect(unwired.lookup('search')!.availability(fakeContext({ rowCount: 2 }))).toEqual({ ok: false, reason: '/search is not available right now.' });
  });
  it('REQ-CHAT-032: /model’s exact outcomes', async () => {
    const registry = buildCatalogue(options());
    const ctx = fakeContext({ models: ['alpha', 'beta', 'gamma'] });
    expect(registry.lookup('model')?.argumentHint).toBe('<name>');
    expect(await run(registry, 'model', '', ctx)).toEqual({ kind: 'failed', message: 'Usage: /model <name>' });
    expect(await run(registry, 'model', 'delta', ctx)).toEqual({ kind: 'failed', message: "Unknown model 'delta'. Available: alpha, beta, gamma" });
    expect(ctx.log).toEqual([]);
    expect(await run(registry, 'model', 'beta', ctx)).toEqual({ kind: 'executed' });
    expect(ctx.log).toEqual(['setModel beta', 'notify Model set to beta.']);
    expect(unknownValueMessage('model', 'x', [])).toBe("Unknown model 'x'. Available: none");
    expect(usageMessage('model', 'name')).toBe('Usage: /model <name>');
    // While no models are configured the command is listed but unavailable with the stated reason.
    expect(registry.lookup('model')!.availability(fakeContext({ models: [] }))).toEqual({ ok: false, reason: NO_MODELS });
    // The change failing is `failed` with the raised error's message (REQ-CHAT-020).
    const failing = fakeContext({ setModel: async () => { throw new Error('The configuration file could not be written.'); } });
    expect(await run(registry, 'model', 'alpha', failing)).toEqual({ kind: 'failed', message: 'The configuration file could not be written.' });
    expect(failing.log).toEqual([]);
  });
  it('REQ-CHAT-033 and REQ-CHAT-159: /persona, /theme (case-insensitive) and /logout follow the same pattern', async () => {
    const registry = buildCatalogue(options());
    const ctx = fakeContext();
    expect(await run(registry, 'persona', '', ctx)).toEqual({ kind: 'failed', message: 'Usage: /persona <name>' });
    expect(await run(registry, 'persona', 'nope', ctx)).toEqual({ kind: 'failed', message: "Unknown persona 'nope'. Available: orchestrator, coder" });
    expect(await run(registry, 'persona', 'coder', ctx)).toEqual({ kind: 'executed' });
    expect(await run(registry, 'theme', '', ctx)).toEqual({ kind: 'failed', message: 'Usage: /theme <name>' });
    expect(await run(registry, 'theme', 'NOCTURNE', ctx)).toEqual({ kind: 'executed' });
    expect(await run(registry, 'theme', 'daylight', ctx)).toEqual({ kind: 'failed', message: "Unknown theme 'daylight'. Available: rotaris-dim, nocturne, high-contrast" });
    expect(await run(registry, 'logout', '', ctx)).toEqual({ kind: 'failed', message: 'Usage: /logout <provider>' });
    expect(await run(registry, 'logout', 'openrouter', ctx)).toEqual({ kind: 'executed' });
    expect(ctx.log).toEqual(['setPersona coder', 'notify Persona set to coder.', 'setTheme nocturne', 'notify Theme set to nocturne.', 'logout openrouter', 'notify Signed out of openrouter.']);
    // Unwired: listed, unavailable, the default reason.
    const unwired = buildCatalogue(options({ reachable: {} }));
    expect(unwired.lookup('theme')!.availability(ctx)).toEqual({ ok: false, reason: '/theme is not available right now.' });
    expect(unwired.lookup('logout')!.availability(ctx)).toEqual({ ok: false, reason: '/logout is not available right now.' });
  });
  it('REQ-CHAT-028: the mirrored description is the label with the chord appended, and the name is the label’s normal form', () => {
    for (const c of COMMANDS) expect(slashDescription(c)).toBe(c.shortcut ? `${c.label} (${c.shortcut})` : c.label);
  });
});
