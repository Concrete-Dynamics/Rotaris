import { homedir } from 'node:os';
import type { SkillsState, SkillRow } from '@rotaris/contracts';
import {
  discoverSkills, loadManualSkill, NODE_DISCOVERY_PORTS, parseSkill, resolveSkills,
  skillBodyBlock, skillCatalogBlock, skillReadRoots,
  type DiscoveredSkill, type DiscoveryPorts, type SkillDiscovery, type SkillSessionState, type SkillsSection,
} from '@rotaris/config';

/**
 * ADR-0063 — the portable-skill catalog, owned by the run host.
 *
 * **Why here and not in the configuration loader.** The catalog is cached per resolved workspace root and
 * cleared **on every session creation** (REQ-WORKSPACE-058), so skills are re-discovered from disk at each
 * new session. That is not configuration's lifetime — configuration is re-read at each run start and cached
 * across none — and only the process that creates sessions can honour it. The units it feeds are composed at
 * agent construction, which is also here.
 *
 * **Session state** (REQ-WORKSPACE-057, 073) is keyed by session id, with one `pending:<root>` bucket per
 * workspace root that the next session created for that root adopts. A gesture made from a window showing no
 * session has no session to name, and `PD-WORKSPACE-001` has since made two live sessions on one workspace
 * ordinary, so "the current session" needs a referent the requirements do not supply — logged as **OQ-58**,
 * built this way, and stated here so the two cannot drift.
 *
 * **What this module never does** (REQ-WORKSPACE-066): pre-fetch a body, rewrite one, or summarise one. A
 * body is read from disk at the moment a unit is composed, and an unreadable one produces no block and a
 * warning naming the skill, leaving every other part of the agent's context exactly as it would have been.
 */
export interface SkillHostDeps {
  /** The user's home; injectable so the proof can point discovery at a scratch tree. */
  readonly home?: string;
  readonly platform?: NodeJS.Platform;
  readonly ports?: DiscoveryPorts;
  /** The SAVED `skills:` section for a workspace — see `enabledFor` on why it is read per gesture. */
  readonly section: (workspaceRoot: string) => SkillsSection;
  readonly log: (message: string, level?: 'info' | 'warn') => void;
}

/** The pending bucket's key: a workspace root that has no session yet, or none on screen. */
const pendingKey = (workspaceRoot: string): string => `pending:${workspaceRoot}`;

interface MutableSession {
  forced: Set<string>;
  manual: Map<string, DiscoveredSkill>;
}

export class SkillHost {
  /** REQ-WORKSPACE-058: per resolved workspace root, cleared by a rescan and by session creation. */
  private readonly catalogs = new Map<string, SkillDiscovery>();
  private readonly sessions = new Map<string, MutableSession>();

  constructor(private readonly deps: SkillHostDeps) {}

  private get home(): string {
    return this.deps.home ?? homedir();
  }
  private get ports(): DiscoveryPorts {
    return this.deps.ports ?? NODE_DISCOVERY_PORTS;
  }

  private stateFor(key: string): MutableSession {
    let held = this.sessions.get(key);
    if (!held) { held = { forced: new Set(), manual: new Map() }; this.sessions.set(key, held); }
    return held;
  }
  /** OQ-58: a gesture with a session is that session's; one without lands in its root's pending bucket. */
  private keyFor(workspaceRoot: string, sessionId: string | undefined): string {
    return sessionId === undefined || sessionId === '' ? pendingKey(workspaceRoot) : sessionId;
  }
  private sessionState(workspaceRoot: string, sessionId: string | undefined): SkillSessionState {
    const held = this.sessions.get(this.keyFor(workspaceRoot, sessionId));
    return held ? { forced: held.forced, manual: held.manual } : { forced: new Set(), manual: new Map() };
  }

