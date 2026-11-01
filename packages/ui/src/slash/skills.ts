import { SKILLS_DISCOVERING_CODE, SKILLS_DISCOVERY_STALLED_CODE, SKILLS_NO_REPLY_CODE, skillLoadedToast, type SkillRow, type SkillsState } from '@rotaris/contracts';
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
 * rather than deleting the characters: `c++/build` is the skill `c-build` and the command `/cbuild`. ESC-39,
 * ruled 2026-09-27, keeps the two forms deliberately apart: the skill's own form is its identity everywhere
 * (the policy maps, the catalog block, the table) while this form names the typed command alone — which is
 * what REQ-SHELL-056 says it contributes and what the amended REQ-CHAT-034 cites.
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
 * REQ-CHAT-034 once skipped the registration instead. ESC-39 ruled for suffixing on 2026-09-27 and
 * REQ-CHAT-034 now cites this rule: the command holding the name keeps it, and no skill is unreachable.
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
/**
 * Defect AO-3's shape, applied here for the same reason: THREE effects start a read while a window settles — the
 * registrar's, when nothing is cached, the configuration key's, and the rescan counter's — and none can see the
 * others. Before the first answer there is nothing to find, so each reads. The comment below used to claim a read in
 * flight was already this window's answer; it was not, because the read was never handed back. It is now.
 */
let skillsInFlight: Promise<SkillsState> | null = null;
export function bindSkillsReader(reader: (() => Promise<SkillsState>) | null): void {
  skillsReader = reader;
  lastSkills = null;
  skillsInFlight = null;
}
export function cachedSkills(): SkillsState | null {
  return lastSkills;
}
export function readSkills(): Promise<SkillsState> | null {
  if (skillsReader === null) return null;
  // Cached HERE, not by the caller: a read still in flight when the registrar is rebuilt is this window's
  // answer all the same, and the rebuilt registrar takes it rather than asking the run host again.
  if (skillsInFlight !== null) return skillsInFlight;
  const answered = skillsReader().then((state) => { lastSkills = state; return state; });
  const p: Promise<SkillsState> = answered.finally(() => { if (skillsInFlight === p) skillsInFlight = null; });
  skillsInFlight = p;
  return p;
}

/** The one shape of a skills read's answer `askUntilDiscovered` reads: the renderer's command outcome is one. */
export type SkillsAsked = { readonly ok: true } | { readonly ok: false; readonly code?: string | undefined };

/** OQ-386 point 1: a refusal saying the catalogue is on its way, which is not an answer about the catalogue. */
export function stillDiscovering(asked: SkillsAsked): boolean {
  return !asked.ok && (asked.code === SKILLS_DISCOVERING_CODE || asked.code === SKILLS_DISCOVERY_STALLED_CODE || asked.code === SKILLS_NO_REPLY_CODE);
}

/**
 * OQ-386 point 1 with REQ-CHAT-034 — a read of the catalogue that comes to hold it without anyone doing anything. A warm-up
 * in flight refuses a read at its bound and goes on; the walk ending announces nothing, so the read is simply made again. It
 * cannot spin: the run host holds each `skills.read` until the walk ends or the read's whole bound has passed, also on a stalled
 * walk (`SkillHost.settled`), and main's no-reply refusal takes its whole bound, which is also why the catalogue lands the moment the walk ends rather than at a poll's next tick.
 *
 * Each refusal goes to `onWaiting` for the surface to name; what comes back is the first thing that is an answer. `gone` says the
 * asker no longer wants one, and null is returned at the next answer rather than asking again.
 */
export async function askUntilDiscovered<A extends SkillsAsked>(ask: () => Promise<A>, onWaiting: (refused: A) => void = () => undefined, gone: () => boolean = () => false): Promise<A | null> {
  for (;;) {
    const asked = await ask();
    if (gone()) return null;
    if (!stillDiscovering(asked)) return asked;
    onWaiting(asked);
  }
}

