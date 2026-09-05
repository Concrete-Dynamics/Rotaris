import { millis, type Millis, type Timers } from '@rotaris/kernel';
import { replaceDocument, type RetryLadder } from '@rotaris/platform';
import type { SessionRow } from '@rotaris/store';

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

export function renderSummary(s: SessionRow): string {
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
  if (s.summary_text) lines.push('', `## Outcome`, '', `${s.summary_status} (${s.summary_severity}): ${s.summary_text}`);
  lines.push('', '_Derived from the session record; nothing reads this file._', '');
  return lines.join('\n');
}

export class SummaryWriter {
  private lastGeneration = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly deps: { readonly file: string; readonly timers: Timers; readonly warn: (m: string) => void }) {}

  /** Off the path: returns at once; the write is queued in generation order. */
  rebuild(generation: number, read: () => SessionRow | undefined): void {
    if (generation <= this.lastGeneration) return;
    this.lastGeneration = generation;
    this.chain = this.chain.then(async () => {
      // Off the path means AFTER the path may have ended: a store closed behind a queued rebuild (the run over, the
      // test's afterEach) is not a summary fault; the previous file stays in force and the chain never rejects.
      let row: SessionRow | undefined;
      try { row = read(); } catch (cause) { this.deps.warn(`summary.md was not rebuilt (generation ${generation}): ${String(cause instanceof Error ? cause.message : cause)}`); return; }
      if (!row) return;
      const r = await replaceDocument(this.deps.file, renderSummary(row), { ladder: SUMMARY_LADDER, timers: this.deps.timers, createParent: true });
      if (!r.ok) this.deps.warn(`summary.md could not be replaced and the previous one stays in force: ${r.error.headline}`);
    });
  }

  /** For tests and for shutdown: every queued rebuild has landed. */
  settled(): Promise<void> {
    return this.chain;
  }
}
