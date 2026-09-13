import { hookDisplayName, type HookEntry } from '@rotaris/config';
import type { HookEvent, HookFinishPayload, HookStartPayload, LifecycleHookEvent, ToolHookEvent } from '@rotaris/contracts';
import { redact, type MonotonicClock, type Timers } from '@rotaris/kernel';
import type { ChildProcess } from 'node:child_process';
import type { SpawnSpec } from '@rotaris/platform';
import { indexByEvent, selectHooks, type ToolOccurrence } from './matcher.js';
import { buildLifecyclePayload, buildToolPayload, serializePayload, type LifecycleFields, type ToolResultItem } from './payload.js';
import { invokeHook, type RunnerDeps } from './runner.js';
import { advisory, decide, NO_EXIT_STATUS, switchOffSentence, timelineMessage, type Outcome, type Verdict } from './verdict.js';

/**
 * The per-session hook engine (ADR-0015): the set fixed at run start (REQ-HOOKS-131), an index by
 * event built once, the failure tally and the switched-off set keyed by stable id with exactly-once
 * switch-off however many occurrences meet the failing hook at once (REQ-HOOKS-042/055/056), the
 * once-per-session announcement of withheld hooks (REQ-HOOKS-127). Per occurrence the hooks run one
 * after another in declaration order, all of them, and the verdict is decided after the last
 * (REQ-HOOKS-040); occurrences run concurrently with one another. Every fault reduces to a warning
 * where REQ-HOOKS-052 defines one and to a log entry otherwise (REQ-HOOKS-079/128/129).
 */
export const FAILURE_LIMIT = 3;

export interface HookSinks {
  /** The wire events; the timeline entry of an invocation is written BEFORE its `hook.finish` (REQ-HOOKS-121). */
  event(kind: 'hook.start', payload: HookStartPayload): void;
  event(kind: 'hook.finish', payload: HookFinishPayload): void;
  /**
   * REQ-HOOKS-119 / REQ-SESSION-134: the entry's severity is the record's own column, not a metadata key —
   * that requirement's metadata inventory is closed and never named `severity`, and it was carried there only
   * while the timeline table had no column for it (repaired at schema v10).
   */
  timeline(name: 'hook_run', actor: string, message: string, metadata: Record<string, unknown>, severity: 'info' | 'warning'): void;
  issue(input: { kind: 'hook_failure' | 'hook_trust'; severity: 'warning'; actor: string; message: string; metadata: Record<string, unknown> }): void;
  /** The user's warning channel (REQ-HOOKS-054: never anything delivered to the agent). */
  warn(message: string): void;
  /** The application log only. */
  log(message: string): void;
}

export interface HookEngineDeps {
  readonly sessionId: string;
  /** The base workspace, as the payload's `workspace` reports it (REQ-HOOKS-057). */
  readonly workspace: string;
  /** The tree the run is changing — the hook process's working directory (REQ-HOOKS-030/084). */
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timers: Timers;
  readonly monotonic: MonotonicClock;
  readonly sinks: HookSinks;
  readonly platform?: NodeJS.Platform;
  readonly spawn?: (spec: SpawnSpec) => ChildProcess;
  /** Test seam: replaces the process runner. */
  readonly invoke?: (hook: HookEntry, payload: Uint8Array, deps: RunnerDeps) => Promise<Outcome>;
  /**
   * REQ-ORCH-153 / REQ-HOOKS-126 (ADR-0062): whether the run this engine serves is held at the plan gate, read
   * live at each invocation. While held "the run MUST NOT run a hook command", and each withheld invocation
   * announces itself once — not once per session, because the hold ends when the user answers and the same hook
   * then runs normally. Absent means no gate can hold it.
   */
  readonly planGateHeld?: (() => boolean) | undefined;
}

export interface ToolCallOccurrence extends ToolOccurrence {
  readonly arguments: Readonly<Record<string, unknown>>;
  /** The shell command line for `terminal`; '' otherwise. */
  readonly command: string;
  readonly results?: readonly ToolResultItem[];
}

export interface ToolHookResult {
  readonly blocked: boolean;
  readonly refusal: string;
  readonly feedback: string;
  readonly outcomes: readonly Outcome[];
}

export class HookEngine {
  private readonly index: ReadonlyMap<HookEvent, readonly HookEntry[]>;
  private readonly tally = new Map<string, number>();
  private readonly off = new Set<string>();
  private announced = false;
  private switchedOffCount = 0;

  constructor(readonly hooks: readonly HookEntry[], readonly withheld: readonly HookEntry[], private readonly deps: HookEngineDeps) {
    this.index = indexByEvent(hooks);
  }

