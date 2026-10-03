import { isTerminalChildState, type ChildState } from '@rotaris/contracts';
import type { ChildRow } from '@rotaris/store';
import type { ChildLedger } from './ledger.js';

/**
 * ADR-0012: scheduling is a PASS OVER THE LEDGER, triggered by a state change and never by a timer, run to
 * a fixed point: admit ready children (every dependency `succeeded` with its report stored, REQ-ORCH-047),
 * cascade `blocked` transitively over the three pre-start states (REQ-ORCH-048), promote at most one held
 * child per freed model slot in the order held (REQ-ORCH-050), start claimed children, repeat until
 * REQ-ORCH-056's three conditions hold. Each transition is its own transaction; a pass never is. A pass
 * that changes nothing schedules no other — the termination obligation of consequence 2.
 *
 * The one waiting mechanism (REQ-TOOLS-156, REQ-ORCH-062): a promise resolved when every task in the set
 * is terminal, or on cancellation; no deadline of its own.
 */
export interface SchedulerDeps {
  readonly ledger: ChildLedger;
  /** Runs a child from `starting` to a terminal state; never throws into the pass. */
  readonly runChild: (row: ChildRow) => Promise<void>;
  readonly warn: (m: string) => void;
  /**
   * PD-ORCH-005 clause 22: whether the child's record holds a conversation — a settled child its parent followed up,
   * waiting in `queued` to start from its record. REQ-ORCH-048's cascade settles a dependent before it has started, and
   * this one has: its dependencies were judged when it was first admitted, so the cascade leaves it (OQ-131). Absent
   * means no child has one.
   */
  readonly hasConversation?: ((taskId: string) => boolean) | undefined;
  /**
   * REQ-ORCH-098: the teardown of a child this scheduler settles itself — one REQ-ORCH-048's cascade blocks, or one the
   * finalize sweep cancels — given its terminal row and the report just stored, before the terminal callbacks fire, as a
   * child's own settle writes it (`IterationChildren.afterTerminal`). The repair of
   * `a-child-that-never-started-gets-no-teardown-timeline-entries.md`: a child that never started reaches a terminal state
   * too (OQ-152). A raise out of it is warned and the settle goes on. Absent means nothing is written.
   */
  readonly teardown?: ((row: ChildRow, report: Readonly<Record<string, unknown>>) => void) | undefined;
}

const PRE_START: ReadonlySet<string> = new Set<ChildState>(['waiting_on_dependencies', 'queued', 'waiting_on_model_slot']);

export class Scheduler {
  private readonly waiters = new Set<{ readonly ids: ReadonlySet<string>; readonly resolve: () => void }>();
  private readonly terminalListeners = new Set<(row: ChildRow) => void>();
  private cancelled = false;
  /** PD-ORCH-005 clause 2: the run is coming to rest — nothing more is admitted, promoted or started. */
  private resting = false;
  private passing = false;
  private again = false;
  /** The run's teardown of this iteration's children is over (`close`): no pass reads the ledger again. */
  private closed = false;

  constructor(private readonly deps: SchedulerDeps) {}

  onTerminal(fn: (row: ChildRow) => void): () => void {
    this.terminalListeners.add(fn);
    return () => this.terminalListeners.delete(fn);
  }

  /**
   * PD-ORCH-005 clause 2: the run is coming to rest. "No queued child starts": every later pass does nothing, so no child
   * is admitted, promoted or started and no pre-start child is moved — each is left exactly where it stood, to be paused
   * there. Every waiter is released; the waits resolve and their callers read the rest for themselves.
   */
  hold(): void {
    this.resting = true;
    for (const w of [...this.waiters]) { this.waiters.delete(w); w.resolve(); }
  }
  get isResting(): boolean {
    return this.resting;
  }

  /**
   * REQ-ORCH-053 / REQ-ORCH-098: the run has torn this iteration's children down — every record terminal (REQ-ORCH-052) or
   * paused (PD-ORCH-005 clause 2) — so no pass is owed and none may read the ledger again: a child's execution that settles
   * later (one given up on at the stop's grace, or any whose `.finally` lands after the run's end) finds `pass` returning at
   * once, so it cannot outlive the store it reads, which the run host closes while it lives (`workspace.closeStore` before a
   * backup or a restore, `workspace.closing`). Every waiter is released. Idempotent. Until 2026-10-03 nothing stopped that
   * pass (docs/defects/fixed/a-childs-closing-scheduler-pass-can-outlive-the-run-that-awaited-it.md).
   */
  close(): void {
    this.closed = true;
    for (const w of [...this.waiters]) { this.waiters.delete(w); w.resolve(); }
  }

