import { COMMANDS, slashDescription, slashName, type Command } from '../commands/registry.js';
import { defaultUnavailableReason } from './parse.js';
import { cachedPromptRoots, registerPromptCommands } from './prompts.js'; // Part AO
import { createSlashRegistry } from './registry.js';
import type { Availability, SlashCommand, SlashContext, SlashOutcome, SlashRegistry } from './types.js';

/**
 * Part AN — REQ-CHAT-028's membership: the built-in commands of REQ-CHAT-029..033 and REQ-CHAT-159, then every
 * command-palette entry mirrored from `commands/registry.ts` (REQ-SHELL-048's one vocabulary, its third surface,
 * REQ-SHELL-056). The catalogue is a value built from what the composer can reach; it is rebuilt whenever one of
 * its inputs changes (REQ-CHAT-028, REQ-LIBRARY-142), and the gating that depends on live state (the run state,
 * the transcript, the configured models) is read from the context at the moment it is asked, so no rebuild is needed
 * for those to be right.
 *
 * **What is NOT here, and why.**
 * - Skill commands (REQ-CHAT-034, REQ-CHAT-162 — a command per user-invocable skill, `/skills`, `/skill <path>`)
 *   are not built: skill discovery (REQ-WORKSPACE-056..064) does not exist, so there is no set to list, no invocation
 *   mode to derive and no `skills.enabled` switch to consult. `SKILL_COMMANDS_NOT_BUILT` states it where the entries
 *   would be registered. The `skill` kind badge exists so nothing needs to change in the popup when they arrive.
 * - Prompt-file commands (REQ-CHAT-160/161) are Part AO's and register through `SlashRegistry.register` with the
 *   `prompt` kind, after the built-ins, so a stem colliding with a built-in name is skipped by the caller as REQ-CHAT-160
 *   says ("the command already holding it keeps it").
 */
export const SKILL_COMMANDS_NOT_BUILT = 'Skill commands (REQ-CHAT-034, REQ-CHAT-162) are not built: skill discovery (REQ-WORKSPACE-056..064) does not exist yet, so the catalogue lists no skill and offers no /skills or /skill.';

/** What the composer cannot answer from its own props, and therefore states as reachable or not when it builds the catalogue. */
export interface CatalogueOptions {
  /** REQ-CHAT-028: the palette's table; the default is the registry's own `COMMANDS`. */
  readonly palette?: readonly Command[];
  /** How a mirrored palette entry runs and whether it is available: the caller owns the `CommandContext`, this module never reaches the shell state. */
  readonly runPalette: (command: Command) => void;
  readonly paletteAvailable?: (command: Command) => boolean;
  /** REQ-LIBRARY-142: `/pop` reflects the current stash. */
  readonly stashCount: number;
  /**
   * The dialogs and services the composer has been given an opener for. A command whose opener is absent stays listed
   * and is unavailable with REQ-CHAT-020's default reason, rather than failing after the composer was cleared.
   */
  readonly reachable: Readonly<Partial<Record<Reachable, boolean>>>;
}
export type Reachable = 'start-session' | 'sessions' | 'worktree' | 'search' | 'theme' | 'logout' | 'compress' | 'clear';

const ok: Availability = { ok: true };
const unavailable = (reason: string): Availability => ({ ok: false, reason });
const executed: SlashOutcome = { kind: 'executed' };
const failed = (message: string): SlashOutcome => ({ kind: 'failed', message });

/** REQ-CHAT-029: offered only while the frontend reports a run in the RUNNING state; every other state is listed but unavailable with this reason. */
export const NO_RUN_ACTIVE = 'No run is active.';
/** REQ-CHAT-030: `/clear` and `/search` against an empty transcript. */
export const TRANSCRIPT_EMPTY = 'The transcript is empty.';
/** REQ-CHAT-031: `/worktree` when no git service exists. */
export const NO_GIT_SERVICE = 'No git service is available for this workspace.';
/** REQ-CHAT-032: `/model` while no models are configured. */
export const NO_MODELS = 'No models are configured. Choose one in Settings.';
/** REQ-CHAT-033 mirrors REQ-CHAT-032; the requirement fixes no sentence for the persona case, so the model sentence's shape is reused. */
export const NO_PERSONAS = 'No personas are configured. Choose one in Settings.';
/** REQ-CHAT-043's own sentence, reused as `/pop`'s reason while the stash is empty (REQ-LIBRARY-142: "always reflect the current stash"). */
export const STASH_EMPTY = 'No stashed prompts. Use Stash beside the composer first.';
/** REQ-CHAT-159 for `/logout` while the provider list is empty. */
export const NO_PROVIDERS = 'No providers are configured. Choose one in Settings.';

