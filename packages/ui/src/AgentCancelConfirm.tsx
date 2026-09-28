import type { AgentRecord } from '@rotaris/contracts';
import { cancelConfirmation } from './agents.js';
import { ConfirmDialog } from './ConfirmDialog.js';

/**
 * REQ-MONITOR-126/128 and PD-ORCH-005 clause 16 (OQ-74): one agent's cancel confirmation — the run's included — as the
 * Workspace and a persona window draw it. Every label comes from `cancelConfirmation` — a paused child is dismissed with
 * "Keep it paused", a live agent and the run with "Keep running" — and the props take no label of their own, so a call
 * site cannot override it. It sits beside the cancel rules it wraps, so the shared `ConfirmDialog` takes no domain import.
 */
export interface AgentCancelConfirmProps {
  readonly agent: { readonly id: string; readonly name: string };
  readonly agents: readonly AgentRecord[];
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly testId?: string | undefined;
}

export function AgentCancelConfirm({ agent, agents, onConfirm, onCancel, testId }: AgentCancelConfirmProps) {
  return <ConfirmDialog {...cancelConfirmation(agent, agents)} destructive testId={testId} onCancel={onCancel} onConfirm={onConfirm} />;
}
