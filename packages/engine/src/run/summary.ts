import { millis, type Millis, type Timers } from '@rotaris/kernel';
import { replaceDocument, type RetryLadder } from '@rotaris/platform';
import type { SessionRow, StoreDal, TimelineRow } from '@rotaris/store';

/**
 * REQ-SESSION-028 / REQ-SESSION-006 / REQ-SESSION-033 — the one file a save
 * still causes: the human-readable summary, rebuilt from the state the save
 * captured and written AFTER the commit, off the run's critical path, through
 * ADR-0004's primitive under REQ-SESSION-033's ladder (at most six attempts:
 * 0.05, 0.1, 0.2, 0.4, 0.8 s). Nothing reads it; a loader never takes a fact
 * from it. Writes are ordered by the save's generation so an older rebuild can
 * never overwrite a newer one; a failed replacement leaves the previous file
 * in force behind a warning and never fails the save (ADR-0008).
 */
export const SUMMARY_LADDER: RetryLadder = { delays: [50, 100, 200, 400, 800].map((n) => millis(n)) as Millis[] };

/** The outcome a session's readers present: its record's summary, `summary.md`'s Outcome block, the agents view's activity line. */
export interface SessionOutcome {
  readonly status: string;
  readonly severity: string;
  readonly message: string;
}

/** REQ-SESSION-062: the type of the entry a repair writes into the session it corrects. */
export const RECOVERY_ENTRY = 'session.interrupted_recovered';

/**
 * OQ-60 as ruled (R-071, 2026-10-06): what a session says of its outcome. REQ-ORCH-082 stays the single definition of
 * end-of-run summarization and is written only by a run's end (the three summary columns). A session whose run died
 * without one is set `interrupted` by REQ-SESSION-060's repair — the only writer of that status (REQ-SESSION-073) — and
 * REQ-SESSION-062's correction entry is the whole of what it says about itself: while the session is `interrupted`, its
 * readers present the latest such entry (status `interrupted`, the entry's severity and message) in place of the columns,
 * which are NULL for a first run that died and describe an earlier run otherwise. Every other session presents its columns,
 * or nothing. No summary is derived here: the entry is presented as it was written.
 */
export function sessionOutcomeOf(row: Pick<SessionRow, 'execution_status' | 'summary_status' | 'summary_severity' | 'summary_text'>, correction: Pick<TimelineRow, 'severity' | 'message'> | null | undefined): SessionOutcome | null {
  if (row.execution_status === 'interrupted' && correction) return { status: 'interrupted', severity: correction.severity, message: correction.message };
  return row.summary_status && row.summary_severity && row.summary_text ? { status: row.summary_status, severity: row.summary_severity, message: row.summary_text } : null;
}

/** The correction entry `sessionOutcomeOf` reads, looked up only for a session that is `interrupted`. */
export function recoveryEntryOf(dal: Pick<StoreDal, 'latestTimelineEntry'>, row: Pick<SessionRow, 'session_id' | 'execution_status'>): TimelineRow | null {
  return row.execution_status === 'interrupted' ? dal.latestTimelineEntry(row.session_id as Parameters<StoreDal['latestTimelineEntry']>[0], RECOVERY_ENTRY) ?? null : null;
}

export function renderSummary(s: SessionRow, outcome: SessionOutcome | null = sessionOutcomeOf(s, null)): string {
  const lines = [
    `# Session ${s.session_id}`,
    '',
    `- Workspace: ${s.workspace_root}`,
    `- Status: ${s.execution_status}`,
    `- Created: ${s.created_at}`,
    `- Updated: ${s.updated_at}`,
    `- Iterations completed: ${s.iterations_completed}`,
    `- Stop reason: ${s.stop_reason ?? '—'}`,
    `- Tokens: ${s.tokens_input} in / ${s.tokens_output} out`,
    `- Cost: ${s.cost}`,
  ];
  if (outcome) lines.push('', `## Outcome`, '', `${outcome.status} (${outcome.severity}): ${outcome.message}`);
  lines.push('', '_Derived from the session record; nothing reads this file._', '');
  return lines.join('\n');
}

export class SummaryWriter {
  private lastGeneration = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly deps: { readonly file: string; readonly timers: Timers; readonly warn: (m: string) => void }) {}

  /**
   * Off the path: returns at once; the write is queued in generation order. `outcome` is the session's (`sessionOutcomeOf`)
   * where the caller can read the correction entry; absent, the row's own columns.
   */
  rebuild(generation: number, read: () => SessionRow | undefined, outcome?: (row: SessionRow) => SessionOutcome | null): void {
    if (generation <= this.lastGeneration) return;
    this.lastGeneration = generation;
    this.chain = this.chain.then(async () => {
      // Off the path means AFTER the path may have ended: a store closed behind a queued rebuild (the run over, the
      // test's afterEach) is not a summary fault; the previous file stays in force and the chain never rejects.
      let row: SessionRow | undefined;
      try { row = read(); } catch (cause) { this.deps.warn(`summary.md was not rebuilt (generation ${generation}): ${String(cause instanceof Error ? cause.message : cause)}`); return; }
      if (!row) return;
      const r = await replaceDocument(this.deps.file, renderSummary(row, outcome ? outcome(row) : sessionOutcomeOf(row, null)), { ladder: SUMMARY_LADDER, timers: this.deps.timers, createParent: true });
      if (!r.ok) this.deps.warn(`summary.md could not be replaced and the previous one stays in force: ${r.error.headline}`);
    });
  }

  /** For tests and for shutdown: every queued rebuild has landed. */
  settled(): Promise<void> {
    return this.chain;
  }
}
