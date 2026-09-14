import { skillLoadedToast, type SkillRow, type SkillsState } from '@rotaris/contracts';
import type { SlashCommand, SlashContext, SlashOutcome, SlashRegistry } from './types.js';

/**
 * ADR-0063 — one composer command per user-invocable skill (REQ-CHAT-034, REQ-WORKSPACE-072), modelled on
 * `slash/prompts.ts`: the same bind-reader / cached-answer / register-after-the-built-ins shape, and the same
 * two defects it exists to avoid (AO-1: a registry rebuilt by its memo must not re-read the source; AO-2: a
 * read in flight must land on the live registry, not the one it started against).
 *
 * The naming and the collision rule live **here** and not in the run host, because the catalogue that holds
 * the other names lives here — which is exactly why REQ-CHAT-160's equivalents are here too.
 */

/**
 * REQ-SHELL-056's **catalogue normal form** — lower-cased, each run of whitespace or underscores replaced by
 * a single hyphen, every character outside `a`–`z`, `0`–`9` and `-` **removed**, leading and trailing hyphens
 * trimmed. A declared name reducing to the empty string yields no entry at all.
 *
 * It is NOT REQ-WORKSPACE-054's skill normal form, which replaces every non-alphanumeric run with a hyphen
 * rather than deleting the characters: `c++ build` is the skill `c-build` and the command `/cbuild`. The two
 * disagree, that disagreement is **ESC-39**, and until it is ruled the skill's own form stays its identity
 * everywhere (the policy maps, the catalog block, the table) while this form names the typed command alone —
 * which is what REQ-SHELL-056 says it contributes.
 */
export function catalogueNormalForm(declared: string): string {
  return declared.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
}

/** REQ-WORKSPACE-072: a slash-trigger keyword contributes a command too — leading `/` stripped, then normalised. */
export function triggerCommandName(keyword: string): string {
  return catalogueNormalForm(keyword.replace(/^\/+/, ''));
}

/**
 * REQ-SHELL-056's collision rule: a built-in command **always** wins its name, and a generated entry whose
 * name is taken is offered under the first free `-2`, `-3`, … so that a skill is never silently unreachable
 * and a built-in never changes meaning because a skill was installed.
 *
 * REQ-CHAT-034 states the opposite — the registration "is skipped" — and that is **ESC-39**. Suffixing is the
 * reading built: under it the command holding the name does keep it, which is REQ-CHAT-034's own first
 * clause, whereas under skipping REQ-SHELL-056's "never silently unreachable" is simply false.
 */
