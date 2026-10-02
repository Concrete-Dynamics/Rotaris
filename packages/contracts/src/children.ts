import { z } from 'zod';

/**
 * The delegated-child machine, in ONE place (REQ-MONITOR-014, REQ-MONITOR-300, REQ-MONITOR-046,
 * REQ-ORCH-112, REQ-TOOLS-153): the eleven states, the four absorbing ones, the legal-transition table AS
 * DATA, the two settling paths, the report-status vocabulary and its mapping to a terminal state, and the
 * presentation mapping a surface reads. Every other package cites this and restates nothing.
 *
 * PD-ORCH-005 (narrowing REQ-MONITOR-300) adds the eleventh, `paused`: where a run comes to rest by a pause, a stop, a
 * quit or a crash, every agent that has not reached a terminal state is left in it, with its interruption recorded,
 * and it moves back to the state it resumes into when its iteration resumes.
 */
export const CHILD_STATES = [
  'queued', 'starting', 'running', 'summarizing', 'waiting_on_dependencies', 'waiting_on_model_slot', 'succeeded', 'failed', 'cancelled', 'blocked', 'paused',
] as const;
export type ChildState = (typeof CHILD_STATES)[number];

export const TERMINAL_CHILD_STATES: ReadonlySet<ChildState> = new Set<ChildState>(['succeeded', 'failed', 'cancelled', 'blocked']);
export function isTerminalChildState(s: string): boolean {
  return TERMINAL_CHILD_STATES.has(s as ChildState);
}

/**
 * REQ-MONITOR-300's table, exactly, with PD-ORCH-005's `paused`: every non-terminal state may move to it when the run
 * comes to rest, and it moves back to the state it resumes into (`RESUME_STATES`). Terminal states have no row
 * because nothing leaves them but a follow-up (clause 22, `isLegalFollowUp`), and `paused` is not one of them: it is left again, and the two settling paths reach a
 * terminal state from it as from any other non-terminal state (a user who continues without the paused agents ends
 * them `cancelled`).
 */
export const CHILD_TRANSITIONS: Readonly<Record<ChildState, readonly ChildState[]>> = Object.freeze({
  waiting_on_dependencies: ['queued', 'blocked', 'paused'],
  queued: ['starting', 'waiting_on_model_slot', 'blocked', 'paused'],
  waiting_on_model_slot: ['queued', 'blocked', 'paused'],
  starting: ['running', 'failed', 'paused'],
  running: ['summarizing', 'succeeded', 'failed', 'paused'],
  summarizing: ['succeeded', 'failed', 'paused'],
  paused: ['queued', 'waiting_on_dependencies', 'waiting_on_model_slot', 'running', 'summarizing'],
  succeeded: [],
  failed: [],
  cancelled: [],
  blocked: [],
});

/**
 * PD-ORCH-005: what interrupted an agent left `paused` — the four ways a run comes to rest with agents unfinished.
 * An explicit cancel is not among them: it ends its agents `cancelled`, and those are never resumed.
 */
export const INTERRUPTIONS = ['pause', 'stop', 'quit', 'crash'] as const;
export type Interruption = (typeof INTERRUPTIONS)[number];
export function isInterruption(s: unknown): s is Interruption {
  return typeof s === 'string' && (INTERRUPTIONS as readonly string[]).includes(s);
}
/** PD-ORCH-005: the interruption as the object of a sentence — "interrupted by the pause", "withdrawn by a crash". */
export function interruptionPhrase(i: string): string {
  switch (i) {
    case 'pause': return 'the pause';
    case 'stop': return 'the stop';
    case 'quit': return 'quitting the application';
    case 'crash': return 'a crash';
    default: return 'the run coming to rest';
  }
}

/**
 * PD-ORCH-005 clause 4: "a `paused` agent moves back to the state it resumes into". The state an agent resumes into,
 * given the state the rest found it in: an agent that had not begun executing goes back to where it waited, one that
 * was claimed but not yet running (`starting`) goes back to `queued` and is claimed again, one that was running
 * resumes running from its record, and one that was summarising resumes summarising.
 */
export const RESUME_STATES = ['queued', 'waiting_on_dependencies', 'waiting_on_model_slot', 'running', 'summarizing'] as const;
export type ResumeState = (typeof RESUME_STATES)[number];
export function resumeStateFor(from: ChildState): ResumeState | null {
  switch (from) {
    case 'queued':
    case 'waiting_on_dependencies':
    case 'waiting_on_model_slot':
    case 'running':
    case 'summarizing':
      return from;
    case 'starting':
      return 'queued';
    default:
      return null;
  }
}
export function isResumeState(s: unknown): s is ResumeState {
  return typeof s === 'string' && (RESUME_STATES as readonly string[]).includes(s);
}

/**
 * PD-ORCH-005 clause 22 (revision 5, narrowing REQ-MONITOR-300): the one exit from a terminal state. A settled child its
 * parent follows up by `delegate`'s `session_id` leaves its terminal state for `queued`, the state a child that has not
 * started waits in, and from there starts as any queued child does — under REQ-ORCH-050's per-model cap and REQ-ORCH-046's
 * active limit (OQ-131). The move is not in `CHILD_TRANSITIONS`, which keeps terminal states absorbing for every other
 * move; it is the writer's `followUpChild` alone, and the engine decides which settled child may take it.
 */
