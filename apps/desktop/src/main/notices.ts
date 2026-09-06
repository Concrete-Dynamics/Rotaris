import { CONTRACT_SCHEMA_VERSION, type AcknowledgementKind, type AcknowledgementPublish, type Notice, type NoticeAction, type NoticeCurrent, type NoticeSeverity } from '@rotaris/contracts';

/**
 * ADR-0049, executed in full (Part V) — the ONE notice store of the application process.
 *
 * REQ-NOTIFY-025/027: the store belongs to main, not to a window; the identifier sequence never resets while
 * the process lives and nothing is written to disk. REQ-NOTIFY-024: one notice is current, the most recently
 * published; a publication replaces whatever was current, whichever session either concerns; nothing is
 * queued, restored or re-presented. REQ-NOTIFY-033 / ADR-0049 decision 2: publications, dismissals and
 * run-start clears are ONE serialised chain applied in acceptance order, so no two interleave and the last of
 * a burst is what stays on screen; painting may coalesce. REQ-NOTIFY-268 / ADR-0049 decision 3: a `warning` or
 * `error` notice is RECORDED before it is rendered — into the session's timeline where a session applies, else
 * the application diagnostics — so a notice superseded within the same turn is still readable afterwards.
 * REQ-NOTIFY-040: no notice leaves on a timer; the only exits are replacement, a run-start clear
 * (REQ-NOTIFY-029/058) and, where `persistent`, the user's dismissal (compare-and-clear, REQ-NOTIFY-026).
 *
 * REQ-NOTIFY-003 / ADR-0049 decision 5: exactly two publishing entry points. `report` raises the persistent
 * notice (and, where asked, the transient with it) — a failure, a refusal, an outcome carrying an action, and
 * every other outcome the product wants to stay readable. `acknowledge` raises a transient and nothing else,
 * and its shape has no place for an action or a severity, which is the type-level refusal the decision asks
 * for: an event needing either cannot be acknowledged away.
 */
export interface NoticeRecord {
  readonly noticeId: number;
  readonly severity: 'warning' | 'error';
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  /** The session whose timeline takes the entry — the notice's own, else the focused run's; never empty here. */
  readonly sessionId: string;
}

export interface NoticeStoreDeps {
  /** Channel 4 to every attached window: the current notice or null. */
  readonly broadcast: (current: NoticeCurrent) => void;
  /** Channel 8 to the main window's stack. */
  readonly pushAcknowledgement: (a: AcknowledgementPublish) => void;
  /** REQ-NOTIFY-268: write the entry to the session's timeline; false where it could not be written. */
  readonly record: (entry: NoticeRecord) => Promise<boolean>;
  /** The application diagnostics — main's log (the diagnostics store of REQ-STARTUP-130ff is not built; ADR-0049's note says so). */
  readonly log: (line: string) => void;
  /** REQ-NOTIFY-028: the session the main window follows, or null. */
  readonly focusedSession: () => string | null;
}

export interface ReportInput {
  readonly severity: NoticeSeverity;
  readonly title: string;
  readonly message?: string;
  readonly detail?: string;
  /** REQ-NOTIFY-040: whether a dismiss control is offered. Default true. */
  readonly persistent?: boolean;
  readonly action?: { readonly label: string; readonly action: NoticeAction } | undefined;
  /** REQ-NOTIFY-028: empty or absent means the focused run. */
  readonly sessionId?: string;
  /** REQ-NOTIFY-224: once per key within this application session. */
  readonly key?: string;
  /** REQ-NOTIFY-003: the transient half, where the caller wants one beside the notice. */
  readonly acknowledge?: { readonly kind: AcknowledgementKind; readonly body?: string };
}

export interface NoticeStore {
  /** The persistent notice (and its transient where asked). Resolves once the publication is applied; `shown` is false for a key already published. */
  report(input: ReportInput): Promise<{ readonly id: number; readonly shown: boolean }>;
  /** A transient only (REQ-NOTIFY-003's "any other event"); no action, no severity, no record. */
  acknowledge(kind: AcknowledgementKind, title: string, body?: string): void;
  /** REQ-NOTIFY-026: with an id, compare-and-clear; without, whatever is current. */
  dismiss(noticeId?: number): Promise<void>;
  /** REQ-NOTIFY-029/058: a starting run clears an unscoped notice or one scoped to that session, no other. */
  clearForRunStart(sessionId: string): Promise<void>;
  /** The notice on screen as of the last applied publication. */
  current(): Notice | null;
  /** The last identifier handed out (verification and logs). */
  lastId(): number;
  /** Everything applied so far has been applied. */
  settled(): Promise<void>;
}

export function createNoticeStore(deps: NoticeStoreDeps): NoticeStore {
  let seq = 0;
  let current: Notice | null = null;
  const publishedKeys = new Set<string>();
  // ADR-0049 decision 2: a single promise chain; every mutation is enqueued in acceptance order.
  let chain: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(step: () => Promise<T>): Promise<T> => {
    const next = chain.then(step, step);
    chain = next.then(() => undefined, () => undefined);
    return next;
  };
  const set = (next: Notice | null): void => {
    current = next;
    deps.broadcast({ v: CONTRACT_SCHEMA_VERSION, current: next });
  };

  return {
    report(input) {
      return enqueue(async () => {
        if (input.key !== undefined) {
          if (publishedKeys.has(input.key)) return { id: seq, shown: false };
          publishedKeys.add(input.key);
        }
        const id = ++seq;
        const notice: Notice = {
          id, severity: input.severity, title: input.title, message: input.message ?? '', detail: input.detail ?? '',
          persistent: input.persistent ?? true, sessionId: input.sessionId ?? '',
          ...(input.action === undefined ? {} : { action: input.action }),
        };
        // REQ-NOTIFY-268: record BEFORE render. The notice's session, else the focused run's; neither → the diagnostics.
        if (notice.severity === 'warning' || notice.severity === 'error') {
          const sessionId = notice.sessionId !== '' ? notice.sessionId : (deps.focusedSession() ?? '');
          let recorded = false;
          if (sessionId !== '') recorded = await deps.record({ noticeId: id, severity: notice.severity, title: notice.title, message: notice.message, detail: notice.detail, sessionId }).catch(() => false);
          if (!recorded) deps.log(`diagnostics: notice #${id} ${notice.severity} "${notice.title}"${notice.message ? ` — ${notice.message}` : ''}${notice.detail ? `\n${notice.detail}` : ''}${sessionId === '' ? ' (no session applies)' : ` (session ${sessionId}: the timeline refused the entry)`}`);
        }
        set(notice);
        if (input.acknowledge) deps.pushAcknowledgement({ v: CONTRACT_SCHEMA_VERSION, kind: input.acknowledge.kind, title: notice.title, ...(input.acknowledge.body === undefined ? {} : { body: input.acknowledge.body }) });
        return { id, shown: true };
      });
    },
    acknowledge(kind, title, body) {
      deps.pushAcknowledgement({ v: CONTRACT_SCHEMA_VERSION, kind, title, ...(body === undefined ? {} : { body }) });
    },
    dismiss(noticeId) {
      return enqueue(async () => {
        if (current === null) return;
        if (noticeId !== undefined && current.id !== noticeId) return;
        set(null);
      });
    },
    clearForRunStart(sessionId) {
      return enqueue(async () => {
        if (current === null) return;
        if (current.sessionId !== '' && current.sessionId !== sessionId) return;
        set(null);
      });
    },
    current: () => current,
    lastId: () => seq,
    settled: () => chain.then(() => undefined),
  };
}