  /** The catalog, discovering on a cold cache. Never throws: an unreadable tree yields an empty discovery. */
  catalog(workspaceRoot: string): SkillDiscovery {
    const held = this.catalogs.get(workspaceRoot);
    if (held) return held;
    const started = Date.now();
    const discovery = discoverSkills(
      { workspaceRoot, home: this.home, platform: this.deps.platform ?? process.platform, exists: (p) => this.ports.isDirectory(p) || this.ports.isFile(p) },
      this.ports,
    );
    this.catalogs.set(workspaceRoot, discovery);
    for (const warning of discovery.warnings) this.deps.log(`skills: ${warning}`, 'warn');
    for (const skipped of discovery.skipped) this.deps.log(`skills: skipped ${skipped.path} — ${skipped.reason}`, 'warn');
    this.deps.log(`skills: ${discovery.skills.length} discovered in ${Date.now() - started} ms (${workspaceRoot})${discovery.skipped.length > 0 ? `; ${discovery.skipped.length} skipped` : ''}`);
    return discovery;
  }

  /**
   * REQ-WORKSPACE-069: clear the cache for this root, re-run discovery against the filesystem. It changes
   * no load or invocation policy and marks nothing dirty; it governs agents constructed afterwards and
   * leaves agents already built untouched, which follows from the units being composed per construction.
   */
  rescan(workspaceRoot: string): SkillDiscovery {
    this.catalogs.delete(workspaceRoot);
    return this.catalog(workspaceRoot);
  }

  /** REQ-WORKSPACE-058: session creation clears the catalog cache AND adopts that root's pending gestures. */
  onSessionCreated(workspaceRoot: string, sessionId: string): void {
    this.catalogs.delete(workspaceRoot);
    const pending = this.sessions.get(pendingKey(workspaceRoot));
    if (pending) {
      this.sessions.set(sessionId, pending);
      this.sessions.delete(pendingKey(workspaceRoot));
      if (pending.forced.size > 0 || pending.manual.size > 0) this.deps.log(`skills: session ${sessionId} adopts ${pending.forced.size} forced and ${pending.manual.size} manual skill(s) chosen before it began`);
    }
  }

