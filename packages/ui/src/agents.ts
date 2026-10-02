import { contextPercent, DEFAULT_CONTEXT_CAPACITY, isBusy, presentationStatus, RUN_AGENT_ID, type AgentRecord, type ConfigSnapshot, type EntryRoot, type SessionArtifactLink, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';
import { countNoun } from '@rotaris/kernel';
import { treeRows } from './AgentTree.js';

/**
 * The agent surfaces' pure rules (Part R): what the inspector follows (REQ-MONITOR-053), the run-level agent as a
 * surface presents it (REQ-MONITOR-057/058, REQ-MONITOR-274's pause rule), the chip states (REQ-MONITOR-060/062),
 * the cascade count (REQ-MONITOR-064), the table's order (REQ-MONITOR-036) and the noun agreement (REQ-SHELL-044).
 * Structure from docs/spec; nothing here renders.
 */

/**
 * REQ-MONITOR-063: Steer while running or waiting; Cancel while running, waiting or queued; Pop out always. A paused
 * agent's Cancel, which PD-ORCH-005 clause 16 (revision 4) makes available while its session rests, is decided by
 * `cancelOffered` before it reaches this rule, so a paused agent is offered neither here.
 */
export function inspectorEnablement(state: AgentRecord['presentationState'] | null): { steer: boolean; cancel: boolean; popOut: boolean } {
  if (state === null) return { steer: false, cancel: false, popOut: false };
  return { steer: state === 'running' || state === 'waiting', cancel: state === 'running' || state === 'waiting' || state === 'queued', popOut: true };
}

/**
 * Whether a surface offers Cancel for the shown agent: a live agent while its run is active (REQ-MONITOR-063); a `paused`
 * child while its session rests (`resting`, `runLevelResting`), since clause 16 of PD-ORCH-005 makes it cancellable then
 * — not while a run is active, when a `pausing` run is still bringing its agents to rest or a continue has not yet
 * resumed them — and never the run-level agent at rest, whose whole-iteration equivalent is clause 6's "Continue without
 * them" (OQ-101). The inspector, the Mission view and the Workspace's agents header decide by it; a persona window offers
 * Cancel always (REQ-SHELL-075(g)).
 */
export function cancelOffered(agent: Pick<AgentRecord, 'id' | 'presentationState'> | null, runActive: boolean, resting: boolean): boolean {
  if (agent === null) return false;
  if (agent.presentationState === 'paused') return resting && agent.id !== RUN_AGENT_ID;
  return runActive && inspectorEnablement(agent.presentationState).cancel;
}

/**
 * Why a surface's Cancel is not offered for the shown agent (`cancelOffered` false), one wording for the inspector and
 * the Mission view: nothing selected, which only the Mission view reaches and whose wording names the run its "Cancel
 * selection" cancels when the run row is selected (REQ-MONITOR-126); the run-level agent at rest, whose whole-iteration
 * equivalent is clause 6's "Continue without them" (PD-ORCH-005 clause 16, OQ-101); or any other agent, whose rule is
 * stated.
 */
export function cancelUnavailableReason(agent: Pick<AgentRecord, 'id' | 'presentationState'> | null): string {
  if (agent === null) return 'Select a live agent or the run while the run is active, or a paused child while its session rests, to cancel it.';
  if (agent.id === RUN_AGENT_ID && agent.presentationState === 'paused') return 'The resting run is not cancelled here: "Continue without them" ends its paused agents (PD-ORCH-005 clause 6).';
  return 'Cancel is enabled while the agent is running, waiting or queued, and for a paused child while its session rests.';
}

/**
 * Whether the Workspace's agents header offers Steer for the selected agent: a live one — running, waiting or queued —
 * while its run is active. A paused agent is not live (PD-ORCH-005 clause 13, REQ-MONITOR-045, OQ-100), so it is offered
 * none, as the inspector offers none (`inspectorEnablement`). The header's `queued`, which the inspector's REQ-MONITOR-063
 * rule does not steer, is older than clause 13 and kept.
 */
export function steerOffered(agent: Pick<AgentRecord, 'presentationState'> | null, runActive: boolean): boolean {
  if (agent === null || !runActive) return false;
  const s = agent.presentationState;
  return s === 'running' || s === 'waiting' || s === 'queued';
}

/**
 * PD-ORCH-005 clauses 13 and 19 (OQ-100): the iteration's root resumes with its paused agents and the Continue action
 * counts it, so while the session rests with an iteration open — `paused` or `interrupted`, or in REQ-CHAT-008's
 * recovery state, which only the caller knows (`recovery`, required as `runLevelAgent`'s is, so no caller can leave
 * that state out and withhold the resting root or a paused child's Cancel) — the run-level agent presents as `paused`
 * too, the tree agreeing with the count. The one predicate for the composer's count (`WorkspaceView`'s `resumable`),
 * the resting root and a paused child's Cancel (`cancelOffered`'s `resting`, clause 16), so the three cannot drift
 * apart.
 */
export function runLevelResting(session: SessionRecord, recovery: boolean): boolean {
  const status = session.executionStatus;
  return session.resumable !== null && (status === 'paused' || status === 'interrupted' || (recovery && isBusy(status)));
}

/**
 * REQ-MONITOR-060/061 (live-run finding K1; the verifier's finding on its first repair): the run-level agent's tool set —
 * the live run's root-port resolution when there is one; else, while the agent is live, nothing (the port resolves in
 * `Run.iterate`, after the pre-flight, and a follow-up run is presented live from `starting` because it already holds
 * `runStartedAt` — the declared set stood in there until this repair, withheld tools included); else, with no live
 * instance, the persona's declared tools stand in (REQ-MONITOR-060).
 */
export function runLevelGrant(resolved: readonly string[], declared: readonly string[], live: boolean): string[] {
  if (resolved.length > 0) return [...resolved];
  return live ? [] : [...declared];
}

/**
 * REQ-MONITOR-043/057: the run itself is never a tree row, but the inspector, the Mission view and the persona
 * windows present the entry role as the run-level agent — its rows are the transcript's `agent`/`tool` rows named for
 * the entry persona or for any of the session's roots (`ownRow` with `SessionRecord.entryRoots`: a root resumed as the
 * entry role keeps its own persona's name, OQ-97). Its latest prompt reading is Part AH's `entryContext` (REQ-MONITOR-089) —
 * before that every root-level meter drew zero for a run that spawned no child, whatever the run had actually spent.
 * Its tools are `entryTools` (live-run finding K1, R-067): the set the live run's root port resolved, else — only with no
 * live instance — the entry persona's declared tools standing in (REQ-MONITOR-060, `runLevelGrant`), its called history and, while it runs, its active calls —
 * before that it drew "No tools resolved." beside a run that had made fifteen calls. Its tool-call count is the session's
 * `entryToolCalls` (REQ-MONITOR-044/052, acceptance A20, R-067): the roots' share of the persisted total plus the live root's
 * calls not counted yet — else, for a record with no projection, the total less the children's. The agent's own count, not
 * REQ-MONITOR-101's aggregate run count for the synthetic root: which of the two it shows is OQ-159's. The total alone read
 * `0 tool calls` while the root's turn ran, since a root's calls join it only when its turn returns.
 */
export function runLevelAgent(session: SessionRecord | null, entry: { readonly persona: string; readonly model: string; readonly reasoning: string; readonly tools: readonly string[] }, recovery: boolean): AgentRecord | null {
  if (!session || session.runStartedAt === null) return null;
  const resting = runLevelResting(session, recovery);
  // REQ-CHAT-008's recovery state with nothing to resume — a crash between iterations, or an explicit cancel accepted and
  // never carried out (OQ-103, R-067) — has no process behind its busy status: it is presented as the repair will leave
  // it (`interrupted` with nothing open, below), ended and not live, never as a live run offered Steer and Cancel.
  const busy = isBusy(session.executionStatus) && !resting && !recovery;
  const status = session.executionStatus;
  const presentationState: AgentRecord['presentationState'] = resting ? 'paused' : busy ? 'running' : status === 'completed' ? 'done' : status === 'failed' ? 'failed' : status === 'waiting' ? 'running' : 'cancelled';
  const childCalls = session.agents.reduce((n, a) => n + a.toolCalls, 0);
  return {
    id: RUN_AGENT_ID, name: entry.persona, givenName: entry.persona, persona: entry.persona, state: resting ? 'paused' : busy ? 'running' : presentationState === 'done' ? 'succeeded' : presentationState === 'failed' ? 'failed' : 'cancelled',
    presentationState, parentId: '', dependencies: [], activity: session.summary?.message ?? '', model: entry.model, depth: 0, background: false, category: '',
    spawnedAt: session.runStartedAt, completedAt: busy || resting ? null : session.updatedAt, toolCalls: session.entryToolCalls ?? Math.max(0, session.toolCalls.total - childCalls), delegationTask: '',
    // REQ-MONITOR-086: the run-wide count, which the synthetic root shows (OQ-159's recorded reading): the session's
    // maintained aggregate, the roots' own compressions included. Until 2026-10-02 it summed `session.agents`, which holds
    // the children alone, so a root's compressions were counted nowhere
    // (docs/defects/fixed/the-inspector-and-a-persona-window-show-per-agent-metrics-without-the-compression-count.md).
    compressions: session.compressions,
    reasoning: entry.reasoning, contextUsed: session.entryContext.used, contextLimit: session.entryContext.limit > 0 ? session.entryContext.limit : DEFAULT_CONTEXT_CAPACITY, grantedTools: runLevelGrant(session.entryTools.resolved, entry.tools, busy),
    // The run-level agent's set is already `runLevelGrant`'s choice; no row records its grant (REQ-MCP-065 is per child).
    grantRecorded: false, calledTools: [...session.entryTools.called], activeTools: busy ? [...session.entryTools.active] : [], delegationSessionId: null, inheritedContext: '', live: busy,
    // Part S's evidence (REQ-MCP-065/114) is per child; the run-level agent carries none in this build.
    grantedMcp: {}, mcpServers: [],
    // PD-ORCH-005: the interruption belongs to a delegated agent's record; the synthetic run-level agent carries none.
    interruption: null,
    // REQ-MONITOR-117/119: the entry agent's own stall watch's figure, while its run is live.
    stalledSeconds: busy ? session.entryStalledSeconds : null,
  };
}

/** The entry role as `runLevelAgent` draws it: its persona, model, reasoning and the declared tools that stand in for its grant. */
export interface EntryRole { readonly persona: string; readonly model: string; readonly reasoning: string; readonly tools: readonly string[] }
/**
 * The entry role as the run-level agent presents it (REQ-MONITOR-057/058): the persona the LATEST root runs or ran as —
 * while a run is live, the persona its root runs as (`SessionRecord.entryPersona`, passed as `live`); else the `persona` of
 * the transcript's last row a root authored, of any kind that names its author (`agent`, `tool`, `thinking`, `diff`: every
 * row a turn writes carries the persona and the name), no child's, preferring a row named for one of the session's roots
 * (`SessionRecord.entryRoots`, so a child's row that reaches the window before its record cannot pass for one); else
 * `orchestrator`. Its model, reasoning and declared tools (REQ-MONITOR-060's stand-in) come from the snapshot's role view.
 *
 * The latest root, because the entry persona can change between runs (`default_persona` is read for every run, and
 * PD-ORCH-003 lets a plan cycle run fresh after an iteration), and the run-level agent's chips are the latest root's
 * (`entryToolsOf`: the live run's port and history, else the latest root's history): the name and the stand-in come from
 * the persona whose tools the chips show. The specification does not say which persona is drawn once the entry persona has
 * changed; this is the build's reading, recorded beside OQ-97. Until 2026-10-01 the FIRST root's `agent` row was read, so
 * after an iteration as `orchestrator` and a plan cycle as `reviewer` the inspector drew `orchestrator`'s tools with
 * `reviewer`'s calls marking them; the first repair read the last root's `agent` row alone, and a live root whose first
 * steps were tool calls was drawn as the previous root until its first text, and one that had written no row at all
 * until then too (the verifier's finding; docs/defects/fixed/after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md).
 */
export function entryRole(roles: readonly Pick<ConfigSnapshot['roles'][number], 'role' | 'effectiveModel' | 'rawThinking' | 'declaredTools'>[], rows: readonly TranscriptRow[], agents: readonly Pick<AgentRecord, 'name'>[], roots: readonly Pick<EntryRoot, 'name'>[] = [], live: string | null = null): EntryRole {
  const childNames = new Set(agents.map((a) => a.name));
  const rootNames = new Set(roots.map((r) => r.name));
  const candidates = rows.filter((r) => AUTHORED_KINDS.has(r.kind) && r.persona !== undefined && r.name !== undefined && !childNames.has(r.name));
  const latest = candidates.findLast((r) => rootNames.has(r.name!)) ?? candidates.at(-1);
  const persona = live ?? latest?.persona ?? 'orchestrator';
  const role = roles.find((r) => r.role === persona);
  return { persona, model: role?.effectiveModel ?? '', reasoning: role?.rawThinking ?? 'medium', tools: role?.declaredTools ?? [] };
}
/** The row kinds a turn writes under its agent's persona and name (`run/turn.ts`): the rows an agent authors. */
const AUTHORED_KINDS = new Set(['agent', 'tool', 'thinking', 'diff']);

/**
 * PD-ORCH-005 clauses 13 and 16 (OQ-100, OQ-101): what a surface drawing the run-level agent and a paused child's Cancel
 * asks, in one call — the run-level agent (`runLevelAgent`) and whether the session rests (`runLevelResting`), both from
 * the same REQ-CHAT-008 `recovery` fact, so the Workspace, the Mission view and a persona window cannot pass it to one and
 * not the other. With no entry role known the run-level agent is null, as the Workspace draws none.
 */
export function restingView(session: SessionRecord | null, entry: Parameters<typeof runLevelAgent>[1] | undefined, recovery: boolean): { readonly runLevel: AgentRecord | null; readonly resting: boolean } {
  return { runLevel: entry ? runLevelAgent(session, entry, recovery) : null, resting: session !== null && runLevelResting(session, recovery) };
}

/**
 * REQ-MONITOR-127 / REQ-MONITOR-130 (acceptance A35, OQ-165): the muted state word a surface draws for an agent. The agent
 * vocabulary (`PRESENTATION_CHILD_STATES`) has no `cancelling`, and `runLevelAgent` presents every busy status as
 * `running`, so a confirmed cancel of the run reached no word a persona window draws. The run-level agent is the run
 * (REQ-MONITOR-043), so while it is live and the shown session reads `cancelling` — a confirmed cancel's overlay, or the
 * stop's own record — its word is the run's, `cancelling`, a member of REQ-NOTIFY-048's vocabulary and no new word. A
 * child keeps the agent vocabulary: the engine settles children in the teardown, and no agent is shown cancelled by the
 * run's cancel before it does.
 */
export function agentStateLabel(agent: Pick<AgentRecord, 'id' | 'presentationState' | 'live'>, session: Pick<SessionRecord, 'executionStatus'> | null): string {
  if (agent.id === RUN_AGENT_ID && agent.live && session !== null && presentationStatus(session.executionStatus) === 'cancelling') return 'cancelling';
  return agent.presentationState;
}

const NOT_FOLLOWED_KINDS = new Set(['user', 'system', 'intent', 'verifier', 'diff']);

/**
 * REQ-MONITOR-071 / REQ-CHAT-069: whether `row` is `agent`'s own. A child's by its name. The run-level agent's by the entry
 * persona a surface knows it by, and by the name any of the session's roots carries (`SessionRecord.entryRoots`, PD-ORCH-005
 * clause 4 with OQ-97): a root resumed as the entry role keeps its own persona's name on its rows while the entry persona
 * is another, and matched by the entry persona alone its rows were never the run-level agent's
 * (docs/defects/fixed/the-run-level-agent-is-known-by-its-entry-persona-alone.md). Never by a named row's persona: a child
 * of the entry persona writes that persona too.
 */
export function ownRow(row: TranscriptRow, agent: AgentRecord, roots: readonly EntryRoot[] = []): boolean {
  if (agent.id !== RUN_AGENT_ID) return row.name === agent.name;
  if (row.name === undefined) return row.persona === agent.persona;
  return row.name === agent.persona || roots.some((r) => r.name === row.name);
}

/**
 * REQ-MONITOR-053: with nothing selected, the agent that authored the latest row — scanning backwards past user,
 * intent, system and verifier rows and rows with unknown authorship. A row named for a child is that child; a row
 * the run-level agent owns (`ownRow`, by the entry persona or any root's name in `roots`), or one of the entry persona
 * no child is named for, is the run-level agent when one exists.
 */
export function followedAgent(rows: readonly TranscriptRow[], agents: readonly AgentRecord[], runLevel: AgentRecord | null, roots: readonly EntryRoot[] = []): AgentRecord | null {
  const byName = new Map(agents.map((a) => [a.name, a]));
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]!;
    if (NOT_FOLLOWED_KINDS.has(row.kind)) continue;
    const name = row.name ?? '';
    if (name === '') continue;
    const child = byName.get(name);
    if (child) return child;
    if (runLevel && (ownRow(row, runLevel, roots) || row.persona === runLevel.persona)) return runLevel;
  }
  return null;
}

