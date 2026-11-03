import type { ProcessReply } from '@rotaris/contracts';
import { millis, type Millis } from '@rotaris/kernel';
import type { AppLogLevel } from './app-log.js';
import { childExitReading } from './exit.js';
import type { ReportInput } from './notices.js';

/**
 * OQ-462, ruled 2026-11-01 under the owner's delegation (R-072): what main does when a utility process is lost or never
 * reports ready (hardening §3.2 rows 2 and 3; ADR-0002 consequence 1, REQ-NOTIFY-023, REQ-SESSION-066).
 *
 * (1) A run host or workspace service that ends when main did not end it (`ChildrenEndedByMain`) and the application is
 *     not quitting raises ONE persistent notice per loss: severity `error`, a dismiss offered, no action, no session; its
 *     title names the process (and the workspace, for a service) and says "did not start" or "stopped"; its body says what
 *     follows; its detail carries the exit status and the pid. The trigger is "not ended by main", never "status ≠ 0".
 * (2) The run host's `hello` bound applies to the workspace service's first answer too: a child that misses it is ended
 *     (`endBeforeMain`). The run host then gets the notice; a service whose open is still pending is refused on the open's
 *     own surface (REQ-SHELL-112's transient) and raises no notice.
 * (3) After the run host's exit every request main would send it is refused at once (`ProcessLink.end`).
 * (4) The run host is never forked again; a workspace service is forked again at the next open.
 *
 * Every notice raised before the notice store exists (a run host that misses its `hello`, which main awaits before it
 * builds the store) is held and published once the store is attached.
 */

/** OQ-462 (2): the bound on the run host's first answer, its `hello` — the 5 s main has always given it. */
export const RUN_HOST_READY_BOUND_MS: Millis = millis(5_000);
/** OQ-462 (2): the same bound on a workspace service's first answer, its `hello`, asked before the open. */
export const WORKSPACE_SERVICE_READY_BOUND_MS: Millis = millis(5_000);

/** Which child, as the notice and the refusal name it. */
export type SupervisedChild =
  | { readonly process: 'run-host' }
  | { readonly process: 'workspace-service'; readonly workspace: string };

/** How a child came to be gone: it never answered its ready bound, or it stopped after answering. */
export type ChildLoss = 'did-not-start' | 'stopped';

/** OQ-462 (3): what every request to a run host that is gone is answered with. */
export function runHostGoneRefusal(how: ChildLoss): Extract<ProcessReply, { kind: 'refused' }> {
  return how === 'did-not-start'
    ? { kind: 'refused', code: 'runHost.notStarted', headline: 'The run host did not start; no run can start until the application is restarted' }
    : { kind: 'refused', code: 'runHost.gone', headline: 'The run host has stopped; no run can start until the application is restarted' };
}

/** What a request to a workspace service that is gone is answered with; the next open forks a new one (OQ-462 (4)). */
export function workspaceServiceGoneRefusal(workspace: string): Extract<ProcessReply, { kind: 'refused' }> {
  return { kind: 'refused', code: 'workspace.serviceGone', headline: `The workspace service for ${workspace} has stopped; reopen the workspace to restore it` };
}

/** The facts the notice's technical detail carries. */
export interface ChildLossFacts {
  readonly code: number;
  readonly pid: number | undefined;
  /** For a missed ready bound: the bound that elapsed, in ms. */
  readonly readyBoundMs?: number;
}

/** OQ-462 (1): the one notice for one loss. */
export function childLossNotice(child: SupervisedChild, how: ChildLoss, facts: ChildLossFacts): ReportInput {
  const pid = facts.pid === undefined ? 'pid unknown' : `pid ${facts.pid}`;
  const ended = how === 'did-not-start'
    ? `no answer to its hello within ${facts.readyBoundMs ?? 0} ms, so main ended it (${pid}, exit status ${facts.code})`
    : `${pid} exited with status ${facts.code}: ${childExitReading(facts.code).reading}`;
  if (child.process === 'run-host') {
    return {
      severity: 'error',
      persistent: true,
      title: how === 'did-not-start' ? 'The run host did not start' : 'The run host stopped',
      message: how === 'did-not-start'
        ? 'No run can start until the application is restarted. Your sessions and settings are unchanged.'
        : 'Runs in progress were lost; what each had saved is kept. Their sessions show as stale in the session list, where each can be repaired. No run can start until the application is restarted.',
      detail: `run host: ${ended}`,
    };
  }
  return {
    severity: 'error',
    persistent: true,
    title: how === 'did-not-start' ? `The workspace service for ${child.workspace} did not start` : `The workspace service for ${child.workspace} stopped`,
    message: 'Reopening the workspace restores it.',
    detail: `workspace service for ${child.workspace}: ${ended}`,
  };
}

