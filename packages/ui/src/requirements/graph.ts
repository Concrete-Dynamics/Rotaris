import type { BoardCard, EpicCard, ReqId, RequirementDetail } from '@rotaris/contracts';
import { compareReqIds } from '@rotaris/contracts';
import { HEALTH_GLOSS, RELATION_LABEL, columnLabel } from '@rotaris/ui-core';

/**
 * Part R2 — the relationship graph's pure model (spec 08 §Relationship Graph, REQ-TRACE-322..333 and REQ-TRACE-505).
 * Part AK′ left the graph unbuilt (its handoff §3, "the graph axis — wave 3's") and Part AP left it where the first
 * execution had it; this is that build, as a presentation of the board rather than a grouping axis, because
 * REQ-TRACE-322 asks for a graph "centred on one requirement" and an axis has no centre.
 *
 * Everything here is a function of its arguments (REQ-TRACE-322: "the whole graph SHALL be drawn from the projection
 * and nothing else"). The walk is breadth-first with first-seen depth winning, duplicate edges suppressed and an
 * early stop (REQ-TRACE-332); the centre's relations come from the DETAIL, which is the projection's complete answer
 * for one requirement with its dangling edges (REQ-TRACE-329), and deeper levels use only the epic relation the
 * board's own cards carry, which is exact and narrow — nothing is inferred from a card's summary.
 */

export type GraphNodeKind = 'requirement' | 'epic' | 'implementation' | 'test';
/** REQ-TRACE-323: floor 1, ceiling 3, default 2; NOT persisted — the graph opens at the default every time. */
export const GRAPH_DEPTH_FLOOR = 1;
export const GRAPH_DEPTH_CEILING = 3;
export const GRAPH_DEPTH_DEFAULT = 2;
/** REQ-TRACE-505: at most fifty neighbours for any one node at any one level, taken in REQ-TRACE-289's identifier order. */
export const GRAPH_NEIGHBOUR_CAP = 50;
/** REQ-TRACE-324: at most four identifiers before an "and N more" tail. */
export const UNEXPANDED_NAMED_CAP = 4;

export const GRAPH_TITLE = 'Relationship graph';
export const GRAPH_DEPTH_NAME = 'Graph depth';
export const GRAPH_NODES_NAME = 'Graph nodes, laid out in depth columns';
export const GRAPH_EDGES_NAME = 'Graph edges';
export const GRAPH_SUMMARY_NAME = 'What is in view';
export const GRAPH_BOUND_NAME = 'How far the graph reaches';
export const GRAPH_BACK_LABEL = 'Back to the board';
export const GRAPH_EDGES_DESCRIPTION = 'The same edges the columns show, in the same order, as sentences reading source, relation, target.';
export const GRAPH_NO_CENTRE = 'No requirement is centred yet, so there is nothing in view. Open a requirement and choose the graph to centre it.';
export function graphDepthDescription(depth: number): string {
  return `How many relation steps around the centre are shown: ${depth} of a maximum of ${GRAPH_DEPTH_CEILING}.`;
}

export interface GraphNode {
  /** A requirement's identifier, or `<site kind>:<address>` for an evidence node (REQ-TRACE-331). */
  readonly id: string;
  readonly kind: GraphNodeKind;
  readonly label: string;
  readonly depth: number;
  readonly healthLabel: string;
  readonly stateLabel: string;
  readonly resolved: boolean;
  /** REQ-TRACE-326: selecting a node re-centres the graph only when it is a requirement or an epic AND resolved. */
  readonly navigable: boolean;
  readonly path?: string;
  readonly line?: number;
}
export interface GraphEdge { readonly from: string; readonly to: string; readonly relation: string }
export interface GraphModel {
  readonly centre: ReqId;
  readonly depth: number;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  /** REQ-TRACE-325: nodes at exactly the bound depth, resolved, with relations, at least one target of which is absent. */
  readonly unexpanded: readonly ReqId[];
  /** REQ-TRACE-505: how many neighbours a node was refused, by node, so the bound can say it rather than apply it silently. */
  readonly cutOff: readonly { readonly id: ReqId; readonly left: number }[];
  readonly summary: string;
  readonly bound: string;
}

/** REQ-TRACE-323: the depth control's own clamp; a stored or typed value outside the range takes the nearest end. */
export function clampDepth(value: number): number {
  if (!Number.isFinite(value)) return GRAPH_DEPTH_DEFAULT;
  return Math.min(GRAPH_DEPTH_CEILING, Math.max(GRAPH_DEPTH_FLOOR, Math.round(value)));
}

/** REQ-TRACE-330: a target with no card is shown, not hidden, and its health label says what it is. */
const UNRESOLVED_HEALTH = 'not in this requirement store';

