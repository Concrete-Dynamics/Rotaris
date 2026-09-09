import type { ColumnToken, ReqId } from '@rotaris/contracts';
import { compareReqIds } from '@rotaris/contracts';

/**
 * The release gate and the blocker chain (Part AK; REQ-TRACE-455..462), as a pure function over an injected
 * dependency map. In this product a dependency can exist in exactly one place — the `blocking_ids` of a recorded
 * `dependency` blocker — because the requirement document format declares no `depends-on` key (spec 08 §Data &
 * Formats); the map the service hands in is therefore empty until an engine analysis raises one, and this module
 * is exercised by its tests over a synthetic map. That is stated here rather than discovered.
 */
export interface GateInput {
  readonly id: ReqId;
  /** `depends[a]` = the requirements `a` waits on. Absent = waits on nothing. */
  readonly depends: ReadonlyMap<ReqId, readonly ReqId[]>;
  /** The current column of every known requirement; an id absent here is UNKNOWN (REQ-TRACE-461). */
  readonly columns: ReadonlyMap<ReqId, ColumnToken>;
  readonly reasons?: ReadonlyMap<ReqId, string>;
}
export interface HeldBy { readonly id: ReqId; readonly reason: string; readonly kind: 'dependency' | 'unknown' | 'cycle' }
export interface GatePlan {
  readonly id: ReqId;
  /** REQ-TRACE-455: the gate holds the requirement exactly when this is non-empty. */
  readonly heldBy: readonly HeldBy[];
  /** REQ-TRACE-459: the transitive closure of unsatisfied ancestors, topologically ordered, identical on every read. */
  readonly chain: readonly ReqId[];
  /** REQ-TRACE-459/461: the chain's root — the entry waiting on nothing — or null with the reason stated. */
  readonly root: ReqId | null;
  readonly rootState: ColumnToken | null;
  readonly noRoot?: 'cycle' | 'unknown' | 'none';
  readonly cycle: readonly ReqId[];
  readonly unknown: readonly ReqId[];
}

const SATISFIED: ReadonlySet<ColumnToken> = new Set<ColumnToken>(['done']);

/** A dependency is satisfied when the requirement it names is in the terminal column; anything else holds. */
export function releaseGate(input: GateInput): GatePlan {
  const { id, depends, columns } = input;
  const reason = (dep: ReqId) => input.reasons?.get(dep) ?? `${dep} is not yet delivered (${columns.get(dep) ?? 'unknown'}).`;
  const unsatisfied = (x: ReqId): ReqId[] => (depends.get(x) ?? []).filter((d) => !SATISFIED.has(columns.get(d) ?? 'backlog')).slice().sort(compareReqIds);

  const direct = unsatisfied(id);
  const unknown = new Set<ReqId>();
  // Transitive closure over unsatisfied ancestors, breadth-first, deterministic by identifier order.
  const inChain = new Set<ReqId>();
  const queue = [...direct];
  while (queue.length > 0) {
    const x = queue.shift()!;
    if (inChain.has(x)) continue;
    inChain.add(x);
    if (!columns.has(x)) { unknown.add(x); continue; }
    for (const d of unsatisfied(x)) if (!inChain.has(d)) queue.push(d);
  }
  // Topological order (Kahn) over the chain, ties broken by identifier order so the ordering is stable across reads.
  const nodes = [...inChain].sort(compareReqIds);
  const indeg = new Map<ReqId, number>();
  const out = new Map<ReqId, ReqId[]>();
  for (const n of nodes) { indeg.set(n, 0); out.set(n, []); }
  for (const n of nodes) for (const d of unsatisfied(n)) if (inChain.has(d)) { out.get(d)!.push(n); indeg.set(n, indeg.get(n)! + 1); }
  const ready = nodes.filter((n) => indeg.get(n) === 0);
  const chain: ReqId[] = [];
  while (ready.length > 0) {
    ready.sort(compareReqIds);
    const n = ready.shift()!;
    chain.push(n);
    for (const m of out.get(n)!) { indeg.set(m, indeg.get(m)! - 1); if (indeg.get(m) === 0) ready.push(m); }
  }
  const cycle = nodes.filter((n) => !chain.includes(n)).sort(compareReqIds);
  const heldBy: HeldBy[] = direct.map((d) => ({ id: d, reason: reason(d), kind: !columns.has(d) ? 'unknown' : cycle.includes(d) ? 'cycle' : 'dependency' }));

  // REQ-TRACE-459/461: the root is the first chain entry that itself waits on nothing unsatisfied and is known.
  let root: ReqId | null = null;
  let noRoot: GatePlan['noRoot'] | undefined;
  if (heldBy.length > 0) {
    root = chain.find((n) => columns.has(n) && unsatisfied(n).length === 0) ?? null;
    if (root === null) noRoot = cycle.length > 0 ? 'cycle' : unknown.size > 0 ? 'unknown' : 'none';
  }
  return {
    id,
    heldBy,
    chain,
    root,
    rootState: root === null ? null : (columns.get(root) ?? null),
    ...(noRoot === undefined ? {} : { noRoot }),
    cycle,
    unknown: [...unknown].sort(compareReqIds),
  };
}

/** REQ-TRACE-461: where the root is already released, running, in review or blocked, its current state is reported rather than a second release issued. */
export function rootReleasable(plan: GatePlan): { readonly releasable: true; readonly root: ReqId } | { readonly releasable: false; readonly statement: string } {
  if (plan.heldBy.length === 0) return { releasable: false, statement: `${plan.id} is not held by any dependency.` };
  if (plan.root === null) {
    if (plan.noRoot === 'cycle') return { releasable: false, statement: `The dependency chain of ${plan.id} is a loop (${plan.cycle.join(' → ')}); break it somewhere before anything in it can be released.` };
    if (plan.noRoot === 'unknown') return { releasable: false, statement: `The dependency chain of ${plan.id} reaches ${plan.unknown.join(', ')}, which ${plan.unknown.length === 1 ? 'is' : 'are'} not in this requirement store.` };
    return { releasable: false, statement: `The dependency chain of ${plan.id} has no root: nothing in it waits on nothing.` };
  }
  const s = plan.rootState;
  if (s === 'ready' || s === 'running' || s === 'review' || s === 'blocked') return { releasable: false, statement: `${plan.root}, the chain's root, is already ${s}; no second release is issued.` };
  return { releasable: true, root: plan.root };
}
