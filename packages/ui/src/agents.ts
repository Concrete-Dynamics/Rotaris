import { contextPercent, DEFAULT_CONTEXT_CAPACITY, isBusy, RUN_AGENT_ID, type AgentRecord, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';
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
 * them" (OQ-74). The inspector, the Mission view and the Workspace's agents header decide by it; a persona window offers
 * Cancel always (REQ-SHELL-075(g)).
 */
export function cancelOffered(agent: Pick<AgentRecord, 'id' | 'presentationState'> | null, runActive: boolean, resting: boolean): boolean {
  if (agent === null) return false;
  if (agent.presentationState === 'paused') return resting && agent.id !== RUN_AGENT_ID;
  return runActive && inspectorEnablement(agent.presentationState).cancel;
}

/**
 * Whether the Workspace's agents header offers Steer for the selected agent: a live one — running, waiting or queued —
 * while its run is active. A paused agent is not live (PD-ORCH-005 clause 13, REQ-MONITOR-045, OQ-73), so it is offered
 * none, as the inspector offers none (`inspectorEnablement`). The header's `queued`, which the inspector's REQ-MONITOR-063
 * rule does not steer, is older than clause 13 and kept.
 */
export function steerOffered(agent: Pick<AgentRecord, 'presentationState'> | null, runActive: boolean): boolean {
  if (agent === null || !runActive) return false;
  const s = agent.presentationState;
  return s === 'running' || s === 'waiting' || s === 'queued';
}

/**
 * PD-ORCH-005 clauses 13 and 19 (OQ-73): the iteration's root resumes with its paused agents and the Continue action
 * counts it, so while the session rests with an iteration open — `paused` or `interrupted`, or in REQ-CHAT-008's
 * recovery state, which only the caller knows (`recovery`) — the run-level agent presents as `paused` too, the tree
 * agreeing with the count. The one predicate for the composer's count (`WorkspaceView`'s `resumable`), the resting root
 * and a paused child's Cancel (`cancelOffered`'s `resting`, clause 16), so the three cannot drift apart.
 */
export function runLevelResting(session: SessionRecord, recovery = false): boolean {
  const status = session.executionStatus;
  return session.resumable !== null && (status === 'paused' || status === 'interrupted' || (recovery && isBusy(status)));
}

/**
 * REQ-MONITOR-043/057: the run itself is never a tree row, but the inspector, the Mission view and the persona
 * windows present the entry role as the run-level agent — its rows are the transcript's `agent`/`tool` rows whose
 * name is the entry persona and no child's. Its tool history is still not carried; its latest prompt reading IS,
 * from Part AH's `entryContext` (REQ-MONITOR-089) — before that every root-level meter drew zero for a run that
 * spawned no child, whatever the run had actually spent.
 */
export function runLevelAgent(session: SessionRecord | null, entry: { readonly persona: string; readonly model: string; readonly reasoning: string; readonly tools: readonly string[] }, recovery: boolean): AgentRecord | null {
  if (!session || session.runStartedAt === null) return null;
  const resting = runLevelResting(session, recovery);
  const busy = isBusy(session.executionStatus) && !resting;
  const status = session.executionStatus;
  const presentationState: AgentRecord['presentationState'] = resting ? 'paused' : busy ? 'running' : status === 'completed' ? 'done' : status === 'failed' ? 'failed' : status === 'waiting' ? 'running' : 'cancelled';
  const childCalls = session.agents.reduce((n, a) => n + a.toolCalls, 0);
  return {
    id: RUN_AGENT_ID, name: entry.persona, givenName: entry.persona, persona: entry.persona, state: resting ? 'paused' : busy ? 'running' : presentationState === 'done' ? 'succeeded' : presentationState === 'failed' ? 'failed' : 'cancelled',
    presentationState, parentId: '', dependencies: [], activity: session.summary?.message ?? '', model: entry.model, depth: 0, background: false, category: '',
    spawnedAt: session.runStartedAt, completedAt: busy || resting ? null : session.updatedAt, toolCalls: Math.max(0, session.toolCalls.total - childCalls), delegationTask: '',
    // REQ-MONITOR-086: the run-wide count is the sum of the per-agent counts, which is what the synthetic root shows.
    compressions: session.agents.reduce((n, a) => n + a.compressions, 0),
    reasoning: entry.reasoning, contextUsed: session.entryContext.used, contextLimit: session.entryContext.limit > 0 ? session.entryContext.limit : DEFAULT_CONTEXT_CAPACITY, grantedTools: [...entry.tools], calledTools: [], activeTools: [], delegationSessionId: null, inheritedContext: '', live: busy,
    // Part S's evidence (REQ-MCP-065/114) is per child; the run-level agent carries none in this build.
    grantedMcp: {}, mcpServers: [],
    // PD-ORCH-005: the interruption belongs to a delegated agent's record; the synthetic run-level agent carries none.
    interruption: null,
  };
}

/**
 * PD-ORCH-005 clauses 13 and 16 (OQ-73, OQ-74): what a surface drawing the run-level agent and a paused child's Cancel
 * asks, in one call — the run-level agent (`runLevelAgent`) and whether the session rests (`runLevelResting`), both from
 * the same REQ-CHAT-008 `recovery` fact, so the Workspace, the Mission view and a persona window cannot pass it to one and
 * not the other. With no entry role known the run-level agent is null, as the Workspace draws none.
 */
export function restingView(session: SessionRecord | null, entry: Parameters<typeof runLevelAgent>[1] | undefined, recovery: boolean): { readonly runLevel: AgentRecord | null; readonly resting: boolean } {
  return { runLevel: entry ? runLevelAgent(session, entry, recovery) : null, resting: session !== null && runLevelResting(session, recovery) };
}

const NOT_FOLLOWED_KINDS = new Set(['user', 'system', 'intent', 'verifier', 'diff']);

/**
 * REQ-MONITOR-053: with nothing selected, the agent that authored the latest row — scanning backwards past user,
 * intent, system and verifier rows and rows with unknown authorship. A row named for a child is that child; a row
 * named for the entry persona is the run-level agent when one exists.
 */
export function followedAgent(rows: readonly TranscriptRow[], agents: readonly AgentRecord[], runLevel: AgentRecord | null): AgentRecord | null {
  const byName = new Map(agents.map((a) => [a.name, a]));
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]!;
    if (NOT_FOLLOWED_KINDS.has(row.kind)) continue;
    const name = row.name ?? '';
    if (name === '') continue;
    const child = byName.get(name);
    if (child) return child;
    if (runLevel && (name === runLevel.persona || row.persona === runLevel.persona)) return runLevel;
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
/** REQ-MONITOR-049/060: the granted set, else the persona's declared tools stand in. */
export function resolvedTools(agent: Pick<AgentRecord, 'grantedTools'>, declared: readonly string[]): string[] {
  return agent.grantedTools.length > 0 ? [...agent.grantedTools] : [...declared];
}

/**
 * What cancelling an agent cancels with it — the set the engine ends, so the confirmation never understates it
 * (REQ-MONITOR-064/128): every descendant not yet finished, live or paused, through a finished one; for the run, its every
 * live or paused agent. Since clause 13 made a paused agent its own state rather than `queued`, a live agent's cancel
 * still ends its paused descendants (OQ-73). A paused child's is the same set: at rest every unfinished descendant is
 * paused, so it is the paused ones the at-rest cancel ends (PD-ORCH-005 clause 16, OQ-74); while a run is still
 * `pausing`, a persona window's cancel (REQ-SHELL-075(g)) reaches the live cancel, which also ends a descendant whose
 * in-flight call has not yet let it rest.
 */
export function cancelCascade(agents: readonly AgentRecord[], agent: Pick<AgentRecord, 'id'>): AgentRecord[] {
  const reached = (a: AgentRecord) => a.presentationState === 'paused' || a.presentationState === 'running' || a.presentationState === 'waiting' || a.presentationState === 'queued';
  if (agent.id === RUN_AGENT_ID) return agents.filter(reached);
  const out: AgentRecord[] = [];
  const walk = (parent: string) => { for (const a of agents) if (a.parentId === parent) { if (reached(a)) out.push(a); walk(a.id); } };
  walk(agent.id);
  return out;
}
/** The adjective a cascade's agents share (OQ-73): `live`, `paused`, or `live and paused` for a mix. */
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
 * paused ones its cancel also ends (`cancelCascade`, OQ-73 and OQ-74). The
 * Workspace and a persona window confirm through it, so the button REQ-SHELL-075(g) puts in the persona window can no
 * longer cancel unconfirmed (found by phase 5's third review).
 */
export function cancelConfirmation(agent: { readonly id: string; readonly name: string }, agents: readonly AgentRecord[]): { title: string; body: string; lines: string[]; confirmLabel: string; cancelLabel: string } {
  if (agent.id === RUN_AGENT_ID) return { title: 'Cancel the run?', body: CANCEL_RUN_TEXT, lines: [], confirmLabel: 'Cancel the run', cancelLabel: 'Keep running' };
  const cascade = cancelCascade(agents, agent);
  // PD-ORCH-005 clause 16 (OQ-74): a paused child is confirmed naming it and one line per descendant cancelled with it —
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
 * noun agreement). The adjective names what is cascaded to: `live`, or — PD-ORCH-005 clauses 13 and 16, OQ-73/OQ-74 —
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

/** REQ-SHELL-044: a count with a noun that agrees with it. */
export function countNoun(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** REQ-MONITOR-050: the agents of one persona, in the tree's order — the run-level agent first when it is that persona. */
export function instancesOf(persona: string, agents: readonly AgentRecord[], runLevel: AgentRecord | null): AgentRecord[] {
  const own = tableOrder(agents).filter((a) => a.persona === persona);
  return runLevel && runLevel.persona === persona ? [runLevel, ...own] : own;
}

/** REQ-MONITOR-071: the transcript rows an instance authored — by its name; the run-level agent's by the entry persona. */
export function rowsOf(rows: readonly TranscriptRow[], agent: AgentRecord): TranscriptRow[] {
  if (agent.id === RUN_AGENT_ID) return rows.filter((r) => !NOT_FOLLOWED_KINDS.has(r.kind) && (r.name === agent.persona || (r.name === undefined && r.persona === agent.persona)));
  return rows.filter((r) => r.name === agent.name && !NOT_FOLLOWED_KINDS.has(r.kind));
}

/** REQ-MONITOR-052/069: the meta line and the context line, the elapsed fallback an em-dash / a hyphen. */
export function metaLine(agent: AgentRecord, elapsed: string | null): string {
  return `${agent.presentationState} · ${elapsed ?? '—'} · ${countNoun(agent.toolCalls, 'tool call')}`;
}
