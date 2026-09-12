import { useId } from 'react';
import type { ReqId } from '@rotaris/contracts';
import { GRAPH_BACK_LABEL, GRAPH_BOUND_NAME, GRAPH_DEPTH_CEILING, GRAPH_DEPTH_FLOOR, GRAPH_DEPTH_NAME, GRAPH_EDGES_DESCRIPTION, GRAPH_EDGES_NAME, GRAPH_NODES_NAME, GRAPH_NO_CENTRE, GRAPH_SUMMARY_NAME, GRAPH_TITLE, depthColumns, edgeSentence, graphDepthDescription, nodeSentence, type GraphModel } from './graph.js';
import { Button as DesignButton, Input as DesignInput } from '../design-system/index.js';

/**
 * Part R2 — the relationship graph's surface (spec 08 §Relationship Graph; REQ-TRACE-322..333, 505). The model is
 * `graph.ts`, pure; this draws it and owns nothing but the depth, which REQ-TRACE-323 forbids persisting — the graph
 * opens at the default depth every time because depth is a property of the question being asked at that moment.
 *
 * Structure is the specification's and craft is the mockup's, and where they differ the specification governs:
 * REQ-TRACE-328 requires "node controls as focusable elements laid out in depth columns" with a textual alternative
 * listing the same edges in the same order, so the surface is columns of node buttons and an edge list — NOT the
 * mockup's absolutely-positioned canvas with SVG lines, which cannot be traversed by keyboard and has no depth
 * ordering to read out. From the mockup's `Requirements` → Graph tab the craft is taken: the node as a small card on
 * the surface ground with the identifier in the mono face above a display-weight label, tags for what it is, the
 * relation named in the mono face beside the edge, and the explanatory line in tertiary text above the whole thing.
 */
export interface GraphPaneProps {
  /** The model `buildGraph` produced, or null while no centre has been chosen (REQ-TRACE-333). The board builds it
      once per read so the surface and the observable state cannot disagree about what is in view. */
  readonly model: GraphModel | null;
  readonly depth: number;
  readonly onDepth: (depth: number) => void;
  /** REQ-TRACE-327: selecting a navigable node re-centres the graph on it. */
  readonly onCentre: (id: ReqId) => void;
  readonly onClose: () => void;
}

export function GraphPane({ model, depth, onDepth, onCentre, onClose }: GraphPaneProps) {
  const titleId = useId();
  const summaryId = useId();
  const boundId = useId();
  // REQ-TRACE-333: no graph content and no contents summary before a centre has been chosen — a theme change included,
  // which is why the empty case is decided from the model's absence and not from anything the board happens to hold.
  const centre = model?.centre ?? null;
  return (
    <section className="req-graph" role="region" aria-labelledby={titleId} data-testid="req-graph" data-centre={centre ?? ''} data-depth={depth}>
      <header className="req-graph__head">
        <h2 id={titleId} className="req-graph__title display">{GRAPH_TITLE}</h2>
        {centre !== null && <span className="req-card__id mono" data-testid="req-graph-centre">{centre}</span>}
        <span className="req-graph__spacer" />
        <label className="req-graph__depth">
          <span className="field-label">Depth</span>
          <DesignInput
            className="input req-graph__depth-input" type="number" data-testid="req-graph-depth"
            min={GRAPH_DEPTH_FLOOR} max={GRAPH_DEPTH_CEILING} value={depth}
            aria-label={GRAPH_DEPTH_NAME} aria-description={graphDepthDescription(depth)} title={graphDepthDescription(depth)}
            onChange={(e) => { const v = Number(e.currentTarget.value); onDepth(v); }}
          />
        </label>
        <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="req-graph-back" onClick={onClose} aria-label={`${GRAPH_BACK_LABEL} of requirements`}>{GRAPH_BACK_LABEL}</DesignButton>
      </header>
      {model === null ? (
        <p className="req-status" role="status" data-testid="req-graph-empty">{GRAPH_NO_CENTRE}</p>
      ) : (
        <>
          <p id={summaryId} className="req-graph__summary card-meta" data-testid="req-graph-summary" aria-label={GRAPH_SUMMARY_NAME}>{model.summary}</p>
          <p id={boundId} className="req-graph__bound card-meta" data-testid="req-graph-bound" aria-label={GRAPH_BOUND_NAME}>{model.bound}</p>
          <div className="req-graph__columns" data-testid="req-graph-nodes" role="group" aria-label={GRAPH_NODES_NAME} aria-describedby={`${summaryId} ${boundId}`}>
            {depthColumns(model).map((column) => (
              <div key={column.depth} className="req-graph__column" data-testid="req-graph-column" data-depth={column.depth}>
                <span className="card-kicker">{column.depth === 0 ? 'Centre' : `Step ${column.depth}`}</span>
                {column.nodes.map((node) => (
                  <DesignButton
                    key={node.id} type="button"
                    className={`req-graph__node${node.id === model.centre ? ' is-centre' : ''}${node.resolved ? '' : ' is-unresolved'}`}
                    data-testid="req-graph-node" data-node={node.id} data-kind={node.kind} data-resolved={node.resolved} data-navigable={node.navigable}
                    disabled={!node.navigable}
                    aria-label={nodeSentence(node)}
                    onClick={() => { if (node.navigable) onCentre(node.id); }}
                  >
                    <span className="req-graph__node-id mono">{node.kind === 'implementation' || node.kind === 'test' ? node.stateLabel : node.id}</span>
                    <span className="req-graph__node-label">{node.label}</span>
                    <span className="req-graph__node-tags">
                      <span className={`tag ${node.kind === 'epic' ? 'tag-accent' : node.resolved ? 'tag-outline' : 'tag-neutral'}`}>{node.kind}</span>
                      <span className="card-meta" data-testid="req-graph-node-health">{node.healthLabel}</span>
                    </span>
                  </DesignButton>
                ))}
              </div>
            ))}
          </div>
          {/* REQ-TRACE-328: the textual alternative — the same edges, in the same order the columns show them, stated as such. */}
          <ol className="req-graph__edges" data-testid="req-graph-edges" aria-label={GRAPH_EDGES_NAME} aria-description={GRAPH_EDGES_DESCRIPTION}>
            {model.edges.map((e) => <li key={`${e.from}|${e.relation}|${e.to}`} data-testid="req-graph-edge"><span className="mono">{e.relation}</span> — {edgeSentence(e, model.nodes)}</li>)}
          </ol>
          {model.edges.length === 0 && <p className="req-graph__empty card-meta" data-testid="req-graph-no-edges">{model.centre} relates to nothing this projection carries, and no implementation site or covering test references it.</p>}
        </>
      )}
    </section>
  );
}
