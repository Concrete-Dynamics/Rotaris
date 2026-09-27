import { z } from 'zod';

/**
 * ADR-0063 — portable skills on the wire: what a surface is told about a discovered skill, and the four
 * commands a renderer may send. The **discovery** happens in the run host (it owns the catalog, which is
 * cached per workspace root and cleared at session creation, REQ-WORKSPACE-058); `packages/ui` gets this
 * projection and nothing else, in the same shape whether it was read, rescanned or just changed.
 *
 * The vocabularies are the specification's and are closed: `REQ-WORKSPACE-062`'s four load modes,
 * `REQ-WORKSPACE-063`'s three invocation modes, `REQ-WORKSPACE-067`'s three scope labels.
 */
export const SKILL_LOAD_MODE_NAMES = ['off', 'name-only', 'user-invocable-only', 'on'] as const;
export type SkillLoadModeName = (typeof SKILL_LOAD_MODE_NAMES)[number];

export const SKILL_INVOCATION_MODE_NAMES = ['default', 'manual-only', 'auto-only'] as const;
export type SkillInvocationModeName = (typeof SKILL_INVOCATION_MODE_NAMES)[number];

export const SKILL_SCOPE_NAMES = ['project', 'user', 'manual'] as const;
export type SkillScopeName = (typeof SKILL_SCOPE_NAMES)[number];

/**
 * REQ-WORKSPACE-062 offers the four load modes under these labels, and REQ-WORKSPACE-067 fixes the Load
 * selector's options as exactly this text. One definition, so the selector and any other surface cannot
 * drift apart.
 */
export const SKILL_LOAD_MODE_LABELS: Readonly<Record<SkillLoadModeName, string>> = Object.freeze({
  off: 'hidden',
  'name-only': 'on-demand',
  'user-invocable-only': 'manual only',
  on: 'always',
});

/** REQ-WORKSPACE-067 fixes the Invocation selector's options as this text. */
export const SKILL_INVOCATION_MODE_LABELS: Readonly<Record<SkillInvocationModeName, string>> = Object.freeze({
  default: 'default (both)',
  'manual-only': 'manual only',
  'auto-only': 'auto only',
});

export const SkillRowSchema = z.object({
  /** REQ-WORKSPACE-054's normal form — the skill's identity, and the key of both override maps. */
  name: z.string().min(1),
  /** The name as the file declares it; the composer's command derives from this (REQ-SHELL-056). */
  declaredName: z.string(),
  description: z.string(),
  /** The absolute path of the `SKILL.md` (REQ-WORKSPACE-067's Path cell, REQ-WORKSPACE-061's catalog line). */
  path: z.string(),
  /** The directory holding it — a read root for agent file tools (REQ-WORKSPACE-059). */
  directory: z.string(),
  scope: z.enum(SKILL_SCOPE_NAMES),
  /** REQ-WORKSPACE-055's keyword trigger, stripped and de-duplicated; empty when the file declares none. */
  triggers: z.array(z.string()),
  /** REQ-WORKSPACE-054: the `SKILL.md` paths this skill won over, for the Source cell's tooltip. */
  shadowed: z.array(z.string()),
  /**
   * REQ-WORKSPACE-073: the policy as the FILES state it. The Load selector shows this and never the
   * session state, so a typed command cannot make the screen claim a workspace was reconfigured.
   */
  loadMode: z.enum(SKILL_LOAD_MODE_NAMES),
  /** The effective invocation: the workspace's override where it states one, else the frontmatter's (REQ-WORKSPACE-063). */
  invocationMode: z.enum(SKILL_INVOCATION_MODE_NAMES),
  /** REQ-WORKSPACE-073: `on` for this session only, by an invoked command. Never persisted; not shown as a policy. */
  forcedThisSession: z.boolean(),
  /** REQ-CHAT-034: whether the user may invoke it, so the composer registers exactly the reachable set. */
  userInvocable: z.boolean(),
});
export type SkillRow = z.infer<typeof SkillRowSchema>;

export const SkillsStateSchema = z.object({
  /** REQ-WORKSPACE-064 / REQ-CONFIG-166: the master switch, as the saved configuration states it. */
  enabled: z.boolean(),
  /** Ascending normalized name (REQ-WORKSPACE-061's order, and the table's). */
  skills: z.array(SkillRowSchema),
  /** REQ-WORKSPACE-053: every file skipped with its reason, so nothing is silently absent. */
  skipped: z.array(z.object({ path: z.string(), reason: z.string() })),
});
export type SkillsState = z.infer<typeof SkillsStateSchema>;

export const EMPTY_SKILLS_STATE: SkillsState = Object.freeze({ enabled: true, skills: [], skipped: [] });

