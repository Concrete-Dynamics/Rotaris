import { type Clocks, countNoun, millis, type Millis, type TimerHandle } from '@rotaris/kernel';
import type { ChatMessage, ModelError } from '@rotaris/model';
import type { SessionWriter } from '../session-writer.js';

/**
 * REQ-ORCH-089 / REQ-MONITOR-117..120, the stall watchdog, and REQ-NOTIFY-111/112, the one corrective message a child
 * that produced no output is owed. The repair of `a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md`.
 *
 * The watch is visibility only and never cancels anything (REQ-ORCH-089, REQ-MONITOR-285). On a fixed cadence taken from
 * the stall threshold it asks how long the child has gone without a model event or token:
 * - with a tool call in flight, it reports that the child is waiting on its calls (REQ-MONITOR-118);
 * - with none, it reports a stall at every evaluation, and marks the warning due only at entry and then no more often
 *   than the throttle (REQ-MONITOR-119/120); the `stall` issue is written with the warning only (PD-MONITOR-005
 *   revision 2, `stallRecords`);
 * - when activity resumes, it reports the recovery;
 * - between the child's turns — its turn has ended and the run asks nothing of it until it starts the next, which is a
 *   wait on its own children or the end of its execution — there is no model step to be silent, so it reports neither
 *   (OQ-155, the repair of `a-child-waiting-on-its-own-children-is-reported-stalled.md`). Each of those children has its
 *   own watch, which reports its own silence;
 * - while the run itself holds the agent between two model steps — a retry's backoff or the suspended wait on a provider
 *   limit (REQ-ORCH-091/092), or a context compression's own model call (ADR-0060) — it reports that wait at
 *   REQ-MONITOR-118's informational level, and no stall (OQ-173, the repair of
 *   `a-provider-wait-or-a-compression-is-counted-as-a-stall.md`). The wait's end restarts the silence, as a tool call's
 *   result does.
 * The callback fires on every evaluation with the stalled state, so a host can draw a badge.
 *
 * The recovery is separate from the watch. A child whose turn ends `failed`, having produced no output for the whole
 * window before it ended, is recovery-eligible (REQ-NOTIFY-112). It is given one corrective message and resumes from where
 * it stopped (REQ-NOTIFY-111). OQ-127 records the readings.
 */

/** REQ-MONITOR-117: one sixth of the threshold, never shorter than 1 s and never longer than 5 s. */
export function stallCadence(thresholdMs: number): Millis {
  return millis(Math.max(1_000, Math.min(thresholdMs / 6, 5_000)));
}

/** REQ-MONITOR-120: the gap between repeated warnings is the threshold, or 30 s, whichever is longer. */
export function stallRepeat(thresholdMs: number): Millis {
  return millis(Math.max(thresholdMs, 30_000));
}

/** The model events that are output: a token of the answer, of the reasoning, or of a tool call (REQ-NOTIFY-112, OQ-127). */
const OUTPUT_EVENTS: ReadonlySet<string> = new Set(['text', 'reasoning', 'tool-call']);

/**
 * OQ-173: a wait the run imposes on an agent between its model steps — a transient or validation retry's backoff
 * (REQ-ORCH-092), the suspended wait on a provider limit (REQ-ORCH-091 (c)), or a context compression's own model call,
 * automatic or on a rejection (REQ-MONITOR-076, REQ-ORCH-093). "Imposed wait" is not the specification's word: the
 * specification names the backoff, the suspended wait and the compression one by one and has no word for the three
 * together. OQ-173's ruling (2026-10-06, R-071, `PD-MONITOR-005`) accepted the behaviour and gave the waits no
 * timeline word, so "imposed wait" stays this code's own name for the three.
 */
export type ImposedWait = 'backoff' | 'provider_limit' | 'compression';

/** OQ-173: how a wait the run imposes is announced to a stall watch (`StallWatch.imposedWait`); the result releases it. */
export type ImposedWaitPort = (wait: ImposedWait) => () => void;

/** OQ-173: runs `body` inside a wait the run imposes, released however it ends. With no port, it just runs `body`. */
export async function duringImposedWait<T>(port: ImposedWaitPort | undefined, wait: ImposedWait, body: () => Promise<T>): Promise<T> {
  const release = port?.(wait);
  try {
    return await body();
  } finally {
    release?.();
  }
}

