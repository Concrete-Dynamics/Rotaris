import { hookDisplayName, type HookEntry } from '@rotaris/config';
import { isToolHookEvent } from '@rotaris/contracts';

/**
 * Exit-code semantics and every message text of the domain (REQ-HOOKS-043..054). The no-exit-status
 * state is the fixed value -1 wherever an exit code is recorded verbatim (REQ-HOOKS-036).
 */
export const NO_EXIT_STATUS = -1;
export const OUTPUT_STREAM_CAP_BYTES = 16_384;
export const EXCERPT_CAP = 200;

export interface Outcome {
  readonly hook: HookEntry;
  readonly exitCode: number;
  readonly timedOut: boolean;
  /** Launch failure text, or '' when a process was started. */
  readonly launchFailure: string;
  readonly signalled: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

export interface Verdict {
  /** True only for a `pre_tool` hook that stopped the call (REQ-HOOKS-047). */
  readonly blocked: boolean;
  /** REQ-HOOKS-049: the refusal an agent receives; '' when not blocked. */
  readonly refusal: string;
  /** REQ-HOOKS-051: `post_tool` feedback; '' when none. */
  readonly feedback: string;
  /** REQ-HOOKS-052: the user-facing warning; '' when none. */
  readonly warning: string;
  /** REQ-HOOKS-046: whether this outcome counts against the failure allowance. */
  readonly failure: boolean;
}

/** REQ-HOOKS-052/050: the budget rendered once, consistently — a whole number bare, otherwise as written. */
export function renderBudget(seconds: number): string {
  return Number.isInteger(seconds) ? String(seconds) : String(seconds);
}

/** REQ-HOOKS-052 excerpt: stderr, else stdout; whitespace runs to one space; 200 characters with `…` beyond. */
export function excerpt(o: Pick<Outcome, 'stdout' | 'stderr'>): string {
  const src = o.stderr.trim() !== '' ? o.stderr : o.stdout;
  const flat = src.replace(/\s+/g, ' ').trim();
  if (flat === '') return '';
  const cps = Array.from(flat);
  return cps.length > EXCERPT_CAP ? `${cps.slice(0, EXCERPT_CAP).join('')}…` : flat;
}

export function decide(o: Outcome, toolName: string): Verdict {
  const hook = o.hook;
  const name = hookDisplayName(hook);
  const ev = hook.event;
  const none: Verdict = { blocked: false, refusal: '', feedback: '', warning: '', failure: false };
  const warn = (warning: string, failure: boolean): Verdict => ({ ...none, warning, failure });

  // No exit status: launch failure, timeout, or a signal (REQ-HOOKS-035/033/039).
  if (o.launchFailure !== '') {
    const warning = `Hook '${name}' (${ev}) could not run: ${o.launchFailure}`;
    if (ev === 'pre_tool' && hook.required) return { blocked: true, refusal: refusal(name, 'The hook could not be started.', toolName), feedback: '', warning, failure: true };
    return warn(warning, true);
  }
  if (o.timedOut) {
    const warning = `Hook '${name}' (${ev}) timed out after ${renderBudget(hook.timeoutSeconds)} s and was terminated.`;
    if (ev === 'pre_tool' && hook.required) return { blocked: true, refusal: refusal(name, `The hook timed out after ${renderBudget(hook.timeoutSeconds)} s.`, toolName), feedback: '', warning, failure: true };
    return warn(warning, true);
  }
  if (o.signalled || o.exitCode === NO_EXIT_STATUS) {
    const warning = `Hook '${name}' (${ev}) was ended before it could return an exit status.`;
    if (ev === 'pre_tool' && hook.required) return { blocked: true, refusal: refusal(name, 'The hook could not be started.', toolName), feedback: '', warning, failure: true };
    return warn(warning, true);
  }

  if (o.exitCode === 0) return none;
  if (o.exitCode === 2) {
    if (ev === 'pre_tool') {
      const reason = o.stderr.trim() === '' ? 'The hook gave no reason.' : o.stderr.trim();
      return { blocked: true, refusal: refusal(name, reason, toolName), feedback: '', warning: '', failure: false };
    }
    if (ev === 'post_tool') {
      const text = o.stderr.trim() === '' ? '(the hook wrote nothing to stderr)' : o.stderr.trim();
      return { ...none, feedback: `Hook '${name}' reported after the ${toolName === '' ? 'call' : `'${toolName}' call`}: ${text}` };
    }
    // REQ-HOOKS-045: a lifecycle hook exiting 2 is a warning that DOES count as a failure.
    return warn(exitedWarning(name, ev, o), true);
  }
  // Any other exit: a warning, the call proceeds, one failure (REQ-HOOKS-043/044/046/048).
  return warn(exitedWarning(name, ev, o), true);
}

function exitedWarning(name: string, ev: string, o: Outcome): string {
  const ex = excerpt(o);
  return `Hook '${name}' (${ev}) exited ${o.exitCode}.${ex === '' ? '' : ` Output: «${ex}»`}`;
}

/** REQ-HOOKS-049: exactly this text. */
export function refusal(name: string, reason: string, toolName: string): string {
  const middle = toolName === '' ? 'The call was not executed.' : `The '${toolName}' call was not executed.`;
  return `Blocked by hook '${name}'. ${reason} ${middle} Choose a different approach or ask the user to adjust the hook configuration.`;
}

/** REQ-HOOKS-053: appended to the warning on the switch-off invocation only. */
export function switchOffSentence(name: string, count: number): string {
  return `Hook '${name}' failed ${count} times and is disabled for the rest of this session.`;
}

/** REQ-HOOKS-054: the count and nothing further; grammatical for 1. */
export function advisory(switchedOff: number): string {
  if (switchedOff <= 0) return '';
  return switchedOff === 1
    ? '1 hook was switched off for the rest of this session after failing repeatedly. Its command output can be read on the Hooks settings tab.'
    : `${switchedOff} hooks were switched off for the rest of this session after failing repeatedly. Their command output can be read on the Hooks settings tab.`;
}

/** REQ-HOOKS-101: the withheld-hooks notice, exactly. */
export function withheldNotice(withheld: number, reinstated: number): string {
  if (withheld <= 0) return '';
  const n = withheld === 1 ? '1 hook' : `${withheld} hooks`;
  let text = `Skipped ${n} declared by this workspace's .rotaris/agents.yaml: workspace hooks run shell commands and this workspace has not been reviewed and trusted yet. Review the hooks in Rotaris to allow them to run.`;
  if (reinstated > 0) text += reinstated === 1 ? ' Your own 1 configured hook still runs.' : ` Your own ${reinstated} configured hooks still run.`;
  return text;
}

/** REQ-HOOKS-119: the timeline message. */
export function timelineMessage(o: Outcome): string {
  return `Hook '${hookDisplayName(o.hook)}' (${o.hook.event}) exited ${o.exitCode} in ${o.durationMs} ms`;
}

export function isToolHook(h: HookEntry): boolean {
  return isToolHookEvent(h.event);
}