export type ChipState = 'active' | 'used' | 'not used';
/**
 * REQ-MONITOR-060/062: one chip per tool of the resolved set in the set's own order (the grant, else the persona's
 * declared tools), marked from the live and historical records. A state-only change leaves the list and its order
 * untouched by construction: the order is the set's, never the record's.
 */
export function chipStates(resolved: readonly string[], called: readonly string[], active: readonly string[]): { name: string; state: ChipState }[] {
  const activeSet = new Set(active);
  const calledSet = new Set(called);
  return resolved.map((name) => ({ name, state: activeSet.has(name) ? 'active' : calledSet.has(name) ? 'used' : 'not used' }));
}
/**
 * REQ-MCP-065 / REQ-MONITOR-060 (wired at the merge of Parts R and S): one chip per granted MCP tool of a server, the marks
 * matched prefix-tolerantly — a call logged under `<server>_<name>` (the collision prefix of REQ-MCP-057) still marks the
 * granted original name.
 */
export function mcpChipStates(server: string, granted: readonly string[], called: readonly string[], active: readonly string[]): { name: string; state: ChipState }[] {
  const matches = (set: readonly string[], name: string): boolean => set.includes(name) || set.includes(`${server}_${name}`);
  return granted.map((name) => ({ name, state: matches(active, name) ? 'active' : matches(called, name) ? 'used' : 'not used' }));
}
/** REQ-MCP-114: the fate of a carried server as one sentence of text (REQ-SHELL-149). */
export function mcpFateText(s: { readonly fate: 'connected' | 'dropped'; readonly reason?: string | undefined }): string {
  return s.fate === 'connected' ? 'connected' : `dropped${s.reason ? ` — ${s.reason}` : ''}`;
}
/**
 * REQ-MONITOR-049/060: the granted set, else the persona's declared tools stand in — but never for a LIVE run-level agent
 * (REQ-MONITOR-061; see `runLevelGrant`), whose empty set means its root port has not resolved yet, not that no grant was
 * recorded: the persona has a live instance, so REQ-MONITOR-060's stand-in does not apply, and a coordinator's declared set
 * holds the write, terminal and commit tools its policy withholds. A recorded grant is shown as it is, an empty one as no
 * native tool (`grantRecorded`, REQ-TOOLS-006): until 2026-10-01 an empty list read as no grant recorded, so a child whose
 * controls removed every native tool listed them all
 * (docs/defects/fixed/a-grant-the-controls-left-empty-reads-as-no-grant-recorded.md).
 */
