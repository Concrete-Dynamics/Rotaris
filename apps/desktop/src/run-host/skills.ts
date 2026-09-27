import { homedir } from 'node:os';
import { skillListing, skillListingBody, type SkillsState, type SkillRow } from '@rotaris/contracts';
import type { SessionWriter } from '@rotaris/engine';
import type { MonotonicClock } from '@rotaris/kernel';
import {
  discoverInstructionFiles, discoverSkills, enabledInstructionFiles, loadManualSkill, mergeInstructionContext,
  NODE_DISCOVERY_PORTS, parseSkill, resolveSkills,
  skillBodyBlock, skillCatalogBlock, skillReadRoots,
  type DiscoveredSkill, type DiscoveryPorts, type InstructionFileEntry, type InstructionsSection, type SkillDiscovery, type SkillSessionState, type SkillsSection,
} from '@rotaris/config';

/** PD-WORKSPACE-002 — what one saved-configuration read answers for the instruction files: the section, the master switch, the global base. */
export interface InstructionPolicy {
  readonly section: InstructionsSection;
  readonly master: boolean;
  readonly globalDir: string;
}

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
  /**
   * PD-WORKSPACE-002's machine-wide instruction base, `/etc/codex` when absent; injectable on the same terms as
   * `home`, so the injection proof lays a file down at that base without touching the machine's own.
   */
  readonly machineDir?: string | undefined;
  readonly platform?: NodeJS.Platform;
  readonly ports?: DiscoveryPorts;
  /** The SAVED `skills:` section for a workspace — see `forceLoad` on why it is read per gesture. */
  readonly section: (workspaceRoot: string) => SkillsSection;
  /**
   * PD-WORKSPACE-002 — the master switch, the per-file policy and the global configuration directory
   * the instruction-file discovery reads its `global` base from. Absent means the workspace pair alone
   * reaches an agent, which is what a build with no configuration layer would give it.
   */
  readonly instructions?: ((workspaceRoot: string) => InstructionPolicy) | undefined;
  /** ADR-0006: the monotonic clock port. Absent means the discovery log carries no duration, never a global read. */
  readonly monotonic?: MonotonicClock | undefined;
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
  /**
   * REQ-WORKSPACE-046: the merged workspace context, on the same lifetime and cleared in the same places.
   * REQ-WORKSPACE-050: nested by base workspace, then by the root the run EXECUTES in — a session in an
   * isolated worktree reads its context files from that worktree while keeping the base workspace's catalog,
   * so two sessions on one base with different execution roots hold different merges and neither answers for
   * the other. The clear stays keyed by the base root, which is what a rescan and a session creation name.
   */
  private readonly contexts = new Map<string, Map<string, string>>();
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
    const started = this.deps.monotonic?.now() ?? null;
    const discovery = discoverSkills(
      { workspaceRoot, home: this.home, platform: this.deps.platform ?? process.platform, exists: (p) => this.ports.isDirectory(p) || this.ports.isFile(p) },
      this.ports,
    );
    this.catalogs.set(workspaceRoot, discovery);
    for (const warning of discovery.warnings) this.deps.log(`skills: ${warning}`, 'warn');
    for (const skipped of discovery.skipped) this.deps.log(`skills: skipped ${skipped.path} — ${skipped.reason}`, 'warn');
    const took = started === null ? '' : ` in ${((this.deps.monotonic!.now() as number) - (started as number)).toFixed(1)} ms`;
    this.deps.log(`skills: ${discovery.skills.length} discovered${took} (${workspaceRoot})${discovery.skipped.length > 0 ? `; ${discovery.skipped.length} skipped` : ''}`);
    return discovery;
  }

  /**
   * REQ-WORKSPACE-069: clear the cache for this root, re-run discovery against the filesystem. It changes
   * no load or invocation policy and marks nothing dirty; it governs agents constructed afterwards and
   * leaves agents already built untouched, which follows from the units being composed per construction.
   */
  rescan(workspaceRoot: string): SkillDiscovery {
    this.catalogs.delete(workspaceRoot);
    // REQ-WORKSPACE-046: "an explicit cache-clear operation SHALL force a reload" — the rescan is that
    // operation for both caches, so a file edited between sessions reaches the next agent built.
    this.contexts.delete(workspaceRoot);
    return this.catalog(workspaceRoot);
  }

  /** REQ-WORKSPACE-058: session creation clears the catalog cache AND adopts that root's pending gestures. */
  onSessionCreated(workspaceRoot: string, sessionId: string): void {
    this.catalogs.delete(workspaceRoot);
    // REQ-WORKSPACE-046: the merged context is cleared with the catalog, so each new session re-reads it.
    this.contexts.delete(workspaceRoot);
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

  /**
   * REQ-WORKSPACE-041..048 (PD-WORKSPACE-002) — the merged instruction context, cached per resolved
   * workspace root for as long as the session lasts (REQ-WORKSPACE-046) so a second agent built in the
   * same session touches no filesystem.
   *
   * The policy is read from the SAVED configuration at each cold read, on the same argument the skills
   * section is: a switch the user has just saved gates the next session, and a run that started earlier
   * keeps what it was given. With the master switch false nothing is read at all (REQ-WORKSPACE-048).
   */
  workspaceContext(workspaceRoot: string, executionRoot?: string): string {
    /*
     * REQ-WORKSPACE-050: the files are read from the run's EXECUTION root — the worktree of an isolated
     * session — while the policy, the catalog and persona memory stay with the base workspace the user
     * selected. A worktree's branch may have changed `AGENTS.md`, and the run working in that tree is the
     * run those instructions are for. The per-file switches are unaffected: they key on a stable identity
     * (`workspace:AGENTS.md`), not on a path, so the switch the user set governs either root.
     */
    const readRoot = executionRoot === undefined || executionRoot === '' ? workspaceRoot : executionRoot;
    const held = this.contexts.get(workspaceRoot)?.get(readRoot);
    if (held !== undefined) return held;
    /*
     * REQ-WORKSPACE-049: the cold path is what the 200 ms bound is stated over, so it is timed here, on the
     * monotonic clock port, in the three parts it is made of — the saved policy read, the discovery over the
     * bases, the merge of the enabled set — and said in one line a proof can read back. The policy read is
     * inside the figure on purpose: `PD-WORKSPACE-002` made the per-file policy part of deciding which files
     * are merged at all, so a figure without it would bound less than the injection does. A cache hit above
     * reads no file and is not timed. No clock, no line: never a global read (ADR-0006).
     */
    const clock = this.deps.monotonic;
    const started = clock?.now() ?? null;
    const policy = this.deps.instructions?.(workspaceRoot);
    const policyRead = clock?.now() ?? null;
    const enabled = this.enabledUnder(policy, workspaceRoot, readRoot, 'workspace context');
    const discovered = clock?.now() ?? null;
    const merged = enabled.length === 0
      ? ''
      : mergeInstructionContext(enabled, this.ports, (m) => this.deps.log(`workspace context: ${m}`, 'warn'));
    if (clock !== undefined && started !== null && policyRead !== null && discovered !== null) {
      const ended = clock.now();
      const ms = (from: number, to: number): string => (to - from).toFixed(2);
      this.deps.log(`workspace context: the enabled set of ${enabled.length} instruction file(s) merged into ${Buffer.byteLength(merged, 'utf8')} bytes in ${ms(started, ended)} ms (policy read ${ms(started, policyRead)} ms, discovery ${ms(policyRead, discovered)} ms, merge ${ms(discovered, ended)} ms) for ${readRoot}`);
    }
    const byRoot = this.contexts.get(workspaceRoot) ?? new Map<string, string>();
    byRoot.set(readRoot, merged);
    this.contexts.set(workspaceRoot, byRoot);
    return merged;
  }

  /**
   * The instruction files this workspace's policy allows to be read, discovered once and decided once.
   *
   * It is a method rather than a step inside `workspaceContext` because there are TWO readers of these
   * files and they had drifted apart: the retrospective held its own copy of the rule — two names at the
   * workspace root, no policy at all — so a file the user had switched off was still read into an analysis
   * and could still be proposed as an edit, while injection honoured every switch
   * (`docs/defects/fixed/the-retrospective-reads-instruction-files-the-user-switched-off.md`). One
   * computation, both callers. Whether an ANALYSIS is bound by a switch stated over what agents are GIVEN
   * is **OQ-65**; what the build proceeds under is that it is.
   */
  instructionFiles(workspaceRoot: string, executionRoot?: string, forLog = 'instruction files'): readonly InstructionFileEntry[] {
    const readRoot = executionRoot === undefined || executionRoot === '' ? workspaceRoot : executionRoot;
    return this.enabledUnder(this.deps.instructions?.(workspaceRoot), workspaceRoot, readRoot, forLog);
  }

  /** The discovery and the decision under a policy already read — split out so `workspaceContext` can time the read apart. */
  private enabledUnder(policy: InstructionPolicy | undefined, workspaceRoot: string, readRoot: string, forLog: string): readonly InstructionFileEntry[] {
    if (policy !== undefined && !policy.master) {
      this.deps.log(`${forLog}: injection is switched off for ${workspaceRoot}; no instruction file was read`);
      return [];
    }
    const env = { workspaceRoot: readRoot, globalDir: policy?.globalDir ?? '', home: this.home, platform: this.deps.platform ?? process.platform, machineDir: this.deps.machineDir };
    const present = discoverInstructionFiles(env, (p) => this.ports.isFile(p));
    const enabled = enabledInstructionFiles(present, true, policy?.section.overrides ?? {});
    this.deps.log(`${forLog}: ${enabled.length} of ${present.length} instruction file(s) enabled for ${readRoot}${readRoot === workspaceRoot ? '' : ` (the worktree of ${workspaceRoot}, REQ-WORKSPACE-050)`}${enabled.length === 0 ? '' : ` (${enabled.map((f) => f.id).join(', ')})`}`);
    return enabled;
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
   * The order is **workspace context → skill catalog → force-loaded skill bodies → persona memory**. The
   * first three exist; persona memory does not, so the list is the seam where it will sit — an empty slot
   * in a sequence, not a shape a later part has to re-cut.
   */
  contextUnits(workspaceRoot: string, sessionId?: string, executionRoot?: string): readonly string[] {
    const resolved = this.resolved(workspaceRoot, sessionId);
    const units: string[] = [];
    // REQ-WORKSPACE-047: ahead of the catalog, ahead of every force-loaded body. Empty merged content
    // constructs no unit — "with no context files, or injection disabled, no such unit SHALL be built".
    const context = this.workspaceContext(workspaceRoot, executionRoot);
    if (context !== '') units.push(context);
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
    /*
     * What this agent is actually being given, at the moment it is given it. It names the skills rather than
     * carrying any body text: a log is not a place to put a document, and REQ-WORKSPACE-066 is about what
     * reaches a MODEL, not what reaches an operator reading a session log. Without this line the only evidence
     * that injection happened at all is the model's own behaviour, which is not evidence.
     */
    if (units.length > 0) {
      const forced = resolved.filter((r) => r.forceLoaded).map((r) => r.skill.name);
      const catalogued = resolved.filter((r) => r.inCatalog).map((r) => r.skill.name);
      this.deps.log(`skills: context units for ${sessionId ?? workspaceRoot}: catalog ${catalogued.length === 0 ? '(none)' : catalogued.join(', ')}; force-loaded ${forced.length === 0 ? '(none)' : forced.join(', ')}`);
    }
    return units;
  }
}

/**
 * REQ-CHAT-162 — `/skills`: the session's catalog, listed into its transcript as **one system row** and saved with
 * it. The row goes through the session's own writer, the one every other row of that session goes through, so the
 * three things the requirement and the plan ask of it are what that writer already guarantees rather than three
 * paths of this module's: the row and its `transcript.row` event commit in one transaction (saved with the session,
 * and in the trajectory export, which reads those events), the projection owner is fed on commit (drawn in every
 * window following the session), and a reopened session reads it back from the store like any other row.
 *
 * `writer` is `Sessions.writer(sessionId)`: present exactly while the session is loaded in this process, which a
 * session a window follows is (`session.subscribe` attaches, `session.resume` loads). A live run's writer and a
 * loaded idle session's are the same object — REQ-CHAT-084's clear relies on the same fact — so the listing lands
 * in order whether or not a run is going. An absent writer is refused rather than written around: a row appended
 * under the store alone would skip the event record, the projection and the session's lock.
 *
 * The `state` is `SkillHost.state` for that session, so a skill loaded by hand for it (REQ-WORKSPACE-057, scope
 * `manual`) is listed and one loaded for another session is not. Every discovered skill is listed whatever its load
 * or invocation policy and whether or not `skills.enabled` is on: the requirement lists "the discovered skills",
 * and the Settings table lists the same set.
 */
export function writeSkillListing(
  writer: Pick<SessionWriter, 'appendRow'> | undefined,
  state: SkillsState,
): { ok: true; count: number; index: number } | { ok: false; code: 'session.not-loaded' | 'skills.list-failed'; reason: string } {
  if (writer === undefined) return { ok: false, code: 'session.not-loaded', reason: 'The session this window follows is not loaded, so its transcript cannot be written.' };
  const listing = skillListing(state.skills);
  const r = writer.appendRow('system', skillListingBody(listing), true);
  if (!r.ok) return { ok: false, code: 'skills.list-failed', reason: 'reason' in r.error ? r.error.reason : r.error.code };
  return { ok: true, count: listing.count, index: r.value.index };
}