function nodeOf(id: ReqId, depth: number, card: BoardCard | undefined, isEpic: boolean): GraphNode {
  if (card === undefined) {
    return { id, kind: 'requirement', label: id, depth, healthLabel: UNRESOLVED_HEALTH, stateLabel: 'unresolved', resolved: false, navigable: false };
  }
  return {
    id, kind: isEpic ? 'epic' : 'requirement', label: card.title === '' ? id : card.title, depth,
    healthLabel: `${card.health} — ${HEALTH_GLOSS[card.health]}`, stateLabel: columnLabel(card.column), resolved: true, navigable: true,
  };
}

/** REQ-TRACE-331: the evidence node's identifier is its site kind and its address; the edge's relation label is the site's own. */
export function evidenceNodeId(kind: string, path: string, line: number): string {
  return `${kind}:${path}:${line}`;
}

/**
 * The graph around `centre`, bounded by `depth` and by REQ-TRACE-505's per-node neighbour cap.
 *
 * `detail` is the centre's detail — the projection's complete answer for it — and is the ONLY source of the centre's
 * relations and of its evidence nodes (REQ-TRACE-329/331). A `null` detail yields the centre alone, which is what a
 * graph opened while the detail is still being read shows.
 */
export function buildGraph(centre: ReqId, detail: RequirementDetail | null, cards: readonly BoardCard[], epics: readonly EpicCard[], depth: number): GraphModel {
  const bound = clampDepth(depth);
  const byId = new Map<ReqId, BoardCard>();
  for (const c of cards) byId.set(c.id, c);
  const epicIds = new Set(epics.map((e) => e.id));
  const nodes: GraphNode[] = [];
  const placed = new Set<string>();
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const cutOff: { id: ReqId; left: number }[] = [];

  const add = (node: GraphNode): void => { if (placed.has(node.id)) return; placed.add(node.id); nodes.push(node); };
  const link = (from: string, to: string, relation: string): void => {
    const key = `${from}→${relation}→${to}`;
    if (edgeKeys.has(key)) return;            // REQ-TRACE-332: duplicate edges suppressed
    edgeKeys.add(key);
    edges.push({ from, to, relation });
  };

  add(nodeOf(centre, 0, byId.get(centre), epicIds.has(centre)));

  /** The neighbours of one requirement: the centre's from its detail, everything deeper from the epic facts the cards carry. */
  const neighboursOf = (id: ReqId): readonly { readonly id: ReqId; readonly relation: string }[] => {
    const out: { id: ReqId; relation: string }[] = [];
    if (id === centre && detail !== null) {
      for (const r of detail.card.relations) out.push({ id: r.id, relation: RELATION_LABEL[r.kind] });
    } else {
      // REQ-TRACE-329: exact but narrow — the parent epic fact, plus the children that name this identifier as their epic.
      const card = byId.get(id);
      if (card?.epic !== undefined) out.push({ id: card.epic, relation: RELATION_LABEL.parent });
      for (const c of cards) if (c.epic === id) out.push({ id: c.id, relation: RELATION_LABEL.children });
    }
    // REQ-TRACE-505: deterministic selection — identifier order, then the cap, and what was left out is reported.
    const ordered = [...out].sort((a, b) => compareReqIds(a.id, b.id));
    if (ordered.length > GRAPH_NEIGHBOUR_CAP) {
      cutOff.push({ id, left: ordered.length - GRAPH_NEIGHBOUR_CAP });
      return ordered.slice(0, GRAPH_NEIGHBOUR_CAP);
    }
    return ordered;
  };

  // REQ-TRACE-332: breadth-first, one level per iteration, stopping early when a level reaches nothing new.
  let frontier: ReqId[] = [centre];
  for (let level = 1; level <= bound; level += 1) {
    const next: ReqId[] = [];
    for (const from of frontier) {
      for (const n of neighboursOf(from)) {
        link(from, n.id, n.relation);
        if (placed.has(n.id)) continue;       // first-seen depth wins
        add(nodeOf(n.id, level, byId.get(n.id), epicIds.has(n.id)));
        if (byId.has(n.id)) next.push(n.id);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  // REQ-TRACE-331: implementation and test nodes only at depth 1, only for the centre, only when a detail is present.
  if (detail !== null) {
    const sites = [...detail.evidenceDetail].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line));
    const admitted = sites.slice(0, GRAPH_NEIGHBOUR_CAP);
    if (sites.length > admitted.length) cutOff.push({ id: centre, left: sites.length - admitted.length });
    for (const s of admitted) {
      const id = evidenceNodeId(s.kind, s.path, s.line);
      const kind: GraphNodeKind = s.kind === 'implementation' ? 'implementation' : 'test';
      add({ id, kind, label: `${s.path}:${s.line}`, depth: 1, healthLabel: kind === 'implementation' ? 'implementation site' : 'covering test', stateLabel: s.testNode ?? s.kind, resolved: true, navigable: false, path: s.path, line: s.line });
      link(centre, id, s.kind);
    }
  }

  const unexpanded = unexpandedSet(nodes, edges, placed, bound, byId, cards, centre, detail);
  return { centre, depth: bound, nodes, edges, unexpanded, cutOff, summary: contentsSummary(centre, nodes, bound), bound: boundStatement(bound, unexpanded, cutOff) };
}

/**
 * REQ-TRACE-325: the unexpanded set is the nodes at EXACTLY the bound depth, resolved, that have relations, at least
 * one of whose targets is not already in the node set. A node whose neighbours the cap cut off is unexpanded too
 * (REQ-TRACE-505), at whatever depth it sits.
 */
function unexpandedSet(
  nodes: readonly GraphNode[], edges: readonly GraphEdge[], placed: ReadonlySet<string>, bound: number,
  byId: ReadonlyMap<ReqId, BoardCard>, cards: readonly BoardCard[], centre: ReqId, detail: RequirementDetail | null,
): readonly ReqId[] {
  const out: ReqId[] = [];
  for (const node of nodes) {
    if (node.depth !== bound || !node.resolved || node.kind === 'implementation' || node.kind === 'test') continue;
    const targets = node.id === centre && detail !== null
      ? detail.card.relations.map((r) => r.id)
      : [...(byId.get(node.id)?.epic === undefined ? [] : [byId.get(node.id)!.epic!]), ...cards.filter((c) => c.epic === node.id).map((c) => c.id)];
    if (targets.length === 0) continue;
    if (targets.some((t) => !placed.has(t))) out.push(node.id);
  }
  void edges;
  return out.sort(compareReqIds);
}

/** REQ-TRACE-327: the centre, the counts of requirements (requirement and epic summed), implementations and tests, and the depth. */
export function contentsSummary(centre: ReqId, nodes: readonly GraphNode[], depth: number): string {
  const requirements = nodes.filter((n) => n.kind === 'requirement' || n.kind === 'epic').length;
  const implementations = nodes.filter((n) => n.kind === 'implementation').length;
  const tests = nodes.filter((n) => n.kind === 'test').length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return `Centred on ${centre}: ${plural(requirements, 'requirement', 'requirements')}, ${plural(implementations, 'implementation site', 'implementation sites')} and ${plural(tests, 'covering test', 'covering tests')} at depth ${depth}.`;
}

/**
 * REQ-TRACE-324: one of two forms — everything in view fully expanded, or the depth followed by the identifiers whose
 * relations are not expanded here (four at most, then an "and N more" tail) and the instruction to select one.
 * REQ-TRACE-505 adds what a cut-off node was refused, and says re-centring brings it into view.
 */
export function boundStatement(depth: number, unexpanded: readonly ReqId[], cutOff: readonly { readonly id: ReqId; readonly left: number }[]): string {
  const cut = cutOff.length === 0 ? '' : ` ${cutOff.map((c) => `${c.id} has ${c.left} more ${c.left === 1 ? 'neighbour' : 'neighbours'} than this graph admits`).join('; ')}; re-centring on it brings them into view.`;
  if (unexpanded.length === 0) return `Depth ${depth} of ${GRAPH_DEPTH_CEILING}: everything in view is fully expanded.${cut}`;
  const named = unexpanded.slice(0, UNEXPANDED_NAMED_CAP);
  const tail = unexpanded.length > named.length ? ` and ${unexpanded.length - named.length} more` : '';
  return `Depth ${depth} of ${GRAPH_DEPTH_CEILING}. Relations are not expanded here for ${named.join(', ')}${tail}; select one to re-centre on it.${cut}`;
}

/** REQ-TRACE-328: the node's sentence — the label, the unresolved mark, then the health label falling back to the state label. */
export function nodeSentence(node: GraphNode): string {
  const health = node.healthLabel === '' ? node.stateLabel : node.healthLabel;
  return `${node.label}${node.resolved ? '' : ' (unresolved)'} — ${health}`;
}
/** REQ-TRACE-328: the edge's sentence reads source, relation, target. */
export function edgeSentence(edge: GraphEdge, nodes: readonly GraphNode[]): string {
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  return `${label(edge.from)} ${edge.relation} ${label(edge.to)}`;
}

/** The nodes in their depth columns, shallowest first; each column keeps the order the walk placed them in. */
export function depthColumns(model: GraphModel): readonly { readonly depth: number; readonly nodes: readonly GraphNode[] }[] {
  const out: { depth: number; nodes: GraphNode[] }[] = [];
  for (let d = 0; d <= model.depth; d += 1) {
    const here = model.nodes.filter((n) => n.depth === d);
    if (here.length > 0) out.push({ depth: d, nodes: here });
  }
  return out;
}