/**
 * REQ-CHAT-032 / REQ-CHAT-159 — the outcome pattern every argument-taking command follows: no argument → the usage
 * message naming the command and its argument; an unrecognised value → a message naming the rejected value and listing
 * what is available, in the source's own order and uncapped (the literal `none` when nothing is configured); success →
 * apply and report what was set. The separator is `, ` — read by a person, never parsed.
 */
export function usageMessage(name: string, argument: string): string {
  return `Usage: /${name} <${argument}>`;
}
export function unknownValueMessage(noun: string, value: string, available: readonly string[]): string {
  return `Unknown ${noun} '${value}'. Available: ${available.length === 0 ? 'none' : available.join(', ')}`;
}

/** REQ-CHAT-159: `/theme` matches registered theme names case-insensitively; the other value commands match exactly, as their sources list them. */
function pick(available: readonly string[], value: string, caseInsensitive: boolean): string | undefined {
  if (!caseInsensitive) return available.includes(value) ? value : undefined;
  const wanted = value.toLowerCase();
  return available.find((v) => v.toLowerCase() === wanted);
}

/** The outcome of a `SlashContext` call that may throw: REQ-CHAT-020's `failed` carries the raised error's message. */
async function attempt(action: () => Promise<void>): Promise<SlashOutcome> {
  try {
    await action();
    return executed;
  } catch (cause) {
    return failed(cause instanceof Error ? cause.message : String(cause));
  }
}

/**
 * A value command in REQ-CHAT-159's pattern. `apply` performs the change (throwing to fail), `report` is the notice
 * shown on success ("Model set to <name>."), `unavailableWhenEmpty` the reason listed while the source holds nothing.
 */
function valueCommand(input: {
  readonly name: string; readonly description: string; readonly noun: string; readonly hint: string; readonly caseInsensitive?: boolean;
  readonly values: (ctx: SlashContext) => readonly string[]; readonly reachable: (ctx: SlashContext) => Availability;
  readonly apply: (value: string, ctx: SlashContext) => Promise<void>; readonly report: (value: string) => string;
}): SlashCommand {
  return {
    name: input.name, description: input.description, argumentHint: `<${input.hint}>`, kind: 'action',
    availability: (ctx) => input.reachable(ctx),
    run: async (argument, ctx) => {
      if (argument === '') return failed(usageMessage(input.name, input.hint));
      const available = input.values(ctx);
      const chosen = pick(available, argument, input.caseInsensitive === true);
      if (chosen === undefined) return failed(unknownValueMessage(input.noun, argument, available));
      const outcome = await attempt(() => input.apply(chosen, ctx));
      if (outcome.kind === 'executed') ctx.notify(input.report(chosen));
      return outcome;
    },
  };
}

/** REQ-CHAT-029's gate: the frontend's run state is `running`, and nothing else (`starting`, `pausing`, `paused`, `recovery` are all "no run is active" here). */
const whileRunning = (ctx: SlashContext): Availability => (ctx.runState === 'running' ? ok : unavailable(NO_RUN_ACTIVE));
/** REQ-CHAT-030's gate. */
const whileRows = (ctx: SlashContext): Availability => (ctx.rowCount > 0 ? ok : unavailable(TRANSCRIPT_EMPTY));

/** A control operation's `Result<unknown, string>` turned into an outcome: the refusal's own text is the failure message. */
async function controlOutcome(ctx: SlashContext, op: Parameters<SlashContext['control']>[0]): Promise<SlashOutcome> {
  try {
    const r = await ctx.control(op);
    return r.ok ? executed : failed(r.error);
  } catch (cause) {
    return failed(cause instanceof Error ? cause.message : String(cause));
  }
}

/**
 * REQ-CHAT-029..033, REQ-CHAT-159 and REQ-LIBRARY-142: the built-in commands, in the order the catalogue lists them
 * when nothing is typed after the slash. Each availability reads the context at the moment it is asked.
 */