/** What `stallImposedWaitLine` calls each wait. */
const IMPOSED_WAIT_WORDS: Readonly<Record<ImposedWait, string>> = { backoff: 'a retry backoff', provider_limit: 'a provider limit', compression: 'a context compression' };

/** What one stall report carries (REQ-ORCH-089's diagnostics issue: active tools, the last 5 tool calls, the last model event type). */
export interface StallReport {
  readonly silentS: number;
  /** True at stall entry, false after it. */
  readonly entry: boolean;
  /**
   * REQ-MONITOR-120: whether this evaluation's warning is due — at entry, then no sooner than the throttle. The callback is
   * not throttled (REQ-MONITOR-119: "every stall evaluation"); the warning is, and since PD-MONITOR-005 revision 2 (OQ-127,
   * ruled 2026-10-06) the `stall` issue is written with the warning and only then (`stallRecords`).
   */
  readonly warn: boolean;
  readonly activeTools: readonly string[];
  readonly recentCalls: readonly string[];
  readonly lastModelEvent: string | null;
}

export interface StallSinks {
  /** REQ-MONITOR-119: a stall, at every evaluation that finds one; `warn` says whether the warning (and its issue) is due too. */
  readonly stalled: (report: StallReport) => void;
  /** REQ-MONITOR-118: the same silence with tool calls in flight, at entry and at each repeat the throttle allows. */
  readonly waiting: (report: { readonly silentS: number; readonly activeCalls: number }) => void;
  /**
   * OQ-173: the same silence while the run holds the agent in a wait of its own (`imposedWait`), at entry and at each repeat
   * the throttle allows — REQ-MONITOR-118's manner. Absent means it is not reported.
   */
  readonly imposed?: ((report: { readonly silentS: number; readonly wait: ImposedWait }) => void) | undefined;
  /** REQ-MONITOR-120: activity resumed after a stall — never a stall that ended with none. */
  readonly recovered: () => void;
  /** REQ-ORCH-089: every evaluation, with whether the child is stalled. */
  readonly evaluated: (stalled: boolean) => void;
}

/**
 * One child execution's stall watch. `start` arms it for an attempt and `stop` disarms it; between the two it is fed
 * every model event, every tool call's start and end, and every message the run gives the child.
 */
export class StallWatch {
  private timer: TimerHandle | null = null;
  private lastEventAt: Millis;
  private lastOutputAt: Millis;
  private lastModelEvent: string | null = null;
  private readonly active = new Map<string, string>();
  private readonly recent: string[] = [];
  private stalledNow = false;
  private lastWarnAt: Millis | null = null;
  private lastWaitingAt: Millis | null = null;
  /**
   * REQ-MONITOR-120 (OQ-153): whether the agent has been active since the last evaluation that found it stalled — a model
   * event that is not an error, or something the run gave it (`activity`). A stall that ends without it — the turn was
   * cancelled, paused, stopped, timed out or failed — is over, and is not a recovery.
   */
  private activeSinceStall = false;
  /** OQ-155: the child's turn has ended and the run has not started its next. */
  private between = false;
  /** OQ-173: the waits the run is holding the agent in, by a key of their own; the newest names the wait reported. */
  private readonly imposed = new Map<number, ImposedWait>();
  private imposedKeys = 0;
  private lastImposedAt: Millis | null = null;

  constructor(private readonly clocks: Clocks, readonly thresholdMs: Millis, private readonly sinks: StallSinks) {
    this.lastEventAt = clocks.monotonic.now();
    this.lastOutputAt = this.lastEventAt;
  }

  /** Arms the watch for an attempt: the silence is counted from now. */
  start(): void {
    this.stop();
    this.active.clear();
    this.imposed.clear();
    this.activity();
    this.timer = this.clocks.timers.every(stallCadence(this.thresholdMs), () => this.evaluate());
  }

  stop(): void {
    this.timer?.cancel();
    this.timer = null;
    // REQ-MONITOR-120 (OQ-153): a stall under way when the watch is disarmed — the agent's turn or execution has ended — is
    // over. It is reported recovered only when the agent was active after the stall was last found: found by the live run,
    // whose root answered on the retry and ended before the next evaluation, so its stall was never logged recovered. A
    // stall that ends with no activity — a cancel, a stop, a pause, a hard timeout, a failed turn — is not a recovery.
    this.endStall();
  }

