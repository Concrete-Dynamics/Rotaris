import type { ChildRow } from '@rotaris/store';
import { cutOffLines, type CutOff } from './cut-off.js';

/**
 * REQ-ORCH-055..060, REQ-ORCH-063, REQ-MONITOR-023, REQ-TOOLS-152, REQ-TOOLS-154: the messages a parent receives —
 * the background-started message, the completion notification, the resume message with per-child report
 * blocks capped at 4,000 characters — and the child's payload in REQ-TOOLS-154's order (the dependency reports
 * ahead of everything, the workspace-root prefix, Part Y's artifact context blocks, the inherited-context block,
 * then the task text). The wording is the implementation's; the facts each must carry are the requirements'.
 */
export const REPORT_BLOCK_CAP = 4_000;

export interface StoredReport {
  readonly agent_name?: string;
  readonly role?: string;
  readonly status?: string;
  readonly summary?: string;
  readonly key_findings?: readonly string[];
  readonly last_response?: string;
  readonly final_response?: string;
  readonly errors?: readonly { type: string; message: string }[];
  /** PD-ORCH-004: a child cut off while making progress (see `ChildReport.cut_off`). */
  readonly cut_off?: Partial<CutOff>;
}

export function parseReport(row: ChildRow): StoredReport | null {
  if (!row.report) return null;
  try { return JSON.parse(row.report) as StoredReport; } catch { return null; }
}

function cap(text: string): string {
  if (text.length <= REPORT_BLOCK_CAP) return text;
  return `${text.slice(0, REPORT_BLOCK_CAP)}\n… [${text.length - REPORT_BLOCK_CAP} characters omitted]`;
}

/**
 * REQ-ORCH-060: canonical name, role, status, then the result text (final, else last, else key findings). PD-ORCH-004:
 * for a child cut off while making progress, its report's additions follow the capped result text — outside the
 * 4,000-character cap, which bounds the result text, so the path list and the offer are never the part cut away.
 */
export function reportBlock(row: ChildRow): string {
  const r = parseReport(row);
  const result = r?.final_response || r?.last_response || (r?.key_findings ?? []).map((k) => `- ${k}`).join('\n') || r?.summary || '(no report)';
  return [`### ${row.canonical_name} (${row.persona}) — ${r?.status ?? row.state}`, cap(result), ...cutOffLines(r?.cut_off)].join('\n');
}

/** REQ-ORCH-058: the background pass's immediate resume. */
export function backgroundStartedMessage(started: readonly ChildRow[]): string {
  return [
    'Background tasks have started. Continue productive work; use wait_for_tasks only when you need a specific result.',
    'Active background tasks:',
    ...started.map((c) => `- ${c.canonical_name} \`${c.task_id}\`: ${c.given_name}`),
  ].join('\n');
}

/** REQ-ORCH-059: one completion notification per background child, announced exactly once. */
export function completionNotification(done: ChildRow, stillRunning: number, durationS: number): string {
  const lines = [
    '[Background task completed]',
    `task_id: ${done.task_id}`,
    `description: ${done.canonical_name} (${done.given_name})`,
    `duration: ${durationS.toFixed(1)} s`,
    `state: ${done.state}`,
  ];
  if (stillRunning > 0) lines.push(`${stillRunning} background task(s) still running; you will be notified when all complete — do not poll, continue productive work. Retrieve this result with background_output(task_id="${done.task_id}") (detail_level "summary" or "verbatim").`);
  else lines.push('All background tasks have completed.');
  return lines.join('\n');
}

/** REQ-ORCH-057/055: the resume message — the newly terminal children's reports, and what still runs. */
export function resumeMessage(newlyTerminal: readonly ChildRow[], stillRunning: number): string {
  const lines = ['Child task updates are available.', ...newlyTerminal.map(reportBlock)];
  if (stillRunning > 0) lines.push(`${stillRunning} child task(s) are still running in the background.`);
  else lines.push('All background tasks finished. Issue the next batch of delegations in parallel before ending the turn, or answer the user if the work is done.');
  return lines.join('\n\n');
}

/** REQ-ORCH-047: the prior-agent-context block, prepended exactly once when the dependent becomes ready. */
export function priorAgentContext(deps: readonly ChildRow[]): string {
  if (deps.length === 0) return '';
  const sections = deps.map((d) => {
    const r = parseReport(d);
    return `#### ${d.canonical_name} (${d.persona}, ${r?.status ?? d.state})\n${r?.final_response || r?.last_response || r?.summary || '(no report)'}`;
  });
  return ['[Prior agent context — authoritative: rely on these findings rather than repeating the investigation]', ...sections].join('\n\n');
}

/**
 * REQ-TOOLS-152 / REQ-TOOLS-154 item (5): the inherited-context block — the reports of the completed siblings the
 * caller named in `inherited_context`, as they stood when the call was made. Each is REQ-ORCH-060's report block, the
 * same rendering the parent reads on a resume, so a child inherits exactly what its parent was told. The heading says
 * what the block is and is not: context, not a dependency (REQ-ORCH-032 — "without imposing an ordering dependency"),
 * which is what tells it apart from REQ-ORCH-047's authoritative prior-agent context. Empty when nothing was carried.
 */
export function inheritedContextBlock(siblings: readonly ChildRow[]): string {
  if (siblings.length === 0) return '';
  return ['[Inherited context — the reports of sibling tasks that had already completed when you were delegated; read them as context, not as work to repeat, and not as a dependency of yours]', ...siblings.map(reportBlock)].join('\n\n');
}

/**
 * REQ-TOOLS-154's order: REQ-ORCH-047's prior-agent context ahead of everything when present (REQ-ORCH-035), then
 * (1) the workspace root with PD-TOOLS-006's write scopes immediately after it, then Part Y's artifact blocks —
 * (3) `PRIOR SIBLING ARTIFACT INDEX` and (4), where the launch attached any, `PRIOR AGENT CONTEXT (FULL)`
 * (REQ-LIBRARY-097, REQ-LIBRARY-098) — then (5) the inherited-context block (REQ-TOOLS-152), and (6) the task last.
 * `artifactBlocks` arrives in that (3), (4) order. Item (2) has no block here: the verification suite REQ-ORCH-129
 * fills it from is not built. Item (5) was missing until 2026-09-28
 * (`docs/defects/fixed/the-inherited-context-reports-never-reach-the-child.md`).
 */
export function childPayload(workspaceRoot: string, task: string, priorContext: string, artifactBlocks: readonly string[] = [], writeScopes = '', inheritedContext = ''): string {
  const parts: string[] = [];
  if (priorContext) parts.push(priorContext);
  parts.push(`Workspace root: ${workspaceRoot}. Treat any other absolute path you encounter as stale; every path you use is relative to this root.`);
  if (writeScopes !== '') parts.push(writeScopes);
  for (const block of artifactBlocks) if (block !== '') parts.push(block);
  if (inheritedContext !== '') parts.push(inheritedContext);
  parts.push(task);
  return parts.join('\n\n');
}