export function resolvedTools(agent: Pick<AgentRecord, 'id' | 'grantedTools' | 'grantRecorded' | 'live'>, declared: readonly string[]): string[] {
  if (agent.grantedTools.length > 0 || agent.grantRecorded) return [...agent.grantedTools];
  return agent.id === RUN_AGENT_ID && agent.live ? [] : [...declared];
}

/**
 * What cancelling an agent cancels with it — the set the engine ends, so the confirmation never understates it
 * (REQ-MONITOR-064/128): every descendant not yet finished, live or paused, through a finished one; for the run, its
 * every live or paused agent. Since clause 13 made a paused agent its own state rather than `queued`, a live agent's
 * cancel still ends its paused descendants (OQ-100), so counting them departs from REQ-MONITOR-064/128's "live"
 * descendants — a departure OQ-100 and OQ-101 record and put to the owner. A paused child's is the same set: at rest
 * every unfinished descendant is paused, so it is the paused ones the at-rest cancel ends (PD-ORCH-005 clause 16,
 * OQ-101); while a run is still `pausing`, a persona window's cancel (REQ-SHELL-075(g)) reaches the live cancel, which
 * also ends a descendant whose in-flight call has not yet let it rest.
 */
export function cancelCascade(agents: readonly AgentRecord[], agent: Pick<AgentRecord, 'id'>): AgentRecord[] {
  const reached = (a: AgentRecord) => a.presentationState === 'paused' || a.presentationState === 'running' || a.presentationState === 'waiting' || a.presentationState === 'queued';
  if (agent.id === RUN_AGENT_ID) return agents.filter(reached);
  const out: AgentRecord[] = [];
  const walk = (parent: string) => { for (const a of agents) if (a.parentId === parent) { if (reached(a)) out.push(a); walk(a.id); } };
  walk(agent.id);
  return out;
}
/** The adjective a cascade's agents share (OQ-100): `live`, `paused`, or `live and paused` for a mix. */
export function cascadeKind(cascade: readonly Pick<AgentRecord, 'presentationState'>[]): 'live' | 'paused' | 'live and paused' {
  const paused = cascade.filter((a) => a.presentationState === 'paused').length;
  return paused === 0 ? 'live' : paused === cascade.length ? 'paused' : 'live and paused';
}

