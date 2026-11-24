/**
 * PD-ORCH-018 clause 9: a workflow is one row — the row of the call that started it, carrying the workflow's line: its
 * name, its phase, how many of its agents have ended, its state, and Stop while it runs.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TranscriptRow, WorkflowStatus } from '@rotaris/contracts';
import { Row, TranscriptSurfaceProvider, workflowIdOf, workflowLineText, type TranscriptSurface } from './transcript/Row.js';
import { describeToolCall } from './transcript/tool-description.js';

const STARTED = 'Workflow review started in the background as wf_1. You are told when it ends; until then do other work or end your turn. Read its progress with action "status".';
const row = (over: Partial<TranscriptRow> = {}): TranscriptRow => ({
  index: 4, kind: 'tool', settled: true, body: 'workflow', at: '2026-11-24T00:00:00Z', ts: '00:00:00', name: 'orchestrator', persona: 'orchestrator', toolName: 'workflow', toolStatus: 'ok', durationMs: 3,
  input: '{"action":"start","name":"review","script":"return 1;"}', output: STARTED, ...over,
});
const status = (over: Partial<WorkflowStatus> = {}): WorkflowStatus => ({ id: 'wf_1', agent: 'orchestrator', name: 'review', state: 'running', phase: 'Search', agentsStarted: 3, agentsEnded: 1, calls: 5, ...over });
const drawn = (r: TranscriptRow, over: Partial<TranscriptSurface> = {}, expanded = false): string => renderToStaticMarkup(createElement(TranscriptSurfaceProvider, {
  value: { showReasoning: false, autoCollapseTools: false, runActive: true, nowMs: 0, ...over },
  children: createElement(Row, { display: { shape: 'row', key: 'k', row: r }, expanded, onToggle: () => {}, match: null }),
}));
const stop = () => Promise.resolve({ ok: true as const });

describe('the workflow row (PD-ORCH-018 clause 9)', () => {
  it('reads the workflow\'s id from the start call\'s result, and from no other call', () => {
    expect(workflowIdOf(row())).toBe('wf_1');
    expect(workflowIdOf(row({ output: 'workflow: review (wf_1)\nstate: running' }))).toBeNull();
    expect(workflowIdOf(row({ toolName: 'delegate' }))).toBeNull();
    expect(workflowIdOf(row({ output: undefined }))).toBeNull();
  });

  it('says the name, the phase, the agents ended and the state', () => {
    expect(workflowLineText(status(), 'wf_1')).toBe('review · Search · 1 of 3 agents ended · running');
    expect(workflowLineText(status({ phase: '', agentsStarted: 1, agentsEnded: 1, state: 'completed' }), 'wf_1')).toBe('review · 1 of 1 agent ended · completed');
    expect(workflowLineText(status({ agentsStarted: 0, agentsEnded: 0 }), 'wf_1')).toBe('review · Search · no agent started yet · running');
    expect(workflowLineText(null, 'wf_1')).toBe('wf_1 · its progress is shown while its run is live');
  });

  it('draws the line with Stop while the workflow runs, asking the surface by the row\'s agent and the id', () => {
    const asked: string[] = [];
    const html = drawn(row(), { workflowStatus: (agent, id) => { asked.push(`${agent}/${id}`); return status(); }, stopWorkflow: stop });
    expect(asked).toEqual(['orchestrator/wf_1']);
    expect(html).toContain('data-testid="workflow-line"');
    expect(html).toContain('data-state="running"');
    expect(html).toContain('⤷ review · Search · 1 of 3 agents ended · running');
    expect(html).toContain('data-testid="workflow-stop"');
    expect(html).toContain('aria-label="Stop the workflow review"');
    // The line stands where the preview would: the row draws one or the other, never both.
    expect(html).not.toContain('class="tool__preview');
    expect(html).toContain(describeToolCall('workflow', row().input));
  });

  it('draws the line without Stop once the workflow has ended, and where the surface holds no state for it', () => {
    const ended = drawn(row(), { workflowStatus: () => status({ state: 'completed', agentsEnded: 3 }), stopWorkflow: stop });
    expect(ended).toContain('⤷ review · Search · 3 of 3 agents ended · completed');
    expect(ended).not.toContain('data-testid="workflow-stop"');
    const stored = drawn(row(), { runActive: false });
    expect(stored).toContain('data-state="unknown"');
    expect(stored).toContain('wf_1 · its progress is shown while its run is live');
    expect(stored).not.toContain('data-testid="workflow-stop"');
  });

  it('keeps the line and shows the script when the row is opened; a status or stop call draws no line', () => {
    const open = drawn(row(), { workflowStatus: () => status(), stopWorkflow: stop }, true);
    expect(open).toContain('data-testid="workflow-line"');
    expect(open).toContain('data-testid="tool-input"');
    expect(open).toContain('return 1;');
    expect(drawn(row({ input: '{"action":"status"}', output: 'workflow: review (wf_1)\nstate: running' }))).not.toContain('data-testid="workflow-line"');
  });
});