export function builtInCommands(options: CatalogueOptions): readonly SlashCommand[] {
  const reach = (key: Reachable, name: string, otherwise: Availability = ok): Availability => (options.reachable[key] === true ? otherwise : unavailable(defaultUnavailableReason(name)));
  return [
    // REQ-CHAT-029: `/stop` accepted during a live run cancels it and sends no text to any agent. The typed command is the
    // user's deliberate act, so it takes the cancel directly (graceful, as the Stop control's first activation does).
    { name: 'stop', description: 'Cancel the active run', kind: 'action', availability: whileRunning, run: (_a, ctx) => controlOutcome(ctx, 'cancel') },
    // REQ-CHAT-029 fixes `/pause`'s gating and no description; this wording is the composer's, matching REQ-MONITOR-123's control.
    { name: 'pause', description: 'Pause the active run', kind: 'action', availability: whileRunning, run: (_a, ctx) => controlOutcome(ctx, 'pause') },
    // REQ-CHAT-029: `forceCompression` is a control op with no arm in the run host until Part AO; until then the
    // dispatch answers a refusal and the command reports `failed` with it — stated, not hidden (see WorkspaceView's control).
    { name: 'compress', description: 'Compress agent context', kind: 'action', availability: (ctx) => reach('compress', 'compress', whileRunning(ctx)), run: (_a, ctx) => controlOutcome(ctx, 'forceCompression') },
    // REQ-CHAT-030: `clearTranscript` likewise has no arm until Part AO; the toolbar Clear and its confirmation (REQ-CHAT-073/082/083) are AO's too.
    { name: 'clear', description: 'Clear the transcript', kind: 'action', availability: (ctx) => reach('clear', 'clear', whileRows(ctx)), run: (_a, ctx) => controlOutcome(ctx, 'clearTranscript') },
    // REQ-CHAT-030 fixes `/search`'s gating and no description; it opens REQ-CHAT-074's panel, the same surface Ctrl+F opens.
    { name: 'search', description: 'Search the transcript', kind: 'action', availability: (ctx) => reach('search', 'search', whileRows(ctx)), run: (_a, ctx) => attempt(async () => ctx.open('search')) },
    // REQ-CHAT-031.
    { name: 'new', description: 'Start a new session', kind: 'action', availability: () => reach('start-session', 'new'), run: (_a, ctx) => attempt(async () => ctx.open('start-session')) },
    { name: 'resume', description: 'Browse and resume sessions', kind: 'action', availability: () => reach('sessions', 'resume'), run: (_a, ctx) => attempt(async () => ctx.open('sessions')) },
    { name: 'sessions', description: 'Browse and resume sessions', kind: 'action', availability: () => reach('sessions', 'sessions'), run: (_a, ctx) => attempt(async () => ctx.open('sessions')) },
    { name: 'worktree', description: 'Create a git worktree', kind: 'action', availability: (ctx) => (options.reachable.worktree === true && ctx.hasGit ? ok : unavailable(NO_GIT_SERVICE)), run: (_a, ctx) => attempt(async () => ctx.open('worktree')) },
    /*
     * REQ-CHAT-031 / REQ-LIBRARY-142: `/stash` "stashes the composer's current text exactly as the composer's Stash
     * button does". REQ-CHAT-019 has already cleared the composer when a command runs, and a slash command is one line,
     * so the composer's text at that moment is the command line itself: the prompt to stash is what follows the name.
     * `/stash <prompt>` therefore takes an argument and, by REQ-CHAT-159, fails with a usage message without one — the
     * button's own no-text behaviour (focus, nothing pushed) would be a silent no-op here. The seam's `stash(text)`
     * takes that argument (the change was ruled into the plan on 2026-09-09).
     */
    { name: 'stash', description: 'Stash the composer prompt', argumentHint: '<prompt>', kind: 'action', availability: () => ok, run: async (argument, ctx) => (argument === '' ? failed(usageMessage('stash', 'prompt')) : attempt(async () => ctx.stash(argument))) },
    // REQ-CHAT-031 / REQ-LIBRARY-142: `/pop` opens the dialog and removes nothing itself; the user's Apply or Pop decides.
    { name: 'pop', description: 'Apply a stashed prompt', kind: 'action', availability: () => (options.stashCount > 0 ? ok : unavailable(STASH_EMPTY)), run: (_a, ctx) => attempt(async () => ctx.open('stash')) },
    /*
     * REQ-CHAT-032. The "withheld by the provider" limb ("<name> is unavailable. <reason>") is NOT built: the composer
     * receives the configured model names and nothing about a provider's verdict on each (`SessionRecord`/`ConfigSnapshot`
     * carry no such field), so there is no reason to quote. It is recorded here and in the handoff rather than faked.
     */
    valueCommand({
      name: 'model', description: 'Switch the model', noun: 'model', hint: 'name',
      values: (ctx) => ctx.models, reachable: (ctx) => (ctx.models.length === 0 ? unavailable(NO_MODELS) : ok),
      apply: (value, ctx) => ctx.setModel(value), report: (value) => `Model set to ${value}.`,
    }),
    // REQ-CHAT-033 mirrors REQ-CHAT-032.
    valueCommand({
      name: 'persona', description: 'Switch the persona', noun: 'persona', hint: 'name',
      values: (ctx) => ctx.personas, reachable: (ctx) => (ctx.personas.length === 0 ? unavailable(NO_PERSONAS) : ok),
      apply: (value, ctx) => ctx.setPersona(value), report: (value) => `Persona set to ${value}.`,
    }),
    // REQ-CHAT-159: `/theme <name>`, case-insensitive against the registered theme names; the value vocabulary is the settings domain's.
    valueCommand({
      name: 'theme', description: 'Switch the theme', noun: 'theme', hint: 'name', caseInsensitive: true,
      values: (ctx) => ctx.themes, reachable: () => reach('theme', 'theme'),
      apply: (value, ctx) => ctx.setTheme(value), report: (value) => `Theme set to ${value}.`,
    }),
    // REQ-CHAT-159: `/logout <provider>`; the value vocabulary is the model-provider domain's.
    valueCommand({
      name: 'logout', description: 'Sign out of a provider', noun: 'provider', hint: 'provider',
      values: (ctx) => ctx.providers, reachable: (ctx) => reach('logout', 'logout', ctx.providers.length === 0 ? unavailable(NO_PROVIDERS) : ok),
      apply: (value, ctx) => ctx.logout(value), report: (value) => `Signed out of ${value}.`,
    }),
    // REQ-CHAT-034 / REQ-CHAT-162 would register here. See SKILL_COMMANDS_NOT_BUILT.
  ];
}