  /** The stall under way, if any, is over: a recovery when the agent was active since it was last found (REQ-MONITOR-120). */
  private endStall(): void {
    if (!this.stalledNow) return;
    this.stalledNow = false;
    this.lastWarnAt = null;
    if (this.activeSinceStall) this.sinks.recovered();
  }

  /**
   * The run gave the child something to answer — its payload, its record at a resume, its children's reports, a re-prompt
   * or the corrective message: the silence starts again, so a wait on its own children before it is not counted in the
   * silence REQ-NOTIFY-112's recovery reads (`quietFor`, OQ-127), and the watch's evaluation, which read no silence during
   * the wait (`betweenTurns`, OQ-155), counts from here.
   */
  activity(): void {
    this.between = false;
    this.activeSinceStall = true;
    const now = this.clocks.monotonic.now();
    this.lastEventAt = now;
    this.lastOutputAt = now;
  }

  /** One streamed part of a model step, by its kind; an error the provider answered with is an event too. */
  modelEvent(kind: string): void {
    const now = this.clocks.monotonic.now();
    this.lastEventAt = now;
    this.lastModelEvent = kind;
    // An error — the provider's, or the call's own abort or timeout — ends a model step; it is not the agent active again.
    if (kind !== 'error') this.activeSinceStall = true;
    if (OUTPUT_EVENTS.has(kind)) this.lastOutputAt = now;
  }

  /**
   * OQ-155: the child's turn has ended. Until the run starts its next (`activity`), the child is waiting on its own
   * children, or its execution is ending: the run asks it for no output, so no silence is counted against it.
   */
  betweenTurns(): void {
    this.between = true;
  }

  /**
   * OQ-173: the run holds the agent in a wait of its own between two model steps — a retry's backoff, the suspended wait
   * on a provider limit, or a context compression's own model call. Until the returned release is called, an evaluation
   * that finds the threshold passed reports the wait (`imposed`) and no stall, and the callback reads not stalled. The
   * release restarts the silence, as a tool call's result does: the agent's next model step starts then, and the wait is
   * not the agent's silence, for REQ-NOTIFY-112's window either. A second call of the release does nothing.
   */
  imposedWait(wait: ImposedWait): () => void {
    const key = (this.imposedKeys += 1);
    this.imposed.set(key, wait);
    return () => {
      if (!this.imposed.delete(key)) return;
      if (this.imposed.size > 0) return;
      const now = this.clocks.monotonic.now();
      this.lastEventAt = now;
      this.lastOutputAt = now;
    };
  }

  toolStarted(callId: string, name: string): void {
    this.active.set(callId, name);
    this.recent.push(name);
    if (this.recent.length > 5) this.recent.shift();
  }

  /** A call's result returned to the child: its next model step starts now, and the silence is counted from here. */
  toolCompleted(callId: string): void {
    this.active.delete(callId);
    this.activity();
  }

  get activeCalls(): number {
    return this.active.size;
  }
  get stalled(): boolean {
    return this.stalledNow;
  }

  /** REQ-NOTIFY-112: how long the child has produced no output — no token since its last output or the last thing it was given. */
  quietFor(): Millis {
    return millis(this.clocks.monotonic.now() - this.lastOutputAt);
  }

  /**
   * REQ-MONITOR-119's host countdown: the whole seconds since the last model event or token, as an evaluation reads them.
   * The host's stall callback reads it when an evaluation finds the agent stalled.
   */
  get silentSeconds(): number {
    return Math.floor((this.clocks.monotonic.now() - this.lastEventAt) / 1000);
  }

