import {
  DEFAULT_SKILL_INVOCATION_MODE, DEFAULT_SKILL_LOAD_MODE,
  type SkillInvocationMode, type SkillLoadMode, type SkillsSection,
} from '../sections/skills.js';
import type { DiscoveredSkill } from './discover.js';

/**
 * REQ-WORKSPACE-062, 063, 064 and 065 — what a discovered skill's policy resolves to, and what an agent
 * therefore ends up with. Pure: the caller supplies the discovery, the configured section and the
 * session's own state, and gets back one row per skill with every mode settled.
 *
 * **Load mode** (062), default `name-only`, offered in the interface as hidden / on-demand / manual only
 * / always:
 *
 * | mode | catalog entry | body force-loaded | user may invoke |
 * | --- | --- | --- | --- |
 * | `name-only` | yes | no | yes |
 * | `on` | **no** — the body stands in its place | yes | yes |
 * | `user-invocable-only` | no | no | yes |
 * | `off` | no | no | **no** |
 *
 * `on` removing the catalog entry is the requirement's own rule and worth not losing: naming a skill in
 * a list of files to open, while its whole text is already in front of the model, would tell the model
 * to go and fetch what it has.
 *
 * **Invocation mode** (063), from the frontmatter (056) unless the workspace states one, which takes
 * precedence: `manual-only` removes the skill from the model-facing catalog, `auto-only` removes it from
 * user invocation.
 *
 * **The master switch** (064): with `skills.enabled` false, no catalog is injected, no body is
 * force-loaded and no skill is user-invocable. Modelled here as an empty resolution rather than a flag
 * every caller must remember to test.
 *
 * **Policy is per workspace and never per persona** (065). Nothing in this file takes a role, which is
 * what makes that true by construction rather than by discipline.
 */
export interface SkillSessionState {
  /** REQ-WORKSPACE-073: names forced to `on` for this session by an invoked command. Never persisted. */
  readonly forced: ReadonlySet<string>;
  /** REQ-WORKSPACE-057: skills loaded by hand for this session, overriding a discovered one of the same name. */
  readonly manual: ReadonlyMap<string, DiscoveredSkill>;
}

export const EMPTY_SKILL_SESSION: SkillSessionState = { forced: new Set(), manual: new Map() };

export interface ResolvedSkill {
  readonly skill: DiscoveredSkill;
  /** The policy as the files state it — what the Settings Load selector shows (REQ-WORKSPACE-073). */
  readonly persistedLoad: SkillLoadMode;
  /** The policy in force for this session — `on` where a command forced it. */
  readonly load: SkillLoadMode;
  readonly invocation: SkillInvocationMode;
  /** REQ-WORKSPACE-061: an entry for this skill belongs in the model-facing catalog. */
  readonly inCatalog: boolean;
  /** REQ-WORKSPACE-062: this skill's body is an always-active block for the session. */
  readonly forceLoaded: boolean;
  /** REQ-CHAT-034: the user may invoke it — it registers a slash command. */
  readonly userInvocable: boolean;
}

export function resolveSkills(
  discovered: readonly DiscoveredSkill[],
  section: Pick<SkillsSection, 'enabled' | 'overrides' | 'invocation_overrides'>,
  session: SkillSessionState = EMPTY_SKILL_SESSION,
): readonly ResolvedSkill[] {
  // REQ-WORKSPACE-057: a manual skill overrides a discovered one of the same normalized name, and adds
  // itself where no discovered skill holds that name. The merged list keeps ascending-name order.
  const byName = new Map<string, DiscoveredSkill>();
  for (const skill of discovered) byName.set(skill.name, skill);
  for (const [name, skill] of session.manual) byName.set(name, skill);
  const merged = [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return merged.map((skill) => {
    const persistedLoad = section.overrides[skill.name] ?? DEFAULT_SKILL_LOAD_MODE;
    // REQ-WORKSPACE-073: the session force never reaches `skills.overrides`, so `persistedLoad` is what
    // the Settings selector keeps showing while `load` is what the agent gets.
    const load: SkillLoadMode = session.forced.has(skill.name) ? 'on' : persistedLoad;
    // REQ-WORKSPACE-063: a workspace-configured invocation takes precedence over the frontmatter-derived one.
    const invocation = section.invocation_overrides[skill.name] ?? skill.invocation ?? DEFAULT_SKILL_INVOCATION_MODE;
    const enabled = section.enabled;
    const visible = enabled && load !== 'off';
    return {
      skill, persistedLoad, load, invocation,
      inCatalog: visible && load === 'name-only' && invocation !== 'manual-only',
      forceLoaded: visible && load === 'on',
      userInvocable: visible && invocation !== 'auto-only',
    };
  });
}