/**
 * REQ-CHAT-028: every palette entry as a slash command — the name is the label lowercased with each run of characters
 * outside `[a-z0-9:_.-]` collapsed to one `-` (`slashName`, the registry's own normal form), the description the label
 * with ` (<shortcut>)` appended where a shortcut exists (`slashDescription`). A mirror whose name REQ-CHAT-029..031 or
 * REQ-CHAT-159 already defines does NOT displace the built-in (the built-in's description, behaviour and gating are what
 * the user gets); two palette rows with one label ("Open Settings" under Ctrl+7 and under Ctrl+,) yield one name, and
 * REQ-CHAT-022's replacement rule keeps the later one — its description says which chord it carries.
 */
export function mirrorPalette(registry: SlashRegistry, options: CatalogueOptions): void {
  for (const command of options.palette ?? COMMANDS) {
    const name = slashName(command.label);
    if (BUILT_IN_NAMES.has(name)) continue;
    registry.register({
      name,
      description: slashDescription(command),
      kind: 'action',
      availability: () => ((options.paletteAvailable?.(command) ?? true) ? ok : unavailable(defaultUnavailableReason(name))),
      run: async () => attempt(async () => options.runPalette(command)),
    });
  }
}

/** The names REQ-CHAT-029..031 and REQ-CHAT-159 define — the ones a mirror may never displace (REQ-CHAT-028). */
export const BUILT_IN_NAMES: ReadonlySet<string> = new Set(['stop', 'pause', 'compress', 'clear', 'search', 'new', 'resume', 'sessions', 'worktree', 'stash', 'pop', 'model', 'persona', 'theme', 'logout']);

/** The catalogue: the built-ins in their order, then the palette mirrors. Later parts add to the returned registry. */
export function buildCatalogue(options: CatalogueOptions): SlashRegistry {
  const registry = createSlashRegistry();
  for (const command of builtInCommands(options)) registry.register(command);
  mirrorPalette(registry, options);
  // Part AO — defect AO-2: the prompt-file commands (REQ-CHAT-160) join the catalogue HERE, from the answer kept beside
  // the reader in `slash/prompts.ts`, and not only from the registrar's effect. The composer's popup list is a memo of the
  // text and THIS registry, and this registry is rebuilt whenever the stash count, the reachable set or the command
  // context changes: a command registered after that memo ran is invisible until the next keystroke, which is what made
  // `chat-controls-proof` red with the roots already read and both names registered. Registered LAST, so a name a built-in
  // or a mirror holds stays with its holder (REQ-CHAT-160); `slash/controls.tsx` still reads the roots, re-registers when
  // they change, and is what fills the cache this line reads.
  const prompts = cachedPromptRoots();
  if (prompts !== null) registerPromptCommands(registry, prompts);
  return registry;
}