/**
 * Renderer → main. None carries a workspace or a session: main names the window's open workspace and the
 * session it follows, as it does for every workspace-scoped command.
 *
 * - `skills.read` — the projection; discovery runs if the cache is cold (REQ-WORKSPACE-058).
 * - `skills.rescan` — REQ-WORKSPACE-069's header action: clear the cache, re-read from disk, re-project.
 *   Changes no policy and marks nothing dirty.
 * - `skills.forceLoad` — REQ-WORKSPACE-073: the invoked command's effect, session-scoped, persisting nothing.
 * - `skills.loadFile` — REQ-WORKSPACE-151/057: an absent `path` opens the platform chooser in main; a
 *   `path` present is the typed `/skill <path>` command's argument (REQ-CHAT-162), which needs no dialog.
 * - `skills.list` — REQ-CHAT-162's first half, the typed `/skills`: the run host writes the listing into the
 *   followed session's transcript as one saved system row, through that session's own writer.
 */
export const SKILLS_COMMAND_SCHEMAS = [
  z.object({ kind: z.literal('skills.read') }),
  z.object({ kind: z.literal('skills.rescan') }),
  z.object({ kind: z.literal('skills.forceLoad'), name: z.string().min(1) }),
  z.object({ kind: z.literal('skills.loadFile'), path: z.string().optional() }),
  z.object({ kind: z.literal('skills.list') }),
] as const;

/** What `skills.list` answers: how many skills the row lists, and the index the row took in the transcript. */
export const SkillListingOutcomeSchema = z.object({ count: z.number().int().nonnegative(), index: z.number().int().nonnegative() });
export type SkillListingOutcome = z.infer<typeof SkillListingOutcomeSchema>;

/**
 * OQ-66 (b): a window following no session has no transcript to write the listing into, and REQ-CHAT-162 requires
 * the row to be saved with the session. The command fails with this sentence rather than creating a session or
 * drawing a row nothing saves.
 */
export const SKILL_LISTING_NO_SESSION = "Open or start a session first: /skills writes its listing into that session's transcript.";

// ── REQ-CHAT-162: the listing's text, written by the run host and read back by the one row renderer ────────────

/**
 * REQ-CHAT-162 — the `/skills` listing is **one system row**, and its text IS the listing. REQ-CHAT-047 maps the
 * persisted role `system` to the system-notice category, which is one of REQ-CHAT-046's twelve, and REQ-CHAT-046
 * gives a row its text and no field for anything shaped like this; so the listing is carried in the row text and
 * nowhere else. That keeps three things true at once with no store change: the row is saved with the session
 * (the ordinary transcript append), exported with it (the `transcript.row` event the append records), and read as
 * the listing by anyone holding only the text — the copy of the message, the export, a search.
 *
 * The shape is fixed here, once: `skillListingBody` writes it and `parseSkillListing` reads it back, so the row
 * renderer can draw the listing as a listing. A body this parser does not accept is simply a system notice and is
 * drawn as text — which is also what happens to a path holding a line break, the one field this format cannot
 * carry unambiguously. Only the product writes a `system` row (never a model, never the user), and no other
 * system row it writes has this shape.
 *
 * ```
 * 2 skills listed
 * - home-skill [user]
 *   A skill from the user scope.
 *   /home/me/.agents/skills/home-skill/SKILL.md
 * - ws-skill [project] triggers: render, /pdf
 *   The workspace skill.
 *   /work/project/.agents/skills/ws-skill/SKILL.md
 * ```
 */
export const SKILL_LISTING_DESCRIPTION_CAP = 120;

/**
 * REQ-CHAT-162: the description clipped to **120** characters with an ellipsis. Read as the corpus's other clip
 * reads it (REQ-CHAT-068's `compactTask`): at most that many characters, the last of them the ellipsis where the
 * text was cut. Whitespace runs collapse to one space first, because the listing gives each skill one description
 * line; characters are counted as code points, so a cut never splits a surrogate pair.
 */
export function clipSkillDescription(description: string, cap = SKILL_LISTING_DESCRIPTION_CAP): string {
  const flat = description.replace(/\s+/gu, ' ').trim();
  const characters = Array.from(flat);
  return characters.length <= cap ? flat : `${characters.slice(0, cap - 1).join('')}…`;
}

/** One skill as the listing carries it: exactly REQ-CHAT-162's five facts, and — ESC-37, ruled — no in-context flag. */
export interface SkillListingEntry {
  /** REQ-WORKSPACE-054's normal form: the skill's identity everywhere but the typed command (ESC-39). */
  readonly name: string;
  readonly scope: SkillScopeName;
  /** REQ-WORKSPACE-055's keywords, each on one line; empty when the file declares none. */
  readonly triggers: readonly string[];
  /** Clipped by `clipSkillDescription`. */
  readonly description: string;
  /** The absolute path of the `SKILL.md`. */
  readonly path: string;
}
export interface SkillListing {
  /** REQ-CHAT-162: "MUST report how many skills were listed". */
  readonly count: number;
  readonly skills: readonly SkillListingEntry[];
}