/**
 * REQ-MONITOR-126: the confirmation the run's cancel states, the one text every surface that cancels the whole run
 * shows. PD-ORCH-005 clause 3 keeps that cancel final, so "cannot be undone" stays true of it, from whichever surface asks
 * (clause 15).
 */
export const CANCEL_RUN_TEXT = 'Cancellation cannot be undone in this session. The active run and every active task agent will be cancelled.';

/**
 * REQ-MONITOR-126 / REQ-MONITOR-128: what confirming a cancel states. For the run instance it is the run's own cancel,
 * which is final. For an agent it names that agent and gives one line per descendant cancelled with it — live, and the
 * paused ones its cancel also ends (`cancelCascade`, OQ-100 and OQ-101). The
 * Workspace and a persona window confirm through it, so the button REQ-SHELL-075(g) puts in the persona window can no
 * longer cancel unconfirmed (found by phase 5's third review).
 */
export function cancelConfirmation(agent: { readonly id: string; readonly name: string }, agents: readonly AgentRecord[]): { title: string; body: string; lines: string[]; confirmLabel: string; cancelLabel: string } {
  if (agent.id === RUN_AGENT_ID) return { title: 'Cancel the run?', body: CANCEL_RUN_TEXT, lines: [], confirmLabel: 'Cancel the run', cancelLabel: 'Keep running' };
  const cascade = cancelCascade(agents, agent);
  // PD-ORCH-005 clause 16 (OQ-101): a paused child is confirmed naming it and one line per descendant cancelled with it —
  // paused at rest, and any a `pausing` run has not yet brought to rest; it is final (clause 3), and the rest of its
  // iteration still resumes.
  if (agents.find((a) => a.id === agent.id)?.presentationState === 'paused') {
    return { title: `Cancel ${agent.name}?`, body: cascade.length > 0 ? pausedCancelWith(cascadeKind(cascade)) : PAUSED_CANCEL_ALONE, lines: cascade.map((a) => a.name), confirmLabel: `Cancel ${agent.name}`, cancelLabel: 'Keep it paused' };
  }
  return { title: `Cancel ${agent.name}?`, body: cascade.length > 0 ? `Its ${cascadeKind(cascade)} descendants will be cancelled with it:` : 'The agent will be cancelled.', lines: cascade.map((a) => a.name), confirmLabel: `Cancel ${agent.name}`, cancelLabel: 'Keep running' };
}
/** PD-ORCH-005 clauses 3 and 16: what cancelling a paused child states — it will not resume; the rest of its iteration will. */
export const pausedCancelWith = (kind: ReturnType<typeof cascadeKind>): string => `Cancellation cannot be undone: the agent will not resume, and its ${kind} descendants are cancelled with it:`;
export const PAUSED_CANCEL_WITH = pausedCancelWith('paused');
export const PAUSED_CANCEL_ALONE = 'Cancellation cannot be undone: the agent will not resume. The other paused agents resume when the session continues.';