  private evaluate(): void {
    const now = this.clocks.monotonic.now();
    const silent = now - this.lastEventAt;
    const silentS = Math.floor(silent / 1000);
    if (this.between || silent < this.thresholdMs) {
      this.lastWaitingAt = null;
      this.lastImposedAt = null;
      this.endStall();
      this.sinks.evaluated(false);
      return;
    }
    const repeat = stallRepeat(this.thresholdMs);
    const imposed = [...this.imposed.values()].at(-1);
    if (imposed !== undefined) {
      // OQ-173: the run's own wait, not the agent's silence — reported as a wait, never as a stall.
      this.lastWaitingAt = null;
      this.endStall();
      if (this.lastImposedAt === null || now - this.lastImposedAt >= repeat) {
        this.lastImposedAt = now;
        this.sinks.imposed?.({ silentS, wait: imposed });
      }
      this.sinks.evaluated(false);
      return;
    }
    this.lastImposedAt = null;
    if (this.active.size > 0) {
      this.endStall();
      if (this.lastWaitingAt === null || now - this.lastWaitingAt >= repeat) {
        this.lastWaitingAt = now;
        this.sinks.waiting({ silentS, activeCalls: this.active.size });
      }
      this.sinks.evaluated(false);
      return;
    }
    this.lastWaitingAt = null;
    const entry = !this.stalledNow;
    const warn = entry || (this.lastWarnAt !== null && now - this.lastWarnAt >= repeat);
    this.stalledNow = true;
    this.activeSinceStall = false;
    if (warn) this.lastWarnAt = now;
    this.sinks.stalled({ silentS, entry, warn, activeTools: [...this.active.values()], recentCalls: [...this.recent], lastModelEvent: this.lastModelEvent });
    this.sinks.evaluated(true);
  }
}

/**
 * Whom a stall line is about: a delegated `child`, in REQ-ORCH-089's words, or the entry `agent`, the run's root, which
 * REQ-MONITOR-117 ("each agent") watches too and REQ-MONITOR-119 calls "the agent".
 */
export type StallSubject = 'child' | 'agent';

/** REQ-ORCH-089's warning, in its own words, with the agent it is about and REQ-MONITOR-119's "still waiting on it". */
export function stallWarning(agentName: string, taskId: string, silentS: number, subject: StallSubject = 'child'): string {
  return `${subject} appears stalled: no model event or token for ${silentS} seconds (${agentName}, ${taskId}); the run is still waiting on it.`;
}

/*
 * The lines below go to the session log (REQ-SESSION-142). Since OQ-127's ruling (2026-10-06, R-071), the three facts
 * REQ-ORCH-139's vocabulary had no word for — the wait on tools, the stall recovered, the corrective message — are also
 * timeline entries under the words OQ-157's ruling gives them (`waiting_on_tools`, `stall_recovered`,
 * `corrective_message`), and a line that records an intended state — a wait, or a recovery — is written at `INFO`, not
 * `WARNING` (`stallRecords`).
 */

/** REQ-MONITOR-118's informational message: the silence with tool calls in flight, which is a wait and not a stall. */
export function stallWaitingLine(agentName: string, taskId: string, activeCalls: number, silentS: number, subject: StallSubject = 'child'): string {
  return `${subject} waiting on tools: ${agentName} (${taskId}) has ${countNoun(activeCalls, 'active tool call')} and no model event or token for ${silentS} seconds; the run is still waiting on it (REQ-MONITOR-118)`;
}

/**
 * OQ-173: the silence while the run holds the agent in a wait of its own, in REQ-MONITOR-118's manner — a wait and not a
 * stall. The suspended wait's own notice (REQ-NOTIFY-083..087) remains what the surfaces state; this line is the session
 * log's.
 */
export function stallImposedWaitLine(agentName: string, taskId: string, wait: ImposedWait, silentS: number, subject: StallSubject = 'child'): string {
  return `${subject} waiting on ${IMPOSED_WAIT_WORDS[wait]}: ${agentName} (${taskId}) has no model event or token for ${silentS} seconds; the wait is the run's own and not a stall (OQ-173)`;
}

/** REQ-MONITOR-120's recovery: activity resumed after a stall. */
export function stallRecoveredLine(agentName: string, taskId: string, subject: StallSubject = 'child'): string {
  return `${subject} stall recovered: ${agentName} (${taskId}) is active again after a stall (REQ-MONITOR-120)`;
}

/** REQ-NOTIFY-111: that the child was given its one corrective message, and why. */
export function correctiveMessageLine(agentName: string, taskId: string, quietS: number, failure: string): string {
  return `child corrective message: ${agentName} (${taskId}) produced no output for ${quietS} seconds and its model request then failed (${failure}); it was given its one corrective message and resumes (REQ-NOTIFY-111)`;
}

