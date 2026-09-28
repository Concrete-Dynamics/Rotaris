import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RUN_AGENT_ID, type AgentRecord } from '@rotaris/contracts';
import { CANCEL_RUN_TEXT } from './agents.js';
import { AgentCancelConfirm } from './AgentCancelConfirm.js';

/**
 * PD-ORCH-005 clause 16 (OQ-74): the Workspace's and a persona window's agent cancel is `AgentCancelConfirm`, whose
 * dismissal is `cancelConfirmation`'s — a paused child is kept with "Keep it paused", a live agent and the run with "Keep
 * running". Its props take no label, so a call site that put its own "Keep running" back would not typecheck (found by
 * the merged revision 4 build's fourth review: both sites once spread the helper and overrode its label).
 */
describe('one agent\'s cancel confirmation', () => {
  const record = (id: string, presentationState: AgentRecord['presentationState']): AgentRecord => ({ id, name: id, presentationState, parentId: RUN_AGENT_ID } as AgentRecord);
  const render = (agent: { id: string; name: string }, agents: AgentRecord[]) => renderToStaticMarkup(createElement(AgentCancelConfirm, { agent, agents, onConfirm: () => undefined, onCancel: () => undefined }));
  it('dismisses a paused child with "Keep it paused", before its destructive confirm', () => {
    const paused = record('one', 'paused');
    const html = render(paused, [paused]);
    expect(html).toContain('>Keep it paused<');
    expect(html).not.toContain('Keep running');
    expect(html.indexOf('Keep it paused')).toBeLessThan(html.indexOf('>Cancel one<'));
    expect(html).toContain('btn btn-danger');
  });
  it('dismisses a live agent with "Keep running"', () => {
    const live = record('two', 'running');
    expect(render(live, [live])).toContain('>Keep running<');
  });
  it('REQ-MONITOR-126: the run\'s cancel is the same confirmation, kept with "Keep running"', () => {
    const html = render({ id: RUN_AGENT_ID, name: 'the run' }, [record('one', 'paused')]);
    expect(html).toContain('Cancel the run?');
    expect(html).toContain(CANCEL_RUN_TEXT);
    expect(html.indexOf('>Keep running<')).toBeLessThan(html.indexOf('>Cancel the run<'));
  });
});

/**
 * The two call sites open their confirmation only after a click, which no static render reaches (the test environment is
 * `node`), so what pins them is their source: each draws its cancel confirmations through `AgentCancelConfirm` alone and
 * never takes the labels itself. Putting back the fourth review's defect — spreading `cancelConfirmation` into a
 * `ConfirmDialog` with a `cancelLabel="Keep running"` of its own — fails here.
 */
describe('PD-ORCH-005 clause 16: the Workspace and a persona window draw an agent\'s cancel through AgentCancelConfirm', () => {
  const source = (file: string): string => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  for (const [file, sites] of [['WorkspaceView.tsx', 2], ['PersonaWindow.tsx', 1]] as const) it(file, () => {
    const text = source(file);
    expect(text.match(/<AgentCancelConfirm\s/g) ?? []).toHaveLength(sites);
    expect(text).not.toMatch(/\bcancelConfirmation\b/);
    expect(text).not.toMatch(/Keep running|Keep it paused/);
  });
});