/**
 * REQ-MONITOR-064's sentence over what cancelling cascades to (`cancelCascade`), empty when nothing does (REQ-SHELL-044's
 * noun agreement). The adjective names what is cascaded to: `live`, or — PD-ORCH-005 clauses 13 and 16, OQ-100/OQ-101 —
 * `paused`, or `live and paused` for a live agent some of whose descendants already rest.
 */
export function cascadeNote(cascade: readonly Pick<AgentRecord, 'presentationState'>[]): string {
  const count = cascade.length;
  if (count <= 0) return '';
  return `Cancelling cascades to ${count} ${cascadeKind(cascade)} ${count === 1 ? 'descendant' : 'descendants'}.`;
}

/** REQ-MONITOR-274/276: pause is valid for the run-level selection only, while a run executes; the explanation is text. */
export const PAUSE_SELECT_RUN = 'Pause applies to the whole run; select the run to pause it.';
export const PAUSE_NO_RUN = 'Pause is unavailable because no active run exists.';
export function pauseAvailability(selection: string | null, runActive: boolean, executionStatus: string | null): { enabled: boolean; reason: string } {
  if (!runActive) return { enabled: false, reason: PAUSE_NO_RUN };
  if (selection !== RUN_AGENT_ID) return { enabled: false, reason: PAUSE_SELECT_RUN };
  if (executionStatus === 'pausing') return { enabled: false, reason: 'The pause is in progress; the current step finishes first.' };
  return { enabled: true, reason: 'Pauses the whole run after its current step.' };
}