/**
 * REQ-CHAT-162's second half — `/skill <path>`, loading a skill from a path. It follows REQ-WORKSPACE-057's
 * rules, surfaces a load failure without registering anything, and on success re-registers the skill commands
 * and reports the loaded skill's name.
 *
 * **It is also where REQ-WORKSPACE-057's DIRECTORY form stays reachable.** REQ-WORKSPACE-151's chooser is a
 * file chooser on Windows and Linux because no platform dialog there offers "a file or a directory" (OQ-59);
 * a typed path needs no dialog, so the capability the specification states is not lost — only the dialog is
 * narrower on two of three hosts.
 */
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

/**
 * REQ-CHAT-162's FIRST half — `/skills`, listing the discovered skills into the transcript as **one saved system
 * row**. The row is written by the run host through the followed session's own writer, so it is saved with the
 * session and drawn in every window following it by the same publication every other row takes; the composer only
 * asks and reports a refusal. What the row carries, and how it reads back, is `contracts/skills.ts`'s.
 *
 * Replaced `SKILLS_LISTING_NOT_BUILT` (2026-09-27, `first-release-plan.md` §2.2), which said the listing needed a
 * row "only the run host can do and no renderer command reaches" — `skills.list` is that command. It takes no
 * argument; like `/clear`, text after the name is not read.
 */
export const SKILLS_LIST_COMMAND_NAME = 'skills';
export const SKILLS_LIST_DESCRIPTION = 'List the discovered skills in the transcript';

export function skillsListCommand(list: () => Promise<{ ok: true; count: number } | { ok: false; reason: string }>): SlashCommand {
  return {
    name: SKILLS_LIST_COMMAND_NAME,
    description: SKILLS_LIST_DESCRIPTION,
    kind: 'skill',
    availability: () => ({ ok: true }),
    run: async (): Promise<SlashOutcome> => {
      try {
        const r = await list();
        // The row that appears IS the report — it states how many skills it lists (REQ-CHAT-162) — so success adds
        // no toast of its own; a refusal (no session, a session not loaded, a store failure) comes back as `failed`.
        return r.ok ? { kind: 'executed' } : { kind: 'failed', message: r.reason };
      } catch (cause) {
        return { kind: 'failed', message: cause instanceof Error ? cause.message : String(cause) };
      }
    },
  };
}

/**
 * REQ-SHELL-056: "Built-in commands SHALL always win a name collision." `/skill` and `/skills` are catalogue
 * commands (REQ-CHAT-162), and they carry the `skill` kind badge — which is exactly what the generated entries
 * carry, so the registrar's "a holder of kind `skill` is mine" rule cannot tell them apart. Named here so a skill
 * declaring either name is offered `-2`, whatever order the two registrations happen to run in.
 *
 * Found by building `/skills` (2026-09-27): before this, a skill named `skill` REPLACED `/skill <path>` when the
 * generated commands registered after it, and was itself silently replaced when they registered before —
 * `docs/defects/fixed/a-skill-named-skill-takes-the-skill-command.md`.
 *
 * The prompt-file registrar holds the same two names for the same reason (REQ-CHAT-160: "the command already
 * holding it keeps it"): both fixed commands register by effect, after the prompt files have already been put on a
 * rebuilt registry, and a re-read took the name back from them —
 * `docs/defects/fixed/a-prompt-file-named-skills-takes-the-skills-command.md`.
 */
export const FIXED_SKILL_COMMAND_NAMES: ReadonlySet<string> = new Set([SKILL_COMMAND_NAME, SKILLS_LIST_COMMAND_NAME]);

/**
 * Register every user-invocable skill on the catalogue's registry. A name a built-in or a palette mirror holds
 * is kept by its holder and the skill takes a suffixed one (REQ-SHELL-056); names a previous call of THIS
 * function claimed are replaced in place, so a re-read after a rescan does not mistake its own work for
 * somebody else's holder — the same rule `registerPromptCommands` follows and for the same reason.
 *
 * With `skills.enabled` false the state carries no user-invocable skill, so nothing registers: REQ-CHAT-034's
 * "skills are turned off" case needs no branch here.
 */
export function registerSkillCommands(registry: SlashRegistry, state: SkillsState, previouslyRegistered: ReadonlySet<string> = new Set()): { names: string[]; skipped: { name: string; reason: string }[] } {
  const { registrations, skipped } = skillRegistrations(state.skills, (name) => {
    if (FIXED_SKILL_COMMAND_NAMES.has(name)) return true;
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
