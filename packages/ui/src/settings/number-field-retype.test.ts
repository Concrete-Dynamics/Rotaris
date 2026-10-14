import { createElement, type FormEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigSnapshot } from '@rotaris/contracts';
import type * as DesignSystem from '../design-system/index.js';
import type { PendingChange } from './config-state.js';

/**
 * PD-CONFIG-003 ("A user's entry is stored as the minutes times 60 seconds", and a value the control cannot express is "never
 * rewritten until the user changes the field"), REQ-CONFIG-322 / REQ-CONFIG-325. Until 2026-10-14 a Runtime number field
 * committed a typed value from React's `onChange`, which React does not raise for a value equal to the one the input holds:
 * a stored 3 s shown clamped as `1` minute and overtyped `1` committed nothing, measured in the built app by
 * `continuation-proof` (`docs/defects/fixed/a-runtime-number-field-ignores-a-value-typed-over-the-same-clamped-digits.md`).
 * A static render reaches no event, so the design-system input is replaced by one that records the props the field hands it,
 * and the field's own handler is called with the text the overtyped input holds.
 */
const handed = new Map<string, Record<string, unknown>>();
vi.mock('../design-system/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof DesignSystem>();
  const { createElement: h } = await import('react');
  return { ...actual, Input: (props: Record<string, unknown>) => { if (typeof props['id'] === 'string') handed.set(props['id'], props); return h('input', { id: props['id'] }); } };
});
const { RuntimeSettings } = await import('./ConfigSettings.js');
const { pendingFrom } = await import('./config-state.js');

const runtime = (over: Record<string, unknown>) => ({ max_depth: 3, max_active_children: 6, child_timeout: 1200, max_iterations: 20, allow_outside_workspace: false, permission_mode: 'ask', improvement_collector_enabled: true, improvement_collector_timeout: 60, retrospective_timeout: 120, keep_going: false, run_start_mode: 'auto', memory_diagnostics_enabled: false, sandbox_mode: 'off', sandbox_writable_roots: [], sandbox_allow_network: false, network_egress_policy: 'ask', network_allowed_hosts: [], network_denied_hosts: [], ...over });
const draw = (over: Record<string, unknown>): PendingChange[] => {
  const snapshot = {
    workspaceRoot: '/ws', loadOk: true, fatal: null, slots: [], models: [], imageInputModels: [], roles: [], runtime: runtime(over),
    rawRuntime: { workspace: null, global: null }, circuitBreakerEnabled: true, compressorThresholdPercentage: 60,
    display: { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 },
    skills: { enabled: true, overrides: {}, invocation_overrides: {} }, instructionsPolicy: { overrides: {} }, injectAgentsMd: true, worktreeStorageSubpath: 'worktrees', delegationStrategy: 'orchestrator', instructions: [], referential: [], warnings: [],
    files: { workspace: '/ws/.rotaris/agents.yaml', global: '/cfg/agents.yaml' },
  } as unknown as ConfigSnapshot;
  const changes: PendingChange[] = [];
  handed.clear();
  renderToStaticMarkup(createElement(RuntimeSettings, {
    snapshot, pending: pendingFrom(snapshot), dirty: false, loading: false, error: null, serviceAvailable: true,
    onChange: (c: PendingChange) => { changes.push(c); }, onSave: async () => ({ ok: true as const }), onDiscard: () => {}, onSetField: async () => ({ ok: true as const }),
  }));
  return changes;
};
/** The input event of a person who selected the field's text and typed `text` over it. */
const typed = (text: string) => ({ currentTarget: { value: text } }) as unknown as FormEvent<HTMLInputElement>;

describe('a Runtime number field takes a value typed over the same clamped digits — PD-CONFIG-003, REQ-CONFIG-322', () => {
  it('a stored 3 s shown as 1 minute and overtyped 1 is entered: the field commits 60 seconds', () => {
    const changes = draw({ child_timeout: 3 });
    const field = handed.get('child-timeout')!;
    expect(field['value']).toBe(1);
    (field['onInput'] as (e: FormEvent<HTMLInputElement>) => void)(typed('1'));
    expect(changes).toEqual([{ kind: 'runtime', key: 'child_timeout', value: 60 }]);
  });

  it('a stored 700 s Improvement analysis timeout shown as 600 and overtyped 600 is entered as 600', () => {
    const changes = draw({ improvement_collector_timeout: 700 });
    const field = handed.get('improvement-timeout')!;
    expect(field['value']).toBe(600);
    (field['onInput'] as (e: FormEvent<HTMLInputElement>) => void)(typed('600'));
    expect(changes).toEqual([{ kind: 'runtime', key: 'improvement_collector_timeout', value: 600 }]);
  });

  it('every clamped field commits from the input event and none from React\'s change event, which skips an unchanged value', () => {
    draw({});
    for (const id of ['max-depth', 'max-active', 'child-timeout', 'improvement-timeout', 'threshold', 'iterations']) {
      const field = handed.get(id);
      expect(field, id).toBeDefined();
      expect(typeof field!['onInput'], id).toBe('function');
      expect(field!['onChange'], id).toBeUndefined();
    }
  });
});