/** REQ-MONITOR-274/116: the activity table's rows in the tree's depth-first order. */
export function tableOrder(agents: readonly AgentRecord[]): AgentRecord[] {
  return treeRows(agents).map((r) => r.agent);
}

/** REQ-MONITOR-045/065/087: the ring's figures — percent of the limit, the threshold mark, the fill's band. */
export function ringFigures(used: number, limit: number, thresholdPercent: number): { percent: number; threshold: number; band: 'ok' | 'warn' | 'fail' } {
  const percent = contextPercent(used, limit);
  const threshold = Math.max(1, Math.min(100, Math.round(thresholdPercent)));
  const band = percent >= threshold ? 'fail' : percent >= threshold * 0.75 ? 'warn' : 'ok';
  return { percent, threshold, band };
}

/** REQ-SHELL-044: a count with a noun that agrees with it — the kernel's, so every package words a count one way. */
export { countNoun };

/** REQ-MONITOR-050: the agents of one persona, in the tree's order — the run-level agent first when it is that persona. */
export function instancesOf(persona: string, agents: readonly AgentRecord[], runLevel: AgentRecord | null): AgentRecord[] {
  const own = tableOrder(agents).filter((a) => a.persona === persona);
  return runLevel && runLevel.persona === persona ? [runLevel, ...own] : own;
}

