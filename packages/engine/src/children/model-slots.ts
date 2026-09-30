/**
 * REQ-CONFIG-094: what counts against a `models:` entry's `max_parallel` is "every child agent currently running against
 * that `models:` entry, counted by the entry's key, across the whole process and at every delegation depth — … children
 * belonging to any other session running in the same process". A `ChildLedger` sees one iteration of one session
 * (ADR-0012), and the run host holds every live session at once (ADR-0013), so the count the cap is judged against is
 * the sum over every run this process has under way. This is that sum, and nothing more: each run joins while it is under
 * way and leaves when it ends, answering how many of its own children hold a slot on a key (REQ-MONITOR-020: running and
 * summarizing, with REQ-ORCH-050's `starting`), and is woken when a slot frees in another run, so a child it holds
 * `waiting_on_model_slot` is promoted by its own scheduler's pass (REQ-MONITOR-020, REQ-ORCH-050) rather than waiting for
 * something in its own run to change. Held children stay in their own session's queue; the order across sessions is
 * OQ-146's.
 *
 * Process state, held in memory: a slot is a live child, and no child outlives the process that runs it (REQ-ORCH-053).
 */
export interface SlotHolder {
  /** How many of this run's children hold a slot on the key now. */
  readonly inUse: (modelKey: string) => number;
  /** A slot freed in another run: pass again. Never throws into the run that freed it. */
  readonly wake: () => void;
}

export class ModelSlots {
  private readonly holders = new Set<SlotHolder>();

  constructor(private readonly warn: (m: string) => void = () => undefined) {}

  /** The run is under way; the returned function is its leaving, which frees whatever it still held. */
  join(holder: SlotHolder): () => void {
    this.holders.add(holder);
    return () => { if (this.holders.delete(holder)) this.freed(holder); };
  }

  /** The slots on the key every OTHER run holds — the holder's own are its ledger's to count. */
  heldElsewhere(modelKey: string, holder: SlotHolder): number {
    let n = 0;
    for (const h of this.holders) if (h !== holder) n += h.inUse(modelKey);
    return n;
  }

  /** A child of `from` reached a terminal state (or `from` left): every other run passes again. */
  freed(from: SlotHolder): void {
    for (const h of [...this.holders]) {
      if (h === from) continue;
      try { h.wake(); } catch (e) { this.warn(`a run woken for a freed model slot raised: ${String(e)}`); }
    }
  }
}