/** What `stallRecords` writes through: the session's writer, and the session log at its two levels. */
export interface StallRecordPorts {
  readonly writer: Pick<SessionWriter, 'recordIssue' | 'appendTimeline'>;
  /** The session log at `WARNING` (and the application log): REQ-MONITOR-119's warning. */
  readonly warn: (message: string) => void;
  /** The session log at `INFO` (and the application log): an intended state — a wait, a recovery. */
  readonly info: (message: string) => void;
}

/** One agent's stall records: whom they are about, and whether its execution still belongs to a live run. */
export interface StallRecordSubject {
  readonly subject: StallSubject;
  readonly agentName: string;
  readonly taskId: string;
  /** False once the execution is detached from its run (REQ-SESSION-094): nothing more is written. */
  readonly live: () => boolean;
}

/**
 * What a stall watch's reports write, for a child or the root alike (REQ-ORCH-089, REQ-MONITOR-118..120; OQ-127 and
 * OQ-173; PD-MONITOR-005 and its revision 2):
 * - a stall: REQ-MONITOR-119's warning and its `stall` issue at warning severity, both only when the warning is due — at
 *   entry, then no sooner than REQ-MONITOR-120's throttle. Before PD-MONITOR-005's revision 2 the issue was written at
 *   every evaluation, so one long stall could evict every other issue from REQ-SESSION-133's ring;
 * - a wait on tools: REQ-MONITOR-118's informational line at `INFO`, and a `waiting_on_tools` timeline entry;
 * - a wait the run imposes (OQ-173): the same informational manner, at `INFO`; no timeline word was ruled for it;
 * - a recovery: REQ-MONITOR-120's line at `INFO`, and a `stall_recovered` timeline entry.
 * The callback (`evaluated`) is the caller's.
 */
export function stallRecords(ports: StallRecordPorts, who: StallRecordSubject): Omit<StallSinks, 'evaluated'> {
  const { subject, agentName, taskId } = who;
  return {
    stalled: (s) => {
      if (!who.live() || !s.warn) return;
      const message = stallWarning(agentName, taskId, s.silentS, subject);
      ports.warn(message);
      ports.writer.recordIssue({ kind: 'stall', severity: 'warning', actor: agentName, message, metadata: { task_id: taskId, silent_seconds: s.silentS, active_tools: s.activeTools, recent_tool_calls: s.recentCalls, last_model_event: s.lastModelEvent } });
    },
    waiting: (w) => {
      if (!who.live()) return;
      const message = stallWaitingLine(agentName, taskId, w.activeCalls, w.silentS, subject);
      ports.info(message);
      ports.writer.appendTimeline('waiting_on_tools', agentName, message, { task_id: taskId, silent_seconds: w.silentS, active_calls: w.activeCalls });
    },
    imposed: (w) => { if (who.live()) ports.info(stallImposedWaitLine(agentName, taskId, w.wait, w.silentS, subject)); },
    recovered: () => {
      if (!who.live()) return;
      const message = stallRecoveredLine(agentName, taskId, subject);
      ports.info(message);
      ports.writer.appendTimeline('stall_recovered', agentName, message, { task_id: taskId });
    },
  };
}

/**
 * REQ-NOTIFY-111: that a child was given its one corrective message — a session-log line at `WARNING` (it follows a failed
 * step) and a `corrective_message` timeline entry (OQ-127, OQ-157). The message itself is in the child's conversation
 * record (REQ-ORCH-140).
 *
 * The entry carries the line's severity, `warning`, for the reason OQ-127's ruling keeps the line at `WARNING`: a failed
 * model step precedes it. Until 2026-10-06 (finacc3, finding F11) it took the writer's default, `info`, so one fact read
 * as a warning in the session log and as informational on the timeline.
 */
export function recordCorrectiveMessage(ports: StallRecordPorts, agentName: string, taskId: string, quietS: number, windowS: number, failure: string): void {
  const message = correctiveMessageLine(agentName, taskId, quietS, failure);
  ports.warn(message);
  ports.writer.appendTimeline('corrective_message', agentName, message, { task_id: taskId, quiet_seconds: quietS, window_seconds: windowS, failure }, 'warning');
}

/** REQ-NOTIFY-112's stuck condition this build detects: the child produced no output within the window before it failed. */
export interface NoOutputCondition {
  readonly quietS: number;
  readonly windowS: number;
  /** The headline of the failure its model step ended with. */
  readonly failure: string;
}