/**
 * OQ-462 (1) and (2) as main applies them: told each child's missed ready bound and each child's exit, it decides whether
 * the loss is raised as a notice, and holds what it raises until the notice store is attached.
 */
export class ChildLossReporter {
  readonly #missedReady = new Map<string, number>();
  readonly #held: ReportInput[] = [];
  #report: ((notice: ReportInput) => void) | null = null;

  constructor(private readonly deps: {
    /** Whether main ended the child with this service name itself (`ChildrenEndedByMain.ended`). */
    readonly endedByMain: (serviceName: string) => boolean;
    /** Whether the application is quitting: its immediate exit, or the orderly shutdown begun (`QuitState.ending`). */
    readonly quitting: () => boolean;
    readonly log: (message: string, level?: AppLogLevel) => void;
  }) {}

  /** The child with this service name missed its ready bound, by `boundMs`; main is about to end it. */
  missedReady(serviceName: string, boundMs: number): void {
    this.#missedReady.set(serviceName, boundMs);
  }

  /** Whether the child with this service name was ended for a missed ready bound. */
  didNotStart(serviceName: string): boolean {
    return this.#missedReady.has(serviceName);
  }

  /**
   * The child's `exit`. Answers how it was lost, or null when its end is no loss (main ended a ready child, or the application is
   * quitting). `raise` false: the loss is reported elsewhere (a service whose open was pending, OQ-462 (2)).
   */
  exited(serviceName: string, child: SupervisedChild, facts: { readonly code: number; readonly pid: number | undefined }, raise = true): ChildLoss | null {
    const boundMs = this.#missedReady.get(serviceName);
    this.#missedReady.delete(serviceName);
    const how: ChildLoss = boundMs === undefined ? 'stopped' : 'did-not-start';
    // Once the application is ending nobody would read a notice, whichever kind of loss; and main's own end of a child
    // that was ready is no loss at all. A child main ended for a missed ready is still one (`missedReady`).
    if (this.deps.quitting() || (how === 'stopped' && this.deps.endedByMain(serviceName))) return null;
    if (!raise) return how;
    const notice = childLossNotice(child, how, { ...facts, ...(boundMs === undefined ? {} : { readyBoundMs: boundMs }) });
    this.deps.log(`notice: ${notice.title} (${notice.detail ?? ''}) (OQ-462)`, 'error');
    if (this.#report === null) this.#held.push(notice);
    else this.#report(notice);
    return how;
  }

  /** The notice store, once it exists: every notice held until now is published, in order. */
  attach(report: (notice: ReportInput) => void): void {
    this.#report = report;
    for (const n of this.#held.splice(0)) report(n);
  }
}

/**
 * OQ-462 (2): a child's first answer, bounded. Answers the reply, or null when the bound elapsed, the link failed or the
 * answer was not a `hello` — and then `missed` has been called, with the cause, before this resolves. Never rejects: a
 * missed `hello` was an unhandled rejection that ended main's launch
 * (`docs/archive/defects/a-launch-whose-run-host-misses-the-hello-bound-ends-on-an-unhandled-main-rejection.md`).
 */
export async function boundedReady(hello: () => Promise<ProcessReply>, missed: (cause: string) => Promise<void>): Promise<Extract<ProcessReply, { kind: 'hello' }> | null> {
  let cause: string;
  try {
    const reply = await hello();
    if (reply.kind === 'hello') return reply;
    cause = reply.kind === 'refused' ? `refused (${reply.code}): ${reply.headline}` : `answered '${reply.kind}' rather than 'hello'`;
  } catch (e) {
    cause = e instanceof Error ? e.message : String(e);
  }
  await missed(cause);
  return null;
}
