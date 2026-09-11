import { describe, expect, it } from 'vitest';
import type { BoardCard, EpicCard, RequirementDetail } from '@rotaris/contracts';
import { HEALTH_GLOSS, RELATION_LABEL } from '@rotaris/ui-core';
import { GRAPH_DEPTH_CEILING, GRAPH_DEPTH_DEFAULT, GRAPH_DEPTH_FLOOR, GRAPH_NEIGHBOUR_CAP, boundStatement, buildGraph, clampDepth, contentsSummary, depthColumns, edgeSentence, evidenceNodeId, nodeSentence } from './graph.js';

/**
 * Part R2 — the relationship graph's model (spec 08 §Relationship Graph; REQ-TRACE-322..333, 505), measured where a
 * browser is not needed. What the graph DRAWS is `requirements-proof`'s; what it DECIDES — the four node kinds, the
 * evidence node's identifier, the breadth-first walk with first-seen depth winning, the per-node neighbour cap in
 * identifier order, the unexpanded set, the two forms of the bound statement and the two sentence forms — is here.
 */
function card(id: string, over: Partial<BoardCard> = {}): BoardCard {
  return {
    id, title: `Title ${id}`, column: 'backlog', health: 'healthy', lifecycle: 'approved', kind: 'product',
    sourcePath: `docs/${id}.md`, sourceKey: 'docs/requirements', evidence: { sites: [] }, alerts: [], relations: [], facts: [],
    ...over,
  };
}
function detailOf(c: BoardCard, over: Partial<RequirementDetail> = {}): RequirementDetail {
  return { card: c, prose: '', history: [], runs: [], evidenceDetail: [], findings: [], ...over };
}
const epic = (id: string, children: readonly string[]): EpicCard => ({ id, title: `Epic ${id}`, done: 0, total: children.length, children });

describe('the graph depth (REQ-TRACE-323)', () => {
  it('clamps to a floor of 1, a ceiling of 3 and a default of 2', () => {
    expect(GRAPH_DEPTH_FLOOR).toBe(1);
    expect(GRAPH_DEPTH_CEILING).toBe(3);
    expect(GRAPH_DEPTH_DEFAULT).toBe(2);
    expect(clampDepth(0)).toBe(1);
    expect(clampDepth(9)).toBe(3);
    expect(clampDepth(Number.NaN)).toBe(2);
  });
});

describe('the walk (REQ-TRACE-326/329/330/332)', () => {
  const centre = card('REQ-101', { epic: 'REQ-100', relations: [{ kind: 'parent', id: 'REQ-100' }, { kind: 'children', id: 'REQ-404' }] });
  const parent = card('REQ-100', { title: 'Fixture epic' });
  const sibling = card('REQ-102', { epic: 'REQ-100' });
  const cards = [centre, parent, sibling];
  const epics = [epic('REQ-100', ['REQ-101', 'REQ-102'])];

  it('centres on one requirement and takes its relations from the detail, dangling edges included', () => {
    const g = buildGraph('REQ-101', detailOf(centre), cards, epics, 1);
    expect(g.nodes.find((n) => n.id === 'REQ-101')?.depth).toBe(0);
    // REQ-TRACE-330: a target with no card is SHOWN, unresolved, labelled with the bare identifier.
    const dangling = g.nodes.find((n) => n.id === 'REQ-404');
    expect(dangling?.resolved).toBe(false);
    expect(dangling?.label).toBe('REQ-404');
    expect(dangling?.navigable).toBe(false);
    expect(dangling?.healthLabel).toBe('not in this requirement store');
  });

  it('marks the epic as an epic node and only a resolved requirement or epic as navigable (REQ-TRACE-326)', () => {
    const g = buildGraph('REQ-101', detailOf(centre), cards, epics, 1);
    const p = g.nodes.find((n) => n.id === 'REQ-100');
    expect(p?.kind).toBe('epic');
    expect(p?.navigable).toBe(true);
  });

  it('walks one level per iteration with first-seen depth winning and duplicate edges suppressed (REQ-TRACE-332)', () => {
    const g = buildGraph('REQ-101', detailOf(centre), cards, epics, 3);
    // REQ-100 is reached at depth 1; its children bring REQ-102 in at depth 2 and REQ-101 is NOT re-added at depth 3.
    expect(g.nodes.find((n) => n.id === 'REQ-100')?.depth).toBe(1);
    expect(g.nodes.find((n) => n.id === 'REQ-102')?.depth).toBe(2);
    expect(g.nodes.filter((n) => n.id === 'REQ-101')).toHaveLength(1);
    expect(new Set(g.edges.map((e) => `${e.from}|${e.relation}|${e.to}`)).size).toBe(g.edges.length);
  });

  it('attaches implementation and test nodes only at depth 1, only for the centre (REQ-TRACE-331)', () => {
    const g = buildGraph('REQ-101', detailOf(centre, {
      evidenceDetail: [
        { path: 'src/b.ts', line: 9, kind: 'implementation', ids: ['REQ-101'] },
        { path: 'tests/a.ts', line: 3, kind: 'test', ids: ['REQ-101'], testNode: 'tests/a.ts::works' },
      ],
    }), cards, epics, 2);
    const impl = g.nodes.find((n) => n.kind === 'implementation');
    const test = g.nodes.find((n) => n.kind === 'test');
    expect(impl?.id).toBe(evidenceNodeId('implementation', 'src/b.ts', 9));
    expect(impl?.depth).toBe(1);
    expect(test?.depth).toBe(1);
    expect(g.edges.some((e) => e.from === 'REQ-101' && e.to === impl!.id && e.relation === 'implementation')).toBe(true);
    // Sites are admitted in path-then-line order, so the test file follows the source file.
    expect(g.nodes.filter((n) => n.kind === 'implementation' || n.kind === 'test').map((n) => n.label)).toEqual(['src/b.ts:9', 'tests/a.ts:3']);
  });

  it('admits at most fifty neighbours for one node and reports the rest as left out (REQ-TRACE-505)', () => {
    const many = Array.from({ length: 60 }, (_, i) => card(`REQ-${200 + i}`, { epic: 'REQ-100' }));
    const g = buildGraph('REQ-100', detailOf(parent, { card: { ...parent, relations: many.map((m) => ({ kind: 'children' as const, id: m.id })) } }), [parent, ...many], epics, 1);
    expect(g.nodes.filter((n) => n.depth === 1)).toHaveLength(GRAPH_NEIGHBOUR_CAP);
    expect(g.cutOff).toEqual([{ id: 'REQ-100', left: 10 }]);
    expect(g.bound).toContain('10 more neighbours');
    expect(g.bound).toContain('re-centring on it brings them into view');
    // Deterministic: identifier order, so the first admitted is the lowest number and REQ-259 is the first refused.
    expect(g.nodes.filter((n) => n.depth === 1)[0]?.id).toBe('REQ-200');
    expect(g.nodes.some((n) => n.id === 'REQ-259')).toBe(false);
  });
});

