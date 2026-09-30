/**
 * REQ-CONFIG-094: what counts against a `models:` entry's `max_parallel` is "every child agent currently running against
 * that `models:` entry, counted by the entry's key, across the whole process and at every delegation depth — … children
 * belonging to any other session running in the same process". A `ChildLedger` sees one iteration of one session
 * (ADR-0012), and the run host holds every live session at once (ADR-0013), so the count the cap is judged against is
 * the sum over every session this process holds a place for. This is that sum, and nothing more: each session joins
 * while a run of it is under way, and stays joined while it rests with a paused child keeping its place (PD-ORCH-005
 * clause 4, OQ-149), answering how many of its children hold a slot on a key (`holdsModelSlot`: REQ-MONITOR-020's
 * running and summarizing, with REQ-ORCH-050's `starting`); it is woken when a slot frees in another session, so a child
 * it holds `waiting_on_model_slot` is promoted by its own scheduler's pass (REQ-MONITOR-020, REQ-ORCH-050) rather than
 * waiting for something in its own run to change. Held children stay in their own session's queue; the order across
 * sessions is OQ-148's. The key is the string alone, whichever workspace's configuration defines it (OQ-150).
 *
 * Process state, held in memory: a slot is a live child, and no child outlives the process that runs it (REQ-ORCH-053).
 */
export interface SlotHolder {
  /** How many of this session's children hold a slot on the key now. */
  readonly inUse: (modelKey: string) => number;
  /** A slot freed in another session: its run, if one is under way, passes again. Never throws into the one that freed it. */
  readonly wake: () => void;
}

export class ModelSlots {
  private readonly holders = new Set<SlotHolder>();

  constructor(private readonly warn: (m: string) => void = () => undefined) {}

  /** The session holds or may take a place; the returned function is its leaving, which frees whatever it still held. */
  join(holder: SlotHolder): () => void {
    this.holders.add(holder);
    return () => { if (this.holders.delete(holder)) this.freed(holder); };
  }

  /** The slots on the key every OTHER session holds — the holder's own are its ledger's to count. */
  heldElsewhere(modelKey: string, holder: SlotHolder): number {
    let n = 0;
    for (const h of this.holders) if (h !== holder) n += h.inUse(modelKey);
    return n;
  }

  /** A child of `from` reached a terminal state or gave its place up (or `from` left): every other session passes again. */
  freed(from: SlotHolder): void {
    for (const h of [...this.holders]) {
      if (h === from) continue;
      try { h.wake(); } catch (e) { this.warn(`a run woken for a freed model slot raised: ${String(e)}`); }
    }
  }
}