  /** A session that is gone takes its forced set and its manual skills with it (REQ-WORKSPACE-057/073). */
  onSessionEnded(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private resolved(workspaceRoot: string, sessionId: string | undefined) {
    return resolveSkills(this.catalog(workspaceRoot).skills, this.deps.section(workspaceRoot), this.sessionState(workspaceRoot, sessionId));
  }

  /** The projection a surface reads (REQ-WORKSPACE-067; `contracts/skills.ts`). */
  state(workspaceRoot: string, sessionId?: string): SkillsState {
    const section = this.deps.section(workspaceRoot);
    const discovery = this.catalog(workspaceRoot);
    const forced = this.sessionState(workspaceRoot, sessionId).forced;
    const skills: SkillRow[] = this.resolved(workspaceRoot, sessionId).map((r) => ({
      name: r.skill.name,
      declaredName: r.skill.declaredName,
      description: r.skill.description,
      path: r.skill.path,
      directory: r.skill.directory,
      scope: r.skill.scope,
      triggers: [...(r.skill.trigger?.keywords ?? [])],
      shadowed: [...r.skill.shadowed],
      // REQ-WORKSPACE-073: the PERSISTED policy, so the Load selector never shows a session force as configuration.
      loadMode: r.persistedLoad,
      invocationMode: r.invocation,
      forcedThisSession: forced.has(r.skill.name),
      userInvocable: r.userInvocable,
    }));
    return { enabled: section.enabled, skills, skipped: discovery.skipped.map((s) => ({ ...s })) };
  }

  /**
   * REQ-WORKSPACE-073 — the invoked command's effect. The master switch is read from the SAVED
   * configuration through `deps.section`, not from a run's captured snapshot, because this gates a user
   * gesture happening now rather than a run that started earlier; the `fetch` tool's per-call policy read
   * (REQ-SANDBOX-038) is the existing precedent. On refusal the skill's load mode is left as it was.
   *
   * Nothing is persisted: `<workspace>/.rotaris/agents.yaml` is untouched, `skills.overrides` is left
   * exactly as it was, settings are not marked dirty.
   */
  forceLoad(workspaceRoot: string, sessionId: string | undefined, name: string): { ok: true; name: string } | { ok: false; reason: string } {
    if (!this.deps.section(workspaceRoot).enabled) return { ok: false, reason: 'disabled' };
    const known = this.resolved(workspaceRoot, sessionId).find((r) => r.skill.name === name);
    if (!known) return { ok: false, reason: `No skill named '${name}' was discovered in this workspace.` };
    this.stateFor(this.keyFor(workspaceRoot, sessionId)).forced.add(name);
    this.deps.log(`skills: '${name}' force-loaded for ${sessionId ?? `the next session in ${workspaceRoot}`}`);
    return { ok: true, name };
  }

  /**
   * REQ-WORKSPACE-057 / 151 — a skill loaded by hand. Scope label `manual`, overrides a discovered skill of
   * the same normalized name, applies to this session only, persists nothing.
   */
  loadFile(workspaceRoot: string, sessionId: string | undefined, raw: string): { ok: true; name: string } | { ok: false; reason: string } {
    const loaded = loadManualSkill(raw, { workspaceRoot, home: this.home }, this.ports);
    if (!loaded.ok) return loaded;
    this.stateFor(this.keyFor(workspaceRoot, sessionId)).manual.set(loaded.skill.name, loaded.skill);
    this.deps.log(`skills: '${loaded.skill.name}' loaded by hand from ${loaded.skill.path} for ${sessionId ?? `the next session in ${workspaceRoot}`} (this session only)`);
    return { ok: true, name: loaded.skill.name };
  }

  /**
   * REQ-WORKSPACE-059 — the sorted, resolved skill directories, as additional READ roots for agent file
   * tools. A manual skill's directory is included: it is cataloged for this session, and an agent told about
   * a skill it cannot read the siblings of is worse than one not told at all. Writes to these roots stay
   * refused, which the fence decides and this list does not touch.
   */
  readRoots(workspaceRoot: string, sessionId?: string): readonly string[] {
    return skillReadRoots(this.resolved(workspaceRoot, sessionId).map((r) => r.skill));
  }

  /**
   * REQ-WORKSPACE-060, 061, 062 — the context units this session's agents receive, in the requirement's
   * order. Called at every agent construction (a getter, not a captured value), so a force-load reaches the
   * next agent built and never retracts one already running (REQ-CONFIG-166).
   *
   * The order is **workspace context → skill catalog → force-loaded skill bodies → persona memory**. Two of
   * those four do not exist in this build — workspace context injection (REQ-WORKSPACE-041..050) and persona
   * memory — so this returns the middle two and the list is the seam where the other two will sit. They are
   * empty slots in a sequence, not a shape a later part has to re-cut.
   */
  contextUnits(workspaceRoot: string, sessionId?: string): readonly string[] {
    const resolved = this.resolved(workspaceRoot, sessionId);
    const units: string[] = [];
    // [slot] workspace context (REQ-WORKSPACE-047) — not built.
    const catalog = skillCatalogBlock(resolved);
    if (catalog !== null) units.push(catalog);
    for (const r of resolved) {
      if (!r.forceLoaded) continue;
      let body: string;
      try {
        body = this.ports.readFile(r.skill.path);
      } catch (cause) {
        // REQ-WORKSPACE-062: no block, every other part of the context exactly as it would have been, and a
        // warning naming the skill. Never a refusal — a skill file deleted mid-session must not stop a run.
        this.deps.log(`skills: '${r.skill.name}' is set to always load but its body could not be read from ${r.skill.path} (${cause instanceof Error ? cause.message : String(cause)}); no block was added`, 'warn');
        continue;
      }
      // REQ-WORKSPACE-062: "the skill's body, with the YAML frontmatter removed". Re-parsed rather than taken
      // from the cached discovery, so the block carries what is on disk NOW — REQ-WORKSPACE-066 forbids the
      // framework holding a rewritten copy, and a body cached at discovery is exactly that. A file that has
      // since stopped parsing still contributes its text: the requirement conditions the block on the body
      // being readable, not on the frontmatter still being valid.
      const parsed = parseSkill(body);
      units.push(skillBodyBlock(r.skill.name, r.skill.path, parsed.ok ? parsed.skill.body : body));
    }
    // [slot] persona memory (REQ-WORKSPACE-060) — not built.
    return units;
  }
}