describe('what the graph states (REQ-TRACE-324/327/328)', () => {
  const centre = card('REQ-101', { relations: [{ kind: 'parent', id: 'REQ-100' }] });
  const parent = card('REQ-100', { title: 'Fixture epic' });

  it('summarises the centre, the counts and the depth (REQ-TRACE-327)', () => {
    const g = buildGraph('REQ-101', detailOf(centre), [centre, parent], [epic('REQ-100', ['REQ-101'])], 2);
    expect(g.summary).toBe(contentsSummary('REQ-101', g.nodes, 2));
    expect(g.summary).toContain('Centred on REQ-101');
    expect(g.summary).toContain('at depth 2');
    expect(g.summary).toContain('0 implementation sites');
  });

  it('states the bound as fully expanded, or names at most four identifiers then a tail (REQ-TRACE-324/325)', () => {
    expect(boundStatement(2, [], [])).toBe('Depth 2 of 3: everything in view is fully expanded.');
    const many = boundStatement(1, ['REQ-1', 'REQ-2', 'REQ-3', 'REQ-4', 'REQ-5', 'REQ-6'], []);
    expect(many).toContain('REQ-1, REQ-2, REQ-3, REQ-4 and 2 more');
    expect(many).toContain('select one to re-centre on it');
    expect(many).not.toContain('REQ-5,');
  });

  it('reports a node at the bound whose relations reach outside the node set as unexpanded (REQ-TRACE-325)', () => {
    const child = card('REQ-102', { epic: 'REQ-100' });
    const g = buildGraph('REQ-101', detailOf(centre), [centre, parent, child], [epic('REQ-100', ['REQ-101', 'REQ-102'])], 1);
    expect(g.unexpanded).toEqual(['REQ-100']);
    expect(g.bound).toContain('REQ-100');
  });

  it('reads a node and an edge out as sentences (REQ-TRACE-328)', () => {
    const g = buildGraph('REQ-101', detailOf(centre), [centre, parent], [], 1);
    const node = g.nodes.find((n) => n.id === 'REQ-100')!;
    // The label, the health label and the projection's own gloss, in that order; the words are `ui-core`'s table and
    // are not copied here, so a change to the gloss cannot leave two spellings of one sentence in the repository.
    expect(nodeSentence(node)).toBe(`Fixture epic — healthy — ${HEALTH_GLOSS.healthy}`);
    expect(edgeSentence(g.edges[0]!, g.nodes)).toBe(`Title REQ-101 ${RELATION_LABEL.parent} Fixture epic`);
    const unresolved = buildGraph('REQ-101', detailOf(card('REQ-101', { relations: [{ kind: 'parent', id: 'REQ-900' }] })), [centre], [], 1);
    expect(nodeSentence(unresolved.nodes.find((n) => n.id === 'REQ-900')!)).toContain('(unresolved)');
  });

  it('lays the nodes out in depth columns, shallowest first', () => {
    const g = buildGraph('REQ-101', detailOf(centre), [centre, parent], [], 1);
    expect(depthColumns(g).map((c) => c.depth)).toEqual([0, 1]);
    expect(depthColumns(g)[0]!.nodes.map((n) => n.id)).toEqual(['REQ-101']);
  });

  it('shows the centre alone while its detail has not arrived (REQ-TRACE-329: nothing is inferred from a summary)', () => {
    const g = buildGraph('REQ-101', null, [centre, parent], [], 2);
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toHaveLength(0);
    expect(g.summary).toContain('1 requirement');
  });
});
