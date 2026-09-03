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
}

const PRE_START: ReadonlySet<string> = new Set<ChildState>(['waiting_on_dependencies', 'queued', 'waiting_on_model_slot']);

export class Scheduler {
  private readonly waiters = new Set<{ readonly ids: ReadonlySet<string>; readonly resolve: () => void }>();
  private readonly terminalListeners = new Set<(row: ChildRow) => void>();
  private cancelled = false;
  private passing = false;
  private again = false;

  constructor(private readonly deps: SchedulerDeps) {}

  onTerminal(fn: (row: ChildRow) => void): () => void {
    this.terminalListeners.add(fn);
    return () => this.terminalListeners.delete(fn);
  }

  /** The pass, re-entrant-safe: a change during a pass schedules exactly one more pass. */
  pass(): void {
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

  /** REQ-ORCH-048: a dependency in failed/cancelled/blocked blocks every pre-start dependent, transitively. */
  private cascadeBlocked(): boolean {
    let changed = false;
    const all = this.deps.ledger.all();
    for (const c of all) {
      if (!PRE_START.has(c.state)) continue;
      const deps = this.deps_(c).map((d) => all.find((x) => x.task_id === d));
      if (deps.some((d) => d && (d.state === 'failed' || d.state === 'cancelled' || d.state === 'blocked'))) {
        const r = this.deps.ledger.transition(c.task_id, 'blocked');
        if (r.ok) { changed = true; this.settled(r.row); } else this.deps.warn(r.reason);
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
    void this.deps.runChild(row).catch((e) => this.deps.warn(`child ${row.task_id} raised out of its execution: ${String(e)}`)).finally(() => this.pass());
    return true;
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
    if (this.cancelled || [...set].every((id) => { const r = this.deps.ledger.get(id); return !r || isTerminalChildState(r.state); })) return Promise.resolve();
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
        this.deps.ledger.storeReport(c.task_id, { agent_name: c.canonical_name, role: c.persona, status: 'cancelled', summary: reason, key_findings: [], last_response: '', final_response: '', errors: [{ type: 'cancelled', message: reason }] });
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
