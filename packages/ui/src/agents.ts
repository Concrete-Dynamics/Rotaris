import { contextPercent, DEFAULT_CONTEXT_CAPACITY, isBusy, RUN_AGENT_ID, type AgentRecord, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';
import { treeRows } from './AgentTree.js';

/**
 * The agent surfaces' pure rules (Part R): what the inspector follows (REQ-MONITOR-053), the run-level agent as a
 * surface presents it (REQ-MONITOR-057/058, REQ-MONITOR-274's pause rule), the chip states (REQ-MONITOR-060/062),
 * the cascade count (REQ-MONITOR-064), the table's order (REQ-MONITOR-036) and the noun agreement (REQ-SHELL-044).
 * Structure from docs/spec; nothing here renders.
 */

/** REQ-MONITOR-063: Steer while running or waiting; Cancel while running, waiting or queued; Pop out always. */
export function inspectorEnablement(state: AgentRecord['presentationState'] | null): { steer: boolean; cancel: boolean; popOut: boolean } {
  if (state === null) return { steer: false, cancel: false, popOut: false };
  return { steer: state === 'running' || state === 'waiting', cancel: state === 'running' || state === 'waiting' || state === 'queued', popOut: true };
}

/**
 * REQ-MONITOR-043/057: the run itself is never a tree row, but the inspector, the Mission view and the persona
 * windows present the entry role as the run-level agent — its rows are the transcript's `agent`/`tool` rows whose
 * name is the entry persona and no child's. Nothing in the record carries its tool history or its latest prompt
 * reading (the reading is in the Part R handoff), so those read empty and the persona's declared tools stand in.
 */
export function runLevelAgent(session: SessionRecord | null, entry: { readonly persona: string; readonly model: string; readonly reasoning: string; readonly tools: readonly string[] }): AgentRecord | null {
  if (!session || session.runStartedAt === null) return null;
  const busy = isBusy(session.executionStatus);
  const status = session.executionStatus;
  const presentationState: AgentRecord['presentationState'] = busy ? 'running' : status === 'completed' ? 'done' : status === 'failed' ? 'failed' : status === 'waiting' ? 'running' : 'cancelled';
  const childCalls = session.agents.reduce((n, a) => n + a.toolCalls, 0);
  return {
    id: RUN_AGENT_ID, name: entry.persona, givenName: entry.persona, persona: entry.persona, state: busy ? 'running' : presentationState === 'done' ? 'succeeded' : presentationState === 'failed' ? 'failed' : 'cancelled',
    presentationState, parentId: '', dependencies: [], activity: session.summary?.message ?? '', model: entry.model, depth: 0, background: false, category: '',
    spawnedAt: session.runStartedAt, completedAt: busy ? null : session.updatedAt, toolCalls: Math.max(0, session.toolCalls.total - childCalls), delegationTask: '',
    reasoning: entry.reasoning, contextUsed: 0, contextLimit: DEFAULT_CONTEXT_CAPACITY, grantedTools: [...entry.tools], calledTools: [], activeTools: [], delegationSessionId: null, inheritedContext: '', live: busy,
    // Part S's evidence (REQ-MCP-065/114) is per child; the run-level agent carries none in this build.
    grantedMcp: {}, mcpServers: [],
  };
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

/** REQ-MONITOR-064: the live (running, waiting, queued) descendants of an agent, depth-first; the run's are every live agent. */
export function liveDescendants(agents: readonly AgentRecord[], id: string): AgentRecord[] {
  const live = (a: AgentRecord) => a.presentationState === 'running' || a.presentationState === 'waiting' || a.presentationState === 'queued';
  if (id === RUN_AGENT_ID) return agents.filter(live);
  const out: AgentRecord[] = [];
  const walk = (parent: string) => { for (const a of agents) if (a.parentId === parent) { if (live(a)) out.push(a); walk(a.id); } };
  walk(id);
  return out;
}
/** REQ-MONITOR-064's sentence, empty when nothing cascades (REQ-SHELL-044's noun agreement). */
export function cascadeNote(count: number): string {
  if (count <= 0) return '';
  return `Cancelling cascades to ${count} live ${count === 1 ? 'descendant' : 'descendants'}.`;
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