/** The listing of a catalog projection, in its own ascending normalized-name order (REQ-WORKSPACE-061's, and the table's). */
export function skillListing(skills: readonly SkillRow[]): SkillListing {
  const entries = skills.map((s) => ({
    name: s.name,
    scope: s.scope,
    triggers: s.triggers.map((t) => t.replace(/\s+/gu, ' ').trim()).filter((t) => t !== ''),
    description: clipSkillDescription(s.description),
    path: s.path,
  }));
  return { count: entries.length, skills: entries };
}

/** REQ-CHAT-168: the count is written for the count it carries — zero, one and many alike. */
export function skillListingCountText(count: number): string {
  return `${count} ${count === 1 ? 'skill' : 'skills'} listed`;
}

const TRIGGERS_LABEL = ' triggers: ';

export function skillListingBody(listing: SkillListing): string {
  const lines = [skillListingCountText(listing.count)];
  for (const s of listing.skills) {
    lines.push(`- ${s.name} [${s.scope}]${s.triggers.length === 0 ? '' : `${TRIGGERS_LABEL}${s.triggers.join(', ')}`}`);
    lines.push(`  ${s.description}`);
    lines.push(`  ${s.path}`);
  }
  return lines.join('\n');
}

/** One field of a parsed listing, with where it sits in the row text — so a search match can be painted onto it. */
export interface SkillListingSpan {
  readonly text: string;
  /** Offset of the field's first character in the row body. */
  readonly start: number;
}
export interface ParsedSkillListingEntry {
  readonly name: SkillListingSpan;
  readonly scope: SkillListingSpan;
  /** The keywords as the row states them, joined; null when the skill declares none. */
  readonly triggers: SkillListingSpan | null;
  readonly description: SkillListingSpan;
  readonly path: SkillListingSpan;
}
export interface ParsedSkillListing {
  readonly count: number;
  readonly header: SkillListingSpan;
  readonly skills: readonly ParsedSkillListingEntry[];
}

const COUNT_LINE = /^(\d+) skills? listed$/u;
const ENTRY_LINE = new RegExp(`^- ([^\\s\\[\\]]+) \\[(${SKILL_SCOPE_NAMES.join('|')})\\](?:${TRIGGERS_LABEL}(.+))?$`, 'u');

/**
 * The reader of `skillListingBody`'s shape, and nothing looser: the count line, then exactly three lines per
 * skill, and the stated count equal to the entries that follow it. Anything else answers null, and the row is
 * drawn as the plain system notice it also is.
 *
 * The row renderer asks this of every system row it draws, so the count line is read before the body is split:
 * a notice that is not a listing costs one short match, never a split of its whole text (REQ-CHAT-055).
 */
export function parseSkillListing(body: string): ParsedSkillListing | null {
  const firstBreak = body.indexOf('\n');
  const header = COUNT_LINE.exec(firstBreak === -1 ? body : body.slice(0, firstBreak));
  if (!header) return null;
  const lines = body.split('\n');
  const count = Number(header[1]);
  if (!Number.isSafeInteger(count) || lines.length !== 1 + 3 * count) return null;
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) { starts.push(offset); offset += line.length + 1; }
  const skills: ParsedSkillListingEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = 1 + 3 * i;
    const head = lines[at]!;
    const description = lines[at + 1]!;
    const path = lines[at + 2]!;
    const m = ENTRY_LINE.exec(head);
    if (!m || !description.startsWith('  ') || !path.startsWith('  ') || path.length === 2) return null;
    const name = m[1]!;
    const nameStart = starts[at]! + 2;
    const triggers = m[3];
    skills.push({
      name: { text: name, start: nameStart },
      scope: { text: m[2]!, start: nameStart + name.length + 2 },
      triggers: triggers === undefined ? null : { text: triggers, start: starts[at]! + head.length - triggers.length },
      description: { text: description.slice(2), start: starts[at + 1]! + 2 },
      path: { text: path.slice(2), start: starts[at + 2]! + 2 },
    });
  }
  return { count, header: { text: lines[0]!, start: 0 }, skills };
}

/** REQ-WORKSPACE-151: a dismissed chooser returns no selection and changes nothing, which this shape says. */
export const SkillLoadOutcomeSchema = z.object({
  cancelled: z.boolean(),
  /** The normalized name of the skill that was loaded; absent when the chooser was dismissed. */
  name: z.string().optional(),
  state: SkillsStateSchema.optional(),
});
export type SkillLoadOutcome = z.infer<typeof SkillLoadOutcomeSchema>;

/** REQ-WORKSPACE-073's exact refusal, quoted by the composer and by the Settings action alike. */
export const SKILLS_DISABLED_MESSAGE = 'Skills are disabled. Enable them in Settings.';
/** REQ-WORKSPACE-073 / REQ-CHAT-034's toast. */
export const skillLoadedToast = (name: string): string => `Skill loaded for the next prompt: ${name}`;