/**
 * REQ-MONITOR-071: the transcript rows an instance authored — by its name; the run-level agent's by the entry persona and
 * every name the session's roots carry (`ownRow`).
 */
export function rowsOf(rows: readonly TranscriptRow[], agent: AgentRecord, roots: readonly EntryRoot[] = []): TranscriptRow[] {
  return rows.filter((r) => !NOT_FOLLOWED_KINDS.has(r.kind) && ownRow(r, agent, roots));
}

/**
 * The names an agent's artifacts record it by: a child's canonical name; the run-level agent's entry persona and, for each
 * of the session's roots (`roots`), its persona and its canonical name — which its publishes and reads record
 * (REQ-LIBRARY-093) and which is not the entry persona for a persona the canonicaliser rewrites
 * (docs/defects/fixed/the-run-level-agent-is-known-by-its-entry-persona-alone.md).
 */
function artifactNames(agent: Pick<AgentRecord, 'name'> & { readonly id?: string }, roots: readonly EntryRoot[]): string[] {
  return agent.id === RUN_AGENT_ID ? [agent.name, ...roots.flatMap((r) => [r.name, r.canonical])] : [agent.name];
}

/**
 * REQ-MONITOR-044/052/069 (live-run finding K1, R-067): an agent's artifact links — the ones it PRODUCED (the artifact's
 * producer is one of the names it is recorded by, `artifactNames`: a child's canonical name; the run-level agent's roots'
 * names, which its publishes record) and the ones it RECEIVED (one of those names among the artifact's consumers), each in
 * the session's creation order. A pure reading of the session's list, so every surface draws the same links.
 */