export const FOLLOW_UP_STATE = 'queued' satisfies ChildState;
export function isLegalFollowUp(from: ChildState): boolean {
  return TERMINAL_CHILD_STATES.has(from);
}

/** The two settling paths REQ-MONITOR-300 admits from every non-terminal state, as arguments and never a bypass. */
export type SettlingPath = 'cancellation' | 'reconciliation';

/** Whether `from → to` is legal: by the table, or by a settling path onto a terminal state. */
export function isLegalChildMove(from: ChildState, to: ChildState, via: SettlingPath | null = null): boolean {
  if (TERMINAL_CHILD_STATES.has(from)) return false;
  if (via === 'cancellation') return to === 'cancelled';
  if (via === 'reconciliation') return TERMINAL_CHILD_STATES.has(to);
  return CHILD_TRANSITIONS[from].includes(to);
}

/** REQ-MONITOR-015/020: which states count against the active-child budget and the per-model cap. */
export const ACTIVE_CHILD_STATES: ReadonlySet<ChildState> = new Set<ChildState>(['starting', 'running']);
export const SLOT_HOLDING_STATES: ReadonlySet<ChildState> = new Set<ChildState>(['running', 'summarizing']);

/** REQ-ORCH-112: the closed report-status vocabulary, and its mapping onto a terminal state. */
export const REPORT_STATUSES = ['succeeded', 'partial', 'failed', 'cancelled', 'blocked'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export function reportStatusToState(s: string): ChildState {
  switch (s) {
    case 'succeeded': return 'succeeded';
    case 'partial': return 'succeeded';
    case 'cancelled': return 'cancelled';
    case 'blocked': return 'blocked';
    default: return 'failed';
  }
}
export function normaliseReportStatus(s: string): ReportStatus {
  return (REPORT_STATUSES as readonly string[]).includes(s) ? (s as ReportStatus) : 'failed';
}

/** REQ-MONITOR-211: the run's own outcome dictates where reconciliation settles a non-terminal child. */
export function reconciledState(executionStatus: string): ChildState {
  if (executionStatus === 'completed') return 'succeeded';
  if (executionStatus === 'failed') return 'failed';
  return 'cancelled';
}

/**
 * REQ-MONITOR-046: engine state → presentation state. PD-ORCH-005 clause 13 (revision 4, narrowing REQ-MONITOR-046)
 * gives a `paused` agent a presentation state of its own, `paused`, on every agent surface; every other state the
 * requirement does not name still takes its catch-all, "anything else→queued".
 */
export const PRESENTATION_CHILD_STATES = ['running', 'waiting', 'queued', 'done', 'failed', 'cancelled', 'paused'] as const;
export type PresentationChildState = (typeof PRESENTATION_CHILD_STATES)[number];
export function presentationChildState(s: string): PresentationChildState {
  switch (s) {
    case 'succeeded': return 'done';
    case 'running': return 'running';
    case 'summarizing': return 'running';
    case 'waiting_on_dependencies': return 'waiting';
    case 'waiting_on_model_slot': return 'waiting';
    case 'failed': return 'failed';
    case 'cancelled': return 'cancelled';
    case 'blocked': return 'failed';
    case 'paused': return 'paused';
    default: return 'queued';
  }
}

/** REQ-TOOLS-153: what a `delegate` call reports. */
export const DELEGATE_STATUSES = ['queued', 'waiting_on_dependencies', 'waiting_on_model_slot', 'rejected'] as const;
export type DelegateStatus = (typeof DELEGATE_STATUSES)[number];

export const TASK_ID_PATTERN = /^bg_[0-9a-f]{8}$/;

/** REQ-MONITOR-044's presented agent, as far as this build records it; the run's synthetic root is never one (REQ-MONITOR-043). */
export const AgentRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  givenName: z.string(),
  persona: z.string(),
  state: z.enum(CHILD_STATES),
  presentationState: z.enum(PRESENTATION_CHILD_STATES),
  parentId: z.string(),
  dependencies: z.array(z.string()),
  /** REQ-MONITOR-047: the delegation task, first 180 characters. */
  activity: z.string(),
  model: z.string(),
  depth: z.number().int(),
  background: z.boolean(),
  category: z.string(),
  spawnedAt: z.string(),
  completedAt: z.string().nullable(),
  toolCalls: z.number().int().nonnegative(),
  delegationTask: z.string(),
  /** REQ-MONITOR-048: the persona's configured thinking level, `medium` when none is configured (Part R). */
  reasoning: z.string(),
  /**
   * REQ-MONITOR-049 (Part R): the agent's most recent recorded prompt-token reading — the input count of its latest
   * model step — and the limit it is measured against: the model's own maximum where the run carries one, else the
   * default context capacity of REQ-MONITOR-080. The percentage is derived by the surface (REQ-MONITOR-045), never stored.
   */
  contextUsed: z.number().int().nonnegative(),
  contextLimit: z.number().int().nonnegative(),
  /**
   * REQ-MONITOR-086/281 (Part AH): completed compressions of this agent's context. The durable record is the
   * session's `context_compressed` timeline entries, which a resume counts once to seed this figure, so a
   * completion already counted is never counted again (REQ-MONITOR-102's per-agent metrics).
   */
  compressions: z.number().int().nonnegative(),
  /**
   * REQ-MONITOR-049 / REQ-MCP-065: the granted native tool set as the agent's tool port recorded it once ready (REQ-TOOLS-006's
   * controls applied); empty both when no grant was recorded and when the controls left no native tool — `grantRecorded`
   * tells the two apart.
   */
  grantedTools: z.array(z.string()),
  /**
   * REQ-MONITOR-049/060: whether a grant was recorded for this agent. Only where none was do the persona's declared tools
   * stand in for `grantedTools` on the surface; a recorded grant is shown as it is, an empty one as no native tool. Until
   * 2026-10-01 an empty list stood for "no grant recorded", so a grant the controls left empty listed every declared tool
   * (docs/defects/fixed/a-grant-the-controls-left-empty-reads-as-no-grant-recorded.md).
   */
  grantRecorded: z.boolean(),
  /** REQ-MONITOR-044/060: the distinct tool names this agent has called, in first-call order (maintained incrementally, REQ-MONITOR-038). */
  calledTools: z.array(z.string()),
  /** REQ-MONITOR-044/060: the tool calls running now, by name. */
  activeTools: z.array(z.string()),
  /** REQ-MONITOR-044: the delegation session an agent runs in; this build runs every child in the run's own session, so it is null. */
  delegationSessionId: z.string().nullable(),
  /** REQ-MONITOR-044 / REQ-ORCH-046: the inherited-context entries as one text, empty when none. */
  inheritedContext: z.string(),
  /** REQ-MONITOR-046's "live": exactly when the presentation state is running. */
  live: z.boolean(),
  /** REQ-MCP-065 / REQ-MCP-100: the granted MCP tools, server → callable names, from the row's recorded evidence. */
  grantedMcp: z.record(z.string(), z.array(z.string())),
  /** REQ-MCP-114: every server the agent carried, with its fate — connected, or dropped with the rule's reason. */
  mcpServers: z.array(z.object({ name: z.string(), transport: z.string(), origin: z.string(), fate: z.enum(['connected', 'dropped']), reason: z.string().optional() })),
  /** PD-ORCH-005: what left this agent `paused`; null for an agent that is not paused. */
  interruption: z.enum(INTERRUPTIONS).nullable(),
  /**
   * REQ-ORCH-089 / REQ-MONITOR-119/120: the seconds this agent has gone with no model event or token, as its stall watch's
   * latest evaluation found them, while that evaluation finds it stalled; null while it is not (recovered, waiting on its
   * tool calls, or not running). Refreshed at every evaluation, so a surface's figure advances at the watch's cadence.
   */
  stalledSeconds: z.number().int().nonnegative().nullable(),
});
export type AgentRecord = z.infer<typeof AgentRecordSchema>;