  /** The pass, re-entrant-safe: a change during a pass schedules exactly one more pass. */
  pass(): void {
    if (this.resting || this.closed) return;
    if (this.passing) { this.again = true; return; }
    this.passing = true;
    try {
      let rounds = 0;
      do {
        this.again = false;
        let changed = true;
        while (changed) {
          changed = false;
          rounds += 1;
          if (rounds > 10_000) { this.deps.warn('the scheduler exceeded 10,000 rounds without quiescence; stopping the pass (REQ-ORCH-056)'); return; }
          if (this.cascadeBlocked()) changed = true;
          if (this.admitReady()) changed = true;
          if (this.promoteHeld()) changed = true;
          if (this.startQueued()) changed = true;
        }
      } while (this.again);
    } finally {
      this.passing = false;
    }
  }

  private deps_(row: ChildRow): string[] {
    try { return JSON.parse(row.depends_on) as string[]; } catch { return []; }
  }

  /**
   * REQ-ORCH-048: a dependency in failed/cancelled/blocked blocks every pre-start dependent, transitively. REQ-ORCH-108:
   * the blocked child is terminal, so it has its report — status `blocked` (REQ-ORCH-112), naming the dependency and
   * how it ended — stored, and materialised (REQ-LIBRARY-092), before the terminal callbacks resume its parent. The
   * repair of `a-child-blocked-by-its-dependency-gets-no-report.md`; it covers PD-ORCH-005 clause 16's route too, a
   * paused dependent of a child cancelled at rest that the resumed run's first pass blocks here (OQ-101).
   */
  private cascadeBlocked(): boolean {
    let changed = false;
    const all = this.deps.ledger.all();
    for (const c of all) {
      if (!PRE_START.has(c.state)) continue;
      const deps = this.deps_(c).map((d) => all.find((x) => x.task_id === d));
      const cause = deps.find((d): d is ChildRow => d !== undefined && (d.state === 'failed' || d.state === 'cancelled' || d.state === 'blocked'));
      if (cause && this.deps.hasConversation?.(c.task_id) !== true) {
        const r = this.deps.ledger.transition(c.task_id, 'blocked');
        if (r.ok) {
          changed = true;
          const report = blockedReport(c, cause);
          this.deps.ledger.storeReport(c.task_id, report);
          const row = this.deps.ledger.get(c.task_id) ?? r.row;
          this.tearDown(row, report);
          this.settled(row);
        } else this.deps.warn(r.reason);
      }
    }
    return changed;
  }

  /** REQ-ORCH-047: a dependent starts only when ALL dependencies reached `succeeded` AND stored their report. */
  private admitReady(): boolean {
    let changed = false;
    const all = this.deps.ledger.all();
    for (const c of all) {
      if (c.state !== 'waiting_on_dependencies') continue;
      const deps = this.deps_(c).map((d) => all.find((x) => x.task_id === d));
      if (deps.every((d) => d && d.state === 'succeeded' && d.report_stored === 1)) {
        const r = this.deps.ledger.transition(c.task_id, 'queued');
        if (r.ok) changed = true; else this.deps.warn(r.reason);
      }
    }
    return changed;
  }

  /** REQ-ORCH-050 / REQ-MONITOR-020: one held child per free slot, in the order held; a terminal one is dropped. */
  private promoteHeld(): boolean {
    let changed = false;
    const keys = new Set(this.deps.ledger.all().filter((c) => c.state === 'waiting_on_model_slot').map((c) => c.model_key));
    for (const key of keys) {
      for (const taskId of this.deps.ledger.slotQueue(key)) {
        const row = this.deps.ledger.get(taskId);
        if (!row || isTerminalChildState(row.state) || row.state !== 'waiting_on_model_slot') { this.deps.ledger.dequeueSlot(key, taskId); continue; }
        if (!this.deps.ledger.slotFree(key)) break;
        // A promoted child occupies its slot from `queued` onward in this pass's accounting: it is started below.
        const r = this.deps.ledger.transition(taskId, 'queued');
        this.deps.ledger.dequeueSlot(key, taskId);
        if (r.ok) { changed = true; if (this.startOne(r.row)) continue; }
        else this.deps.warn(r.reason);
        break;
      }
    }
    return changed;
  }

  private startQueued(): boolean {
    let changed = false;
    for (const c of this.deps.ledger.all()) {
      if (c.state !== 'queued' || this.cancelled) continue;
      if (this.startOne(c)) changed = true;
      else if (!this.deps.ledger.slotFree(c.model_key) && this.deps.ledger.get(c.task_id)?.state === 'queued') {
        // REQ-ORCH-050: over the cap at scheduling time → held, never rejected.
        const r = this.deps.ledger.transition(c.task_id, 'waiting_on_model_slot');
        if (r.ok) { this.deps.ledger.enqueueSlot(c.model_key, c.task_id); changed = true; }
      }
    }
    return changed;
  }