export function freeName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${name}-${n}`;
    if (!taken(candidate)) return candidate;
  }
  return `${name}-${Date.now()}`;
}

/** REQ-SHELL-056: the skill's own one-line description, else a sentence stating it is available and naming it. */
export function skillCommandDescription(skill: SkillRow, renamed: boolean): string {
  const base = skill.description.trim() === '' ? `Skill ${skill.name} is available.` : skill.description;
  // A renamed entry additionally names the skill it came from, so a `-2` suffix is never unexplained.
  return renamed ? `${base} (skill: ${skill.name})` : base;
}

export interface SkillRegistration {
  readonly name: string;
  readonly skill: SkillRow;
  readonly renamed: boolean;
}

/**
 * The names a skill set yields, in the catalog's own ascending-name order: each user-invocable skill under its
 * declared name in catalogue normal form and under each of its slash-trigger keywords, suffixed where taken.
 *
 * `taken` is every name the registry already holds — the built-ins and the palette mirrors — which keep
 * theirs. A skill that is not user-invocable yields nothing: REQ-CHAT-034 removes an `auto-only` skill from
 * the catalogue entirely, and REQ-WORKSPACE-062 removes one whose load mode is `off`. Both are already
 * resolved into `userInvocable` by the run host, so this function makes no policy decision of its own.
 */
export function skillRegistrations(skills: readonly SkillRow[], taken: (name: string) => boolean): { registrations: SkillRegistration[]; skipped: { name: string; reason: string }[] } {
  const registrations: SkillRegistration[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const claimed = new Set<string>();
  const held = (candidate: string) => claimed.has(candidate) || taken(candidate);
  for (const skill of skills) {
    if (!skill.userInvocable) continue;
    const wanted = [catalogueNormalForm(skill.declaredName), ...skill.triggers.map(triggerCommandName)];
    let any = false;
    for (const base of wanted) {
      if (base === '') continue;
      if (claimed.has(base) && registrations.some((r) => r.name === base && r.skill.name === skill.name)) continue;
      const name = freeName(base, held);
      registrations.push({ name, skill, renamed: name !== base });
      claimed.add(name);
      any = true;
    }
    // A declared name and every trigger normalising to nothing: the skill is in the catalog and has no command.
    if (!any) skipped.push({ name: skill.name, reason: 'its declared name and triggers all normalise to an empty command name' });
  }
  return { registrations, skipped };
}

function skillCommand(registration: SkillRegistration): SlashCommand {
  const { skill } = registration;
  return {
    name: registration.name,
    // REQ-CHAT-025: the closed set of kind badges; `skill` has existed since Part AN for exactly this.
    kind: 'skill',
    description: skillCommandDescription(skill, registration.renamed),
    availability: () => ({ ok: true }),
    /*
     * REQ-WORKSPACE-073 / REQ-CHAT-034: invoking force-loads the skill for the session and shows the toast;
     * with skills switched off it fails with "Skills are disabled. Enable them in Settings." and leaves the
     * skill's load mode as it was. The refusal text comes back from the run host, which reads the SAVED
     * configuration — the composer never decides it, so a stale snapshot cannot make the wrong claim.
     *
     * The typed command text is NOT submitted to the model as a prompt (REQ-WORKSPACE-077's withdrawal says
     * so in as many words): the body reaching the next agent is the whole of what invoking does.
     */
    run: async (_argument: string, ctx: SlashContext): Promise<SlashOutcome> => {
      try {
        const r = await ctx.forceLoadSkill(skill.name);
        if (!r.ok) return { kind: 'failed', message: r.reason };
        ctx.notify(skillLoadedToast(skill.name));
        return { kind: 'executed' };
      } catch (cause) {
        return { kind: 'failed', message: cause instanceof Error ? cause.message : String(cause) };
      }
    },
  };
}

/**
 * The renderer's reader of the catalog, bound once for the window. `packages/ui` never holds the bridge; the
 * renderer binds this and the composer's binder calls it. Absent (a test, a window with no workspace), no
 * skill command registers.
 */
let skillsReader: (() => Promise<SkillsState>) | null = null;
/**
 * Defect AO-2's shape, applied here: the reader's LAST answer, kept beside the reader rather than in the
 * registrar's state, so a registry rebuilt by the catalogue's memo takes it synchronously instead of reading
 * again. Binding a reader is what says the window or its workspace changed, and is therefore what clears it.
 */
let lastSkills: SkillsState | null = null;
export function bindSkillsReader(reader: (() => Promise<SkillsState>) | null): void {
  skillsReader = reader;
  lastSkills = null;
}
export function cachedSkills(): SkillsState | null {
  return lastSkills;
}
export function readSkills(): Promise<SkillsState> | null {
  if (skillsReader === null) return null;
  // Cached HERE, not by the caller: a read still in flight when the registrar is rebuilt is this window's
  // answer all the same, and the rebuilt registrar takes it rather than asking the run host again.
  return skillsReader().then((state) => { lastSkills = state; return state; });
}

/**
 * Register every user-invocable skill on the catalogue's registry. A name a built-in or a palette mirror holds
 * is kept by its holder and the skill takes a suffixed one (REQ-SHELL-056); names a previous call of THIS
 * function claimed are replaced in place, so a re-read after a rescan does not mistake its own work for
 * somebody else's holder — the same rule `registerPromptCommands` follows and for the same reason.
 *
 * With `skills.enabled` false the state carries no user-invocable skill, so nothing registers: REQ-CHAT-034's
 * "skills are turned off" case needs no branch here.
 */
/**
 * REQ-CHAT-162's second half — `/skill <path>`, loading a skill from a path. It follows REQ-WORKSPACE-057's
 * rules, surfaces a load failure without registering anything, and on success re-registers the skill commands
 * and reports the loaded skill's name.
 *
 * **It is also where REQ-WORKSPACE-057's DIRECTORY form stays reachable.** REQ-WORKSPACE-151's chooser is a
 * file chooser on Windows and Linux because no platform dialog there offers "a file or a directory" (OQ-59);
 * a typed path needs no dialog, so the capability the specification states is not lost — only the dialog is
 * narrower on two of three hosts.
 *
 * REQ-CHAT-162's FIRST half — a `/skills` command listing the catalog into the transcript as one saved system
 * row — is **not built**, and `SKILLS_LISTING_NOT_BUILT` says so where it would be registered. It needs a row
 * written through the session writer, which is the run host's and reaches no renderer today; every fact that
 * listing would carry is in the Settings Skills tab, which REQ-CHAT-162 requires anyway ("Both capabilities
 * MUST also be reachable from the settings surface that manages skills").
 */
export const SKILLS_LISTING_NOT_BUILT = 'The /skills listing (REQ-CHAT-162) is not built: it writes a saved system row, which only the run host can do and no renderer command reaches. The same catalog is read in Settings › Skills, which that requirement requires as well.';

export const SKILL_COMMAND_NAME = 'skill';
export const skillLoadUsage = (): string => 'Usage: /skill <path to a SKILL.md file or a directory containing one>';

export function skillPathCommand(load: (path: string) => Promise<{ ok: true; name: string } | { ok: false; reason: string }>, onLoaded: () => void): SlashCommand {
  return {
    name: SKILL_COMMAND_NAME,
    description: 'Load a skill from a path for this session',
    argumentHint: '<path>',
    kind: 'skill',
    availability: () => ({ ok: true }),
    run: async (argument: string, ctx: SlashContext): Promise<SlashOutcome> => {
      // REQ-CHAT-159's pattern: no argument fails with a usage message naming the command and its argument.
      if (argument.trim() === '') return { kind: 'failed', message: skillLoadUsage() };
      try {
        const r = await load(argument.trim());
        // REQ-CHAT-162: a failure surfaces the reason and registers nothing.
        if (!r.ok) return { kind: 'failed', message: r.reason };
        onLoaded();
        ctx.notify(`Skill loaded for this session: ${r.name}`);
        return { kind: 'executed' };
      } catch (cause) {
        return { kind: 'failed', message: cause instanceof Error ? cause.message : String(cause) };
      }
    },
  };
}

export function registerSkillCommands(registry: SlashRegistry, state: SkillsState, previouslyRegistered: ReadonlySet<string> = new Set()): { names: string[]; skipped: { name: string; reason: string }[] } {
  const { registrations, skipped } = skillRegistrations(state.skills, (name) => {
    const holder = registry.lookup(name);
    return holder !== undefined && holder.kind !== 'skill' && !previouslyRegistered.has(name);
  });
  const wanted = new Set(registrations.map((r) => r.name));
  /*
   * REQ-CHAT-034: "After a skill rescan, the catalogue MUST list exactly the rescanned set." A skill deleted
   * from disk, switched to `hidden`, or made `auto-only` must lose its command — registering the survivors is
   * not enough, because the registry replaces and never removes on its own. Only names THIS registrar put on
   * THIS registry are removed; a built-in or a mirror is nobody's to take away.
   */
  for (const name of previouslyRegistered) {
    if (wanted.has(name)) continue;
    if (registry.lookup(name)?.kind === 'skill') registry.unregister(name);
  }
  for (const r of registrations) registry.register(skillCommand(r));
  return { names: registrations.map((r) => r.name), skipped };
}