/** REQ-MONITOR-080: the default context capacity, the one figure every limit falls back to when the model's own is unknown. */
export const DEFAULT_CONTEXT_CAPACITY = 265_000;
/** REQ-MONITOR-009 / REQ-ORCH-133: the reserved id that names the run itself on the control channel (`cancelAgent`, `submitSteeringPrompt`). */
export const RUN_AGENT_ID = 'run';
/** REQ-MONITOR-045: the used fraction of the limit as a whole percent; 0 when the limit is zero or negative. */
export function contextPercent(used: number, limit: number): number {
  if (!(limit > 0)) return 0;
  return Math.round((Math.max(0, used) / limit) * 100);
}

/**
 * REQ-ORCH-072: the iteration's root execution record.
 * Created with the entry role and the task's execution payload and transitioned to running.
 * That record is the run's own and is NOT a delegated child: it never arrives through a `delegate`
 * call, counts against none of the admission limits of REQ-ORCH-046 (depth, total, active), holds no
 * per-model slot of REQ-ORCH-050, and is not presented as a task agent (REQ-MONITOR-043,
 * REQ-MONITOR-089, REQ-CHAT-068).
 * It carries an identity of the same shape a delegated child carries — a canonical name and a task id,
 * in the same namespace — so a lookup naming the root resolves to it rather than reporting it unknown;
 * the parent-scoping of REQ-TOOLS-155 and REQ-TOOLS-156 is unchanged by that, so an agent asking about
 * a record it does not own is refused for that reason and never told the root does not exist.
 * Every delegated child of the iteration names the root execution record as its parent and sits one
 * level deeper than it.
 */
export interface RootExecutionRecord {
  readonly taskId: string;
  readonly canonicalName: string;
  readonly persona: string;
  readonly task: string;
  readonly iteration: number;
  readonly depth: 0;
  /** PD-ORCH-005: `paused` while its iteration is open after a pause, a stop, a quit or a crash. */
  state: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'paused';
}