  /** REQ-ORCH-049: the claim is the store's; a losing claim is recorded by the writer and starts nothing. */
  private startOne(c: ChildRow): boolean {
    if (this.deps.ledger.activeCount() >= this.deps.ledger.budget.maxActive) return false;
    if (!this.deps.ledger.slotFree(c.model_key)) return false;
    if (!this.deps.ledger.claimStart(c.task_id)) return false;
    const row = this.deps.ledger.get(c.task_id);
    if (!row) return false;
    // The follow-up pass runs where nothing awaits it, so it may never reject: a raise (a store closed under a scheduler the
    // run never closed) is warned instead, and `close` keeps it from reading at all after the run's teardown.
    void this.deps.runChild(row).catch((e) => this.deps.warn(`child ${row.task_id} raised out of its execution: ${String(e)}`)).finally(() => {
      try { this.pass(); } catch (e) { this.deps.warn(`the scheduler's pass after child ${row.task_id} raised: ${String(e)}`); }
    });
    return true;
  }

  /** REQ-ORCH-098: `deps.teardown` for a child settled here; a raise never keeps the scheduler from being told. */
  private tearDown(row: ChildRow, report: Readonly<Record<string, unknown>>): void {
    try { this.deps.teardown?.(row, report); }
    catch (e) { this.deps.warn(`the teardown of child ${row.task_id} raised: ${String(e)}`); }
  }

  /** Called by the child's execution when it reaches a terminal state, and by the sweeps. */
  settled(row: ChildRow): void {
    for (const l of [...this.terminalListeners]) { try { l(row); } catch (e) { this.deps.warn(`a terminal listener raised: ${String(e)}`); } }
    for (const w of [...this.waiters]) {
      if ([...w.ids].every((id) => { const r = this.deps.ledger.get(id); return !r || isTerminalChildState(r.state); })) { this.waiters.delete(w); w.resolve(); }
    }
  }

  /** REQ-TOOLS-156: resolves when every task in the set is terminal, or on cancellation; never on a deadline. */
  waitFor(ids: readonly string[]): Promise<void> {
    const set = new Set(ids);
    if (this.cancelled || this.resting || this.closed || [...set].every((id) => { const r = this.deps.ledger.get(id); return !r || isTerminalChildState(r.state); })) return Promise.resolve();
    return new Promise<void>((resolve) => { this.waiters.add({ ids: set, resolve }); });
  }

  /** REQ-ORCH-052/133: settle every non-terminal record `cancelled` through the normal path, re-checking per record. */
  finalizeIncomplete(reason: string): number {
    this.cancelled = true;
    let n = 0;
    for (const c of this.deps.ledger.all()) {
      const current = this.deps.ledger.get(c.task_id);
      if (!current || isTerminalChildState(current.state)) continue;
      const r = this.deps.ledger.transition(c.task_id, 'cancelled', 'cancellation');
      if (r.ok) {
        n += 1;
        const report = { agent_name: c.canonical_name, role: c.persona, status: 'cancelled', summary: reason, key_findings: [], last_response: '', final_response: '', errors: [{ type: 'cancelled', message: reason }] };
        this.deps.ledger.storeReport(c.task_id, report);
        this.tearDown(r.row, report);
        this.settled(r.row);
      } else this.deps.warn(r.reason);
    }
    for (const w of [...this.waiters]) { this.waiters.delete(w); w.resolve(); }
    return n;
  }

  get hasNonTerminal(): boolean {
    return this.deps.ledger.all().some((c) => !isTerminalChildState(c.state));
  }
  get isCancelled(): boolean {
    return this.cancelled;
  }
}

/**
 * REQ-ORCH-108 / REQ-ORCH-112: the report of a child REQ-ORCH-048's cascade blocked. It never started, so it made no
 * call and said nothing: no summarising pass is made, and the report states only why it never ran.
 */
export function blockedReport(child: Pick<ChildRow, 'canonical_name' | 'persona'>, dependency: Pick<ChildRow, 'task_id' | 'canonical_name' | 'state'>): Record<string, unknown> {
  const message = `Its dependency ${dependency.canonical_name} (${dependency.task_id}) ended ${dependency.state}, so this child never started (REQ-ORCH-048).`;
  return { agent_name: child.canonical_name, role: child.persona, status: 'blocked', summary: `Blocked: ${message}`, key_findings: [], last_response: '', final_response: '', errors: [{ type: 'blocked', message }] };
}
