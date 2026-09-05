import { z } from 'zod';

/**
 * The delegated-child machine, in ONE place (REQ-MONITOR-014, REQ-MONITOR-300, REQ-MONITOR-046,
 * REQ-ORCH-112, REQ-TOOLS-153): the ten states, the four absorbing ones, the legal-transition table AS
 * DATA, the two settling paths, the report-status vocabulary and its mapping to a terminal state, and the
 * presentation mapping a surface reads. Every other package cites this and restates nothing.
 */
export const CHILD_STATES = [
  'queued', 'starting', 'running', 'summarizing', 'waiting_on_dependencies', 'waiting_on_model_slot', 'succeeded', 'failed', 'cancelled', 'blocked',
] as const;
export type ChildState = (typeof CHILD_STATES)[number];

export const TERMINAL_CHILD_STATES: ReadonlySet<ChildState> = new Set<ChildState>(['succeeded', 'failed', 'cancelled', 'blocked']);
export function isTerminalChildState(s: string): boolean {
  return TERMINAL_CHILD_STATES.has(s as ChildState);
}

/** REQ-MONITOR-300's table, exactly; terminal states have no row because nothing leaves them. */
export const CHILD_TRANSITIONS: Readonly<Record<ChildState, readonly ChildState[]>> = Object.freeze({
  waiting_on_dependencies: ['queued', 'blocked'],
  queued: ['starting', 'waiting_on_model_slot', 'blocked'],
  waiting_on_model_slot: ['queued', 'blocked'],
  starting: ['running', 'failed'],
  running: ['summarizing', 'succeeded', 'failed'],
  summarizing: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
  cancelled: [],
  blocked: [],
});

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

/** REQ-MONITOR-046: engine state → presentation state. */
export const PRESENTATION_CHILD_STATES = ['running', 'waiting', 'queued', 'done', 'failed', 'cancelled'] as const;
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
  /** REQ-MONITOR-049: the granted native tool set as recorded at spawn; empty when no grant was recorded (the surface lets the persona's declared tools stand in). */
  grantedTools: z.array(z.string()),
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
