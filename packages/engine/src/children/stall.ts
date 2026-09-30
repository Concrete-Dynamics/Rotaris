import { type Clocks, countNoun, millis, type Millis, type TimerHandle } from '@rotaris/kernel';
import type { ChatMessage, ModelError } from '@rotaris/model';

/**
 * REQ-ORCH-089 / REQ-MONITOR-117..120, the stall watchdog, and REQ-NOTIFY-111/112, the one corrective message a child
 * that produced no output is owed. The repair of `a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md`.
 *
 * The watch is visibility only and never cancels anything (REQ-ORCH-089, REQ-MONITOR-285). On a fixed cadence taken from
 * the stall threshold it asks how long the child has gone without a model event or token:
 * - with a tool call in flight, it reports that the child is waiting on its calls (REQ-MONITOR-118);
 * - with none, it reports a stall at every evaluation, and marks the warning due only at entry and then no more often
 *   than the throttle (REQ-MONITOR-119/120);
 * - when activity resumes, it reports the recovery;
 * - between the child's turns — its turn has ended and the run asks nothing of it until it starts the next, which is a
 *   wait on its own children or the end of its execution — there is no model step to be silent, so it reports neither
 *   (OQ-154, the repair of `a-child-waiting-on-its-own-children-is-reported-stalled.md`). Each of those children has its
 *   own watch, which reports its own silence.
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

/** What one stall report carries (REQ-ORCH-089's diagnostics issue: active tools, the last 5 tool calls, the last model event type). */
export interface StallReport {
  readonly silentS: number;
  /** True at stall entry, false after it. */
  readonly entry: boolean;
  /**
   * REQ-MONITOR-120: whether this evaluation's warning is due — at entry, then no sooner than the throttle. The issue and
   * the callback are not throttled (REQ-MONITOR-119: "every stall evaluation"); only the warning is.
   */
  readonly warn: boolean;
  readonly activeTools: readonly string[];
  readonly recentCalls: readonly string[];
  readonly lastModelEvent: string | null;
}

export interface StallSinks {
  /** REQ-MONITOR-119: a stall, at every evaluation that finds one; `warn` says whether the warning is due too. */
  readonly stalled: (report: StallReport) => void;
  /** REQ-MONITOR-118: the same silence with tool calls in flight, at entry and at each repeat the throttle allows. */
  readonly waiting: (report: { readonly silentS: number; readonly activeCalls: number }) => void;
  /** REQ-MONITOR-120: activity resumed after a stall. */
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
  /** OQ-154: the child's turn has ended and the run has not started its next. */
  private between = false;

  constructor(private readonly clocks: Clocks, readonly thresholdMs: Millis, private readonly sinks: StallSinks) {
    this.lastEventAt = clocks.monotonic.now();
    this.lastOutputAt = this.lastEventAt;
  }

  /** Arms the watch for an attempt: the silence is counted from now. */
  start(): void {
    this.stop();
    this.active.clear();
    this.activity();
    this.timer = this.clocks.timers.every(stallCadence(this.thresholdMs), () => this.evaluate());
  }

  stop(): void {
    this.timer?.cancel();
    this.timer = null;
  }

  /**
   * The run gave the child something to answer — its payload, its record at a resume, its children's reports, a re-prompt
   * or the corrective message: the silence starts again, so a wait on its own children before it is not counted in the
   * silence REQ-NOTIFY-112's recovery reads (`quietFor`, OQ-127), and the watch's evaluation, which read no silence during
   * the wait (`betweenTurns`, OQ-154), counts from here.
   */
  activity(): void {
    this.between = false;
    const now = this.clocks.monotonic.now();
    this.lastEventAt = now;
    this.lastOutputAt = now;
  }

  /** One streamed part of a model step, by its kind; an error the provider answered with is an event too. */
  modelEvent(kind: string): void {
    const now = this.clocks.monotonic.now();
    this.lastEventAt = now;
    this.lastModelEvent = kind;
    if (OUTPUT_EVENTS.has(kind)) this.lastOutputAt = now;
  }

  /**
   * OQ-154: the child's turn has ended. Until the run starts its next (`activity`), the child is waiting on its own
   * children, or its execution is ending: the run asks it for no output, so no silence is counted against it.
   */
  betweenTurns(): void {
    this.between = true;
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

  private evaluate(): void {
    const now = this.clocks.monotonic.now();
    const silent = now - this.lastEventAt;
    const silentS = Math.floor(silent / 1000);
    if (this.between || silent < this.thresholdMs) {
      this.lastWaitingAt = null;
      if (this.stalledNow) { this.stalledNow = false; this.lastWarnAt = null; this.sinks.recovered(); }
      this.sinks.evaluated(false);
      return;
    }
    const repeat = stallRepeat(this.thresholdMs);
    if (this.active.size > 0) {
      if (this.stalledNow) { this.stalledNow = false; this.lastWarnAt = null; this.sinks.recovered(); }
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
    if (warn) this.lastWarnAt = now;
    this.sinks.stalled({ silentS, entry, warn, activeTools: [...this.active.values()], recentCalls: [...this.recent], lastModelEvent: this.lastModelEvent });
    this.sinks.evaluated(true);
  }
}

/** REQ-ORCH-089's warning, in its own words, with the agent it is about and REQ-MONITOR-119's "still waiting on it". */
export function stallWarning(agentName: string, taskId: string, silentS: number): string {
  return `child appears stalled: no model event or token for ${silentS} seconds (${agentName}, ${taskId}); the run is still waiting on it.`;
}

/*
 * The three lines below go to the session log through the run's `warn` (REQ-SESSION-142), in the manner OQ-76 set for the
 * user's presence: REQ-ORCH-139 closes the timeline vocabulary and it has no word for any of them, so none is minted here.
 * OQ-127 asks the owner for the words.
 */

/** REQ-MONITOR-118's informational message: the silence with tool calls in flight, which is a wait and not a stall. */
export function stallWaitingLine(agentName: string, taskId: string, activeCalls: number, silentS: number): string {
  return `child waiting on tools: ${agentName} (${taskId}) has ${countNoun(activeCalls, 'active tool call')} and no model event or token for ${silentS} seconds; the run is still waiting on it (REQ-MONITOR-118)`;
}

/** REQ-MONITOR-120's recovery: activity resumed after a stall. */
export function stallRecoveredLine(agentName: string, taskId: string): string {
  return `child stall recovered: ${agentName} (${taskId}) is active again after a stall (REQ-MONITOR-120)`;
}

/** REQ-NOTIFY-111: that the child was given its one corrective message, and why. */
export function correctiveMessageLine(agentName: string, taskId: string, quietS: number, failure: string): string {
  return `child corrective message: ${agentName} (${taskId}) produced no output for ${quietS} seconds and its model request then failed (${failure}); it was given its one corrective message and resumes (REQ-NOTIFY-111)`;
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