export function agentArtifacts(agent: Pick<AgentRecord, 'name'> & { readonly id?: string }, artifacts: readonly SessionArtifactLink[], roots: readonly EntryRoot[] = []): { readonly produced: SessionArtifactLink[]; readonly received: SessionArtifactLink[] } {
  const names = new Set(artifactNames(agent, roots));
  return { produced: artifacts.filter((a) => names.has(a.producer)), received: artifacts.filter((a) => !names.has(a.producer) && a.consumedBy.some((c) => names.has(c))) };
}
/** REQ-MONITOR-068 (live-run finding K1): the persona-wide card — every artifact any instance of the persona produced. */
export function personaArtifacts(instances: readonly (Pick<AgentRecord, 'name'> & { readonly id?: string })[], artifacts: readonly SessionArtifactLink[], roots: readonly EntryRoot[] = []): SessionArtifactLink[] {
  const names = new Set(instances.flatMap((a) => artifactNames(a, roots)));
  return artifacts.filter((a) => names.has(a.producer));
}

/**
 * REQ-ORCH-089 / REQ-MONITOR-119 (the repair of `a-stalled-child-is-never-shown-stalled.md`): the stalled badge's text — the
 * silence the agent's stall watch last found, in the elapsed figure's own form. The figure is the engine's, refreshed at
 * each evaluation, so it advances at the watch's cadence (REQ-MONITOR-117) rather than on the surface's clock; null draws
 * nothing. State is text as well as colour (REQ-SHELL-149).
 */
export function stalledText(seconds: number | null): string | null {
  // A no-break space: the figure never wraps away from its word (the live run's inspector broke `stalled` / `104s`).
  return seconds === null ? null : `stalled\u00a0${Math.max(0, Math.floor(seconds))}s`;
}

/**
 * REQ-MONITOR-052/069: the meta line and the context line, the elapsed fallback an em-dash / a hyphen; a stalled agent says so.
 * Its `{state}` is `agentStateLabel`'s over the shown session (REQ-MONITOR-127/130, OQ-165's reading): the run-level agent
 * reads the run's `cancelling` while it is live and the session reads it, as a persona window does. Until 2026-10-01 the line
 * read `presentationState` alone, so beside the run header's `Cancelling…` it read `running`
 * (docs/defects/fixed/the-inspector-meta-line-reads-the-run-level-agent-running-while-the-run-is-cancelling.md).
 */
/**
 * REQ-MONITOR-281 with REQ-MONITOR-086: the compression count the inspector's ring caption and a persona window's context card
 * draw beside the token and tool-call counts, labelled with its unit and on a line of its own, since REQ-MONITOR-052's meta
 * line and REQ-MONITOR-069's context line have fixed forms. The run-level agent's is the run-wide count (OQ-159's recorded
 * reading) and says so; a child's is its own.
 */
export function compressionLine(agent: AgentRecord): string {
  return `${countNoun(agent.compressions, 'compression')} ${agent.id === RUN_AGENT_ID ? 'across the run' : "of this agent's context"}`;
}

export function metaLine(agent: AgentRecord, session: Pick<SessionRecord, 'executionStatus'> | null, elapsed: string | null): string {
  const stalled = stalledText(agent.stalledSeconds);
  return `${agentStateLabel(agent, session)} · ${elapsed ?? '—'} · ${countNoun(agent.toolCalls, 'tool call')}${stalled === null ? '' : ` · ${stalled}`}`;
}
