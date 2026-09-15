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
 */
export const SKILLS_COMMAND_SCHEMAS = [
  z.object({ kind: z.literal('skills.read') }),
  z.object({ kind: z.literal('skills.rescan') }),
  z.object({ kind: z.literal('skills.forceLoad'), name: z.string().min(1) }),
  z.object({ kind: z.literal('skills.loadFile'), path: z.string().optional() }),
] as const;

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