  /** REQ-HOOKS-041/073/078: deciding an occurrence has no applicable hook costs one lookup. */
  hasHooksFor(event: HookEvent): boolean {
    const list = this.index.get(event);
    if (list === undefined || list.length === 0) return false;
    return list.some((h) => !this.off.has(h.id));
  }

  /** REQ-HOOKS-056: the switched-off ids. */
  switchedOff(): readonly string[] {
    return [...this.off];
  }
  /** REQ-HOOKS-054: the end-of-run advisory, '' when nothing was switched off. */
  advisory(): string {
    return advisory(this.switchedOffCount);
  }

  /** REQ-HOOKS-126/127: one `hook.finish` per withheld hook, once per session, however often triggered. */
  announceWithheld(): number {
    if (this.announced) return 0;
    this.announced = true;
    let n = 0;
    for (const h of this.withheld) {
      try {
        this.deps.sinks.event('hook.finish', {
          hook_id: h.id, hook_name: h.id, lifecycle_point: h.event, scope: h.source, tool_name: '',
          exit_code: null, duration_ms: null, blocked: false, timed_out: false, skipped: true, skip_reason: 'untrusted_workspace', output: '',
        });
        n += 1;
      } catch (cause) {
        // REQ-HOOKS-128: the hook id only, never the command.
        this.deps.sinks.log(`publishing the withheld announcement for hook ${h.id} failed: ${String(cause)}`);
      }
    }
    return n;
  }

  /** A lifecycle occurrence: informational only, always completes (REQ-HOOKS-002/079). */
  async fireLifecycle(event: LifecycleHookEvent, fields: LifecycleFields): Promise<readonly Outcome[]> {
    const hooks = this.applicable(event, null);
    if (hooks.length === 0) return [];
    let bytes: Uint8Array;
    try {
      bytes = serializePayload(buildLifecyclePayload(event, this.deps.sessionId, this.deps.workspace, fields));
    } catch (cause) {
      this.deps.sinks.log(`building the ${event} payload failed: ${String(cause)}`);
      bytes = serializePayload({ event, session_id: this.deps.sessionId, workspace: this.deps.workspace });
    }
    const outcomes: Outcome[] = [];
    for (const h of hooks) {
      const o = await this.runOne(h, bytes, '');
      if (o) outcomes.push(o);
    }
    return outcomes;
  }

  /** A tool occurrence: every applicable hook runs; the first stopping outcome takes effect after all have finished. */
  async fireTool(event: ToolHookEvent, call: ToolCallOccurrence): Promise<ToolHookResult> {
    const none: ToolHookResult = { blocked: false, refusal: '', feedback: '', outcomes: [] };
    const hooks = this.applicable(event, call);
    if (hooks.length === 0) return none;
    let bytes: Uint8Array;
    try {
      bytes = serializePayload(buildToolPayload({ event, toolName: call.toolName, arguments: call.arguments, sessionId: this.deps.sessionId, workspace: this.deps.workspace, command: call.command, ...(call.results === undefined ? {} : { results: call.results }) }));
    } catch (cause) {
      this.deps.sinks.log(`building the ${event} payload for ${call.toolName} failed: ${String(cause)}`);
      bytes = serializePayload({ event, tool_name: call.toolName, arguments: {}, session_id: this.deps.sessionId, workspace: this.deps.workspace, command: '' });
    }
    const outcomes: Outcome[] = [];
    const verdicts: Verdict[] = [];
    for (const h of hooks) {
      const r = await this.runOne(h, bytes, call.toolName);
      if (!r) continue;
      outcomes.push(r);
      verdicts.push(r.verdict);
    }
    // REQ-HOOKS-040/047: decided once all have finished; only a pre_tool verdict can block.
    const stopping = event === 'pre_tool' ? verdicts.find((v) => v.blocked) : undefined;
    const feedback = verdicts.map((v) => v.feedback).filter((f) => f !== '').join('\n');
    return { blocked: stopping !== undefined, refusal: stopping?.refusal ?? '', feedback, outcomes };
  }

  private applicable(event: HookEvent, call: ToolOccurrence | null): readonly HookEntry[] {
    return selectHooks(this.index, event, call).filter((h) => !this.off.has(h.id));
  }

