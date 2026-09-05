/**
 * REQ-MONITOR-044/049/060 (Part R): the per-agent tool activity and the latest prompt-token reading, kept
 * INCREMENTALLY beside the writer so that projecting an `AgentRecord` never re-reads the transcript or the tool-call
 * ring — REQ-MONITOR-038 forbids a refresh whose cost grows with the session. The writer feeds it at `tool.start`
 * and `tool.finish` (the two chokepoints every dispatched call passes), the turn feeds it after every model step,
 * and a loaded session seeds it ONCE from the tool-call ring (bounded by ADR-0024's cap), never again.
 *
 * Keyed by the agent's canonical name — the name the tool-call record carries (`agent_name`) and the name a child's
 * turn dispatches under (`turn.ts`), which for a child is `children.canonical_name` and for the entry role the persona.
 */
export interface SeedCall {
  readonly agent_name: string;
  readonly call_id: string;
  readonly tool_name: string;
  readonly status: string;
}

interface AgentEntry {
  /** First-call order, so REQ-MONITOR-062's chip order never depends on the state that changed. */
  readonly called: string[];
  readonly calledSet: Set<string>;
  readonly active: Map<string, string>;
  count: number;
  contextUsed: number;
}

export class AgentActivity {
  private readonly agents = new Map<string, AgentEntry>();

  private entry(agent: string): AgentEntry {
    let e = this.agents.get(agent);
    if (!e) { e = { called: [], calledSet: new Set(), active: new Map(), count: 0, contextUsed: 0 }; this.agents.set(agent, e); }
    return e;
  }

  /** One read at open: every recorded call counts as called; the ones still `running` are active (a crash left them so). */
  seed(rows: readonly SeedCall[]): void {
    for (const r of rows) {
      this.started(r.agent_name, r.call_id, r.tool_name);
      if (r.status !== 'running') this.settled(r.agent_name, r.call_id);
    }
  }
  started(agent: string, callId: string, tool: string): void {
    const e = this.entry(agent);
    if (!e.calledSet.has(tool)) { e.calledSet.add(tool); e.called.push(tool); }
    e.active.set(callId, tool);
    e.count += 1;
  }
  settled(agent: string, callId: string): void {
    this.agents.get(agent)?.active.delete(callId);
  }
  /** REQ-MONITOR-049: the most recent prompt-token reading replaces the previous one; it is never summed. */
  usage(agent: string, promptTokens: number): void {
    if (!Number.isFinite(promptTokens) || promptTokens < 0) return;
    this.entry(agent).contextUsed = Math.round(promptTokens);
  }
  /** REQ-MONITOR-211: a settled agent has no active call; its called history stays. */
  clearActive(agent: string): void {
    this.agents.get(agent)?.active.clear();
  }

  calledTools(agent: string): string[] {
    return [...(this.agents.get(agent)?.called ?? [])];
  }
  activeTools(agent: string): string[] {
    const e = this.agents.get(agent);
    if (!e) return [];
    const out: string[] = [];
    for (const tool of e.active.values()) if (!out.includes(tool)) out.push(tool);
    return out;
  }
  callCount(agent: string): number {
    return this.agents.get(agent)?.count ?? 0;
  }
  contextUsed(agent: string): number {
    return this.agents.get(agent)?.contextUsed ?? 0;
  }
}