/**
 * REQ-NOTIFY-111: the fixed instruction used where no corrective instruction can be composed for a recoverable stuck
 * condition — one addressing a repeated read-then-edit cycle.
 */
export const FIXED_CORRECTIVE_INSTRUCTION = 'You appear to be repeating a cycle of reading files and editing them without making progress. Stop re-reading: make the change the task needs now with what you already know, check it once, and answer with what you did.';

/** How a composed corrective message begins, so the conversation that carries one says so (REQ-NOTIFY-112's per-task count). */
export const CORRECTIVE_MARK = '[Corrective message]';

/**
 * REQ-NOTIFY-111: the corrective instruction for `condition`, composed from what is known of it, or the fixed
 * instruction where there is nothing to compose from.
 */
export function correctiveInstruction(condition: NoOutputCondition | null): string {
  if (condition === null) return FIXED_CORRECTIVE_INSTRUCTION;
  return `${CORRECTIVE_MARK} You produced no output for ${condition.quietS} seconds (the stall window, runtime.child_stall_timeout, is ${condition.windowS} seconds), and your last model request then failed: ${condition.failure}. Carry on from where you stopped: take the next step of your task with your tools, keep each step small so that output starts promptly, and answer with what you did.`;
}

/** What `stallRecoveryDue` reads of a child whose turn has just returned. */
export interface StallRecoveryInput {
  /** The turn's status: only a child that did not reach `succeeded` is eligible. */
  readonly status: 'succeeded' | 'partial' | 'failed';
  readonly error: ModelError | null;
  /** Loop supervision escalated: separate from this recovery (REQ-NOTIFY-112 "separately from loop supervision"). */
  readonly escalated: boolean;
  /** The child was cancelled, or the run aborted it. */
  readonly aborted: boolean;
  /** Its own `runtime.child_timeout` expired. */
  readonly timedOut: boolean;
  /** The run is coming to rest (PD-ORCH-005: no model call). */
  readonly resting: boolean;
  /** The turn stopped where it stood. */
  readonly paused: boolean;
  readonly answerRoute: boolean;
  /** It already had its one corrective message. */
  readonly corrected: boolean;
  readonly quietMs: number;
  readonly thresholdMs: number;
  readonly activeCalls: number;
}

/**
 * REQ-NOTIFY-112's authentication failure, quota exhaustion and validation error in the task definition, which earn no
 * corrective message, as the failed step's error carries them (OQ-127): a refusal of the credential (401, 403), an
 * exhausted quota (402, 429), a validation failure, and an abort.
 */
export function unrecoverableFailure(error: ModelError): boolean {
  if (error.code === 'aborted' || error.code === 'validation') return true;
  return error.code === 'http' && error.status !== undefined && [401, 402, 403, 429].includes(error.status);
}

/**
 * REQ-NOTIFY-112: whether the child is owed its one corrective message about its lack of progress. It did not reach
 * `succeeded`: its turn failed, and not by loop supervision's escalation, a cancel, the rest, or an error no instruction
 * can address. Its last condition is that it produced no output within the window: none for at least the threshold
 * before it failed, with no tool call in flight. Its own `child_timeout` has not expired. It is not on an answer-only
 * route. It has not had the message already.
 */
export function stallRecoveryDue(i: StallRecoveryInput): boolean {
  if (i.status !== 'failed' || i.escalated || i.aborted || i.timedOut || i.resting || i.paused || i.answerRoute || i.corrected) return false;
  if (i.error !== null && unrecoverableFailure(i.error)) return false;
  return i.activeCalls === 0 && i.quietMs >= i.thresholdMs;
}

/**
 * REQ-NOTIFY-112: "the count is per child task". A child's execution can end and the same task carry on in another —
 * PD-ORCH-005's resume after a pause, a stop, a quit or a crash — so whether the task already had its message is read
 * from what it was told: a user message that is a corrective message, composed or fixed, anywhere in `messages`.
 */
export function hadCorrectiveMessage(messages: readonly ChatMessage[]): boolean {
  return messages.some((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && (p.text.startsWith(CORRECTIVE_MARK) || p.text === FIXED_CORRECTIVE_INSTRUCTION)));
}
