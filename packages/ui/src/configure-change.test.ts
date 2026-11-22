/**
 * PD-CONFIG-014 revision 3 (`docs/design/briefs/approval-card.md`; `transcript-rows.md`, "Brief 2026-11-22"): the approval
 * dialog's change block and a `configure` set's change line with its Undo.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CONFIGURE_CHANGE_PREFIX, configureChangeOf, type ApprovalPayload, type TranscriptRow } from '@rotaris/contracts';
import { APPROVAL_CHANGE_FOOT, ApprovalDialog } from './ApprovalDialog.js';
import { Row, TranscriptSurfaceProvider, type TranscriptSurface } from './transcript/Row.js';
import { describeToolCall } from './transcript/tool-description.js';

const payload = (over: Partial<ApprovalPayload> = {}): ApprovalPayload => ({
  request_id: 'r1', session_id: 's1', agent_id: 'orchestrator', persona: 'orchestrator', tool_name: 'configure', command: '',
  argument_summary: 'operation=set\nsetting=runtime.permission_mode\nvalue=restricted', rule_id: 'builtin:configure-authority', reason: 'why', sequence: 1, ...over,
});
const dialog = (p: ApprovalPayload): string => renderToStaticMarkup(createElement(ApprovalDialog, { payload: p, othersWaiting: 0, onAnswer: () => Promise.resolve({ delivered: true }) }));

describe('the approval dialog states a configure set\'s change (PD-CONFIG-014 clause 4)', () => {
  it('draws the setting, what it holds now and where, and what it will hold, before the arguments', () => {
    const html = dialog(payload({ change: { setting: 'runtime.permission_mode', scope: 'workspace', current: '"autonomous"', currentScope: 'workspace', proposed: '"restricted"' } }));
    expect(html).toContain('Change to the configuration');
    expect(html).toContain('runtime.permission_mode');
    expect(html).toContain('&quot;autonomous&quot;');
    expect(html).toContain('&quot;restricted&quot;');
    expect(html).toContain('— workspace file');
    expect(html).toContain(APPROVAL_CHANGE_FOOT);
    expect(html.indexOf('approval-change"')).toBeLessThan(html.indexOf('id="approval-detail"'));
    expect(html).toContain('aria-describedby="approval-change approval-detail"');
    // REQ-TOOLS-063's three buttons stand.
    for (const b of ['Deny', 'Approve for this session', 'Approve once']) expect(html).toContain(b);
  });

  it('says a setting no file states is not set, and draws nothing for any other request', () => {
    expect(dialog(payload({ change: { setting: 'runtime.sandbox_mode', scope: 'global', current: null, currentScope: 'default', proposed: '"read-only"' } }))).toContain('not set (the built-in default applies)');
    const plain = dialog(payload({ tool_name: 'terminal', command: 'ls' }));
    expect(plain).not.toContain('Change to the configuration');
    expect(plain).toContain('aria-describedby="approval-detail"');
  });
});

const record = (r: object): string => `Set x in the workspace configuration (/f): 1 → 2.\n${CONFIGURE_CHANGE_PREFIX}${JSON.stringify(r)}`;
const row = (output: string, over: Partial<TranscriptRow> = {}): TranscriptRow => ({
  index: 3, kind: 'tool', settled: true, body: 'configure', at: '2026-11-22T00:00:00Z', ts: '00:00:00', toolName: 'configure', toolStatus: 'ok', durationMs: 10,
  input: '{"operation":"set","setting":"display.show_tool_inputs","value":false}', output, ...over,
});
const drawn = (r: TranscriptRow, over: Partial<TranscriptSurface> = {}): string => renderToStaticMarkup(createElement(TranscriptSurfaceProvider, {
  value: { showReasoning: false, autoCollapseTools: false, runActive: false, nowMs: 0, ...over },
  children: createElement(Row, { display: { shape: 'row', key: 'k', row: r }, expanded: false, onToggle: () => {}, match: null }),
}));

describe('a configure set\'s row draws its change and its Undo (PD-CONFIG-014 clause 7)', () => {
  const undo = () => Promise.resolve({ ok: true as const });

  it('reads the change from the recorded output, a relaunch\'s page-in included', () => {
    expect(configureChangeOf(record({ setting: 'a.b', scope: 'workspace', stated: true, before: 1, after: 2 }))).toEqual({ setting: 'a.b', scope: 'workspace', stated: true, before: 1, after: 2 });
    expect(configureChangeOf(record({ setting: 'a.b', scope: 'global', stated: false, after: 'x' }))).toEqual({ setting: 'a.b', scope: 'global', stated: false, after: 'x' });
    expect(configureChangeOf('Set x … (no record)')).toBeNull();
    expect(configureChangeOf(`${CONFIGURE_CHANGE_PREFIX}{not json`)).toBeNull();
    expect(configureChangeOf(undefined)).toBeNull();
  });

  it('draws before → after · scope and an Undo named for the setting', () => {
    const html = drawn(row(record({ setting: 'display.show_tool_inputs', scope: 'workspace', stated: false, after: false })), { undoConfigChange: undo });
    expect(html).toContain('display.show_tool_inputs: not set → false · workspace');
    expect(html).toContain('data-action="config-undo"');
    expect(html).toContain('aria-label="Undo the change to display.show_tool_inputs"');
    expect(html).toContain('Changes the setting display.show_tool_inputs');
  });

  it('offers no Undo without a writer, on a row with no record, or on a row that did not succeed', () => {
    const out = record({ setting: 'a', scope: 'workspace', stated: true, before: 1, after: 2 });
    expect(drawn(row(out))).not.toContain('config-undo');
    expect(drawn(row('Set a … no record'), { undoConfigChange: undo })).not.toContain('config-undo');
    expect(drawn(row(out, { toolStatus: 'failed' }), { undoConfigChange: undo })).not.toContain('config-undo');
    expect(drawn(row(out, { settled: false, toolStatus: 'running' }), { undoConfigChange: undo })).not.toContain('config-undo');
  });

  it('describes the call by its setting', () => {
    expect(describeToolCall('configure', '{"operation":"read","setting":"medium_model"}')).toBe('Reads the setting medium_model');
    expect(describeToolCall('configure', '{"operation":"explain","setting":"hooks"}')).toBe('Explains the setting hooks');
  });
});