  /** One invocation: `hook.start` → process → tally → `hook_run` entry → `hook.finish` → issue → warning. */
  private async runOne(hook: HookEntry, bytes: Uint8Array, toolName: string): Promise<(Outcome & { verdict: Verdict }) | null> {
    // A hook switched off by a concurrent occurrence since selection is skipped without comment.
    if (this.off.has(hook.id)) return null;
    const { sinks } = this.deps;
    /*
     * REQ-ORCH-153 / REQ-HOOKS-126: no process is started while the run is held at the plan gate, and the
     * withholding is announced as ONE `hook.finish` with no `hook.start`, no `hook_run` entry and no outcome
     * (REQ-HOOKS-130's second by-design case). `hook_name` carries the stable id, never the configured display
     * name (REQ-HOOKS-102). Once per withheld invocation: the hold is a moment that passes, and a hook withheld
     * at the gate is not run late and never runs twice for that moment.
     */
    if (this.deps.planGateHeld?.() === true) {
      this.publish(() => sinks.event('hook.finish', {
        hook_id: hook.id, hook_name: hook.id, lifecycle_point: hook.event, scope: hook.source, tool_name: toolName,
        exit_code: null, duration_ms: null, blocked: false, timed_out: false, skipped: true, skip_reason: 'plan_gate', output: '',
      }), hook);
      return null;
    }
    const name = hookDisplayName(hook);
    const identity = { hook_id: hook.id, hook_name: name, lifecycle_point: hook.event, scope: hook.source, tool_name: toolName };
    this.publish(() => sinks.event('hook.start', { ...identity, command: redact(hook.command) }), hook);
    let outcome: Outcome;
    try {
      outcome = await (this.deps.invoke ?? invokeHook)(hook, bytes, {
        cwd: this.deps.cwd, env: this.deps.env, timers: this.deps.timers, monotonic: this.deps.monotonic,
        ...(this.deps.platform === undefined ? {} : { platform: this.deps.platform }), ...(this.deps.spawn === undefined ? {} : { spawn: this.deps.spawn }),
      });
    } catch (cause) {
      outcome = { hook, exitCode: NO_EXIT_STATUS, timedOut: false, launchFailure: String(cause instanceof Error ? cause.message : cause), signalled: false, stdout: '', stderr: '', durationMs: 0 };
    }
    let verdict = decide(outcome, toolName);
    let warning = verdict.warning;
    if (verdict.failure) {
      const n = (this.tally.get(hook.id) ?? 0) + 1;
      this.tally.set(hook.id, n);
      if (n >= FAILURE_LIMIT && !this.off.has(hook.id)) {
        this.off.add(hook.id);
        this.switchedOffCount += 1;
        warning = `${warning} ${switchOffSentence(name, n)}`;
        verdict = { ...verdict, warning };
      }
    }
    const stdout = redact(outcome.stdout);
    const stderr = redact(outcome.stderr);
    const metadata: Record<string, unknown> = {
      hook_id: hook.id, hook_name: name, event: hook.event, source: hook.source, exit_code: outcome.exitCode, duration_ms: outcome.durationMs, timed_out: outcome.timedOut, blocked: verdict.blocked,
      ...(toolName === '' ? {} : { tool_name: toolName }), ...(stdout === '' ? {} : { stdout }), ...(stderr === '' ? {} : { stderr }),
    };
    // REQ-HOOKS-121: the durable entry before the completion event.
    try {
      sinks.timeline('hook_run', name, timelineMessage(outcome), metadata, warning === '' ? 'info' : 'warning');
    } catch (cause) {
      sinks.log(`the hook_run entry for ${hook.id} could not be written: ${String(cause)}`);
    }
    this.publish(() => sinks.event('hook.finish', {
      ...identity, exit_code: outcome.exitCode === NO_EXIT_STATUS ? null : outcome.exitCode, duration_ms: outcome.durationMs, blocked: verdict.blocked,
      timed_out: outcome.timedOut, skipped: false, skip_reason: '', output: [stdout.trim(), stderr.trim()].filter((s) => s !== '').join('\n'),
    }), hook);
    if (warning !== '') {
      try {
        sinks.issue({ kind: 'hook_failure', severity: 'warning', actor: name, message: warning, metadata });
      } catch (cause) {
        sinks.log(`the hook_failure issue for ${hook.id} could not be written: ${String(cause)}`);
      }
      sinks.warn(warning);
    }
    return { ...outcome, verdict };
  }

  private publish(fn: () => void, hook: HookEntry): void {
    try {
      fn();
    } catch (cause) {
      // REQ-HOOKS-128: a broken stream never skips, fails or repeats a hook.
      this.deps.sinks.log(`publishing a hook event for ${hook.id} failed: ${String(cause)}`);
    }
  }
}
