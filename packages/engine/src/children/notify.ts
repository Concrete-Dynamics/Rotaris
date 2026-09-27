import type { ChildRow } from '@rotaris/store';

/**
 * REQ-ORCH-055..060, REQ-ORCH-063, REQ-MONITOR-023, REQ-TOOLS-154: the messages a parent receives — the
 * background-started message, the completion notification, the resume message with per-child report
 * blocks capped at 4,000 characters, and the child's payload in the fixed order (the dependency reports,
 * Part Y's artifact context blocks, the workspace-root prefix, then the task text). The wording is the
 * implementation's; the facts each must carry are the requirements'.
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
}

export function parseReport(row: ChildRow): StoredReport | null {
  if (!row.report) return null;
  try { return JSON.parse(row.report) as StoredReport; } catch { return null; }
}

function cap(text: string): string {
  if (text.length <= REPORT_BLOCK_CAP) return text;
  return `${text.slice(0, REPORT_BLOCK_CAP)}\n… [${text.length - REPORT_BLOCK_CAP} characters omitted]`;
}

/** REQ-ORCH-060: canonical name, role, status, then the result text (final, else last, else key findings). */
export function reportBlock(row: ChildRow): string {
  const r = parseReport(row);
  const result = r?.final_response || r?.last_response || (r?.key_findings ?? []).map((k) => `- ${k}`).join('\n') || r?.summary || '(no report)';
  return [`### ${row.canonical_name} (${row.persona}) — ${r?.status ?? row.state}`, cap(result)].join('\n');
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
 * REQ-TOOLS-154's order: REQ-ORCH-047's prior-agent context ahead of everything when present (REQ-ORCH-035), then
 * (1) the workspace root with PD-TOOLS-006's write scopes immediately after it, then Part Y's artifact blocks —
 * (3) `PRIOR SIBLING ARTIFACT INDEX` and (4), where the launch attached any, `PRIOR AGENT CONTEXT (FULL)`
 * (REQ-LIBRARY-097, REQ-LIBRARY-098) — and (6) the task last. `artifactBlocks` arrives in that (3), (4) order.
 * Items (2) and (5) have no block here: the verification suite REQ-ORCH-129 fills (2) from is not built, and (5) is
 * `docs/defects/the-inherited-context-reports-never-reach-the-child.md`.
 */
export function childPayload(workspaceRoot: string, task: string, priorContext: string, artifactBlocks: readonly string[] = [], writeScopes = ''): string {
  const parts: string[] = [];
  if (priorContext) parts.push(priorContext);
  parts.push(`Workspace root: ${workspaceRoot}. Treat any other absolute path you encounter as stale; every path you use is relative to this root.`);
  if (writeScopes !== '') parts.push(writeScopes);
  for (const block of artifactBlocks) if (block !== '') parts.push(block);
  parts.push(task);
  return parts.join('\n\n');
}
