import { countNoun, HAND_OFF_BUDGET } from '@rotaris/kernel';
import type { ChildRow } from '@rotaris/store';
import { cutOffLines, type CutOff } from './cut-off.js';
import type { OpenServedItem } from './todo-item.js';

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

/**
 * REQ-ORCH-059's open-todo reminder lines: the parent's open plan items, up to the first five, so the parent sees what its
 * own plan still holds as its children finish. None when nothing is open. Missing until 2026-10-07
 * (`docs/defects/fixed/the-completion-notification-carries-no-open-todo-reminder-lines.md`, found ruling OQ-213).
 */
export function openTodoReminderLines(open: readonly string[]): string[] {
  if (open.length === 0) return [];
  const shown = open.slice(0, 5);
  const more = open.length - shown.length;
  return [`Your todo list still holds ${countNoun(open.length, 'open item')}:`, ...shown.map((name) => `- ${name}`), ...(more > 0 ? [`(and ${more} more)`] : [])];
}

/**
 * REQ-ORCH-059: one completion notification per background child, announced exactly once. `openTodo` is the parent's open
 * plan items, appended as the requirement's open-todo reminder lines: for the root, those its task answers for
 * (`Run.openRootPlan`); for a child that delegated, its own todo's.
 */
export function completionNotification(done: ChildRow, stillRunning: number, durationS: number, openTodo: readonly string[] = []): string {
  const lines = [
    '[Background task completed]',
    `task_id: ${done.task_id}`,
    `description: ${done.canonical_name} (${done.given_name})`,
    `duration: ${durationS.toFixed(1)} s`,
    `state: ${done.state}`,
  ];
  if (stillRunning > 0) lines.push(`${countNoun(stillRunning, 'background task')} still running; you will be notified when all complete — do not poll, continue productive work. Retrieve this result with background_output(task_id="${done.task_id}") (detail_level "summary" or "verbatim").`);
  else lines.push('All background tasks have completed.');
  lines.push(...openTodoReminderLines(openTodo));
  return lines.join('\n');
}

/**
 * `PD-TOOLS-006` revision 11 (OQ-333, ruled 2026-10-15 under R-072): the line a wait's message adds after a reported child's
 * result when that child's `todo_item` is still IN_PROGRESS in the caller's plan and no running child holds it.
 */
export const openServedItemLine = (item: OpenServedItem): string =>
  `Todo item ${item.name} (${item.id}) is still IN_PROGRESS: close it with update once you accept this report.`;

const NO_OPEN_ITEMS: ReadonlyMap<string, OpenServedItem> = new Map();

/**
 * REQ-ORCH-060's report block, followed — `PD-TOOLS-006` revision 11 — by the line for the child's item when `openItems` (keyed
 * by task id, `openServedItems`) holds one. Every message that resumes a wait (REQ-ORCH-063) renders its reports through this:
 * the orchestration pass's resume message, `wait_for_tasks`'s result and a foreground `delegate`'s.
 */
export function reportBlockWithItem(row: ChildRow, openItems: ReadonlyMap<string, OpenServedItem> = NO_OPEN_ITEMS): string {
  const item = openItems.get(row.task_id);
  return item === undefined ? reportBlock(row) : `${reportBlock(row)}\n${openServedItemLine(item)}`;
}

/**
 * REQ-ORCH-057/055: the resume message — the newly terminal children's reports, and what still runs. `openItems`
 * (`PD-TOOLS-006` revision 11, OQ-333) names after each report the child's item the caller has still to close.
 */
export function resumeMessage(newlyTerminal: readonly ChildRow[], stillRunning: number, openItems: ReadonlyMap<string, OpenServedItem> = NO_OPEN_ITEMS): string {
  const lines = ['Child task updates are available.', ...newlyTerminal.map((row) => reportBlockWithItem(row, openItems))];
  if (stillRunning > 0) lines.push(`${countNoun(stillRunning, 'child task')} ${stillRunning === 1 ? 'is' : 'are'} still running in the background.`);
  else lines.push('All background tasks finished. Issue the next batch of delegations in parallel before ending the turn, or answer the user if the work is done.');
  return lines.join('\n\n');
}

/**
 * `PD-TOOLS-006` revision 9 (OQ-256): one answer a hand-off block left partly out — the named task, its canonical name, the
 * characters of its result text the child is given and the characters omitted. Read by the `delegate` observation's warning.
 */
export interface HandOffCut {
  readonly taskId: string;
  readonly name: string;
  readonly given: number;
  readonly omitted: number;
}

/** A hand-off block and the answers it cut, in the caller's order. */
export interface HandOffBlock {
  readonly block: string;
  readonly cuts: readonly HandOffCut[];
}

/**
 * `PD-TOOLS-006` revision 9 (OQ-256): the marker a cut answer ends in. It tells the child what it was given and what it was not,
 * that nothing it can reach holds the rest, and that its report must say so.
 */
export function handOffMarker(name: string, given: number, total: number): string {
  const omitted = total - given;
  return `… [hand-off cut: ${given} of ${total} characters of ${name}'s answer are given here and ${omitted} ${omitted === 1 ? 'is' : 'are'} omitted, under the ${HAND_OFF_BUDGET.toLocaleString('en-US')}-character hand-off budget. The rest is in neither the workspace nor the artifact store; say in your report which parts of this answer you did not receive.]`;
}

/**
 * `PD-TOOLS-006` revision 9 (OQ-256): the answers of the named tasks, in the caller's order, under one hand-off budget per block.
 * Each result text (final response, else last response, else key findings, else summary) is carried whole while it fits; one that
 * does not is cut to the larger of the budget's remainder and REQ-ORCH-060's 4,000 characters, so no child receives less than a
 * report block gave it and a block passes the budget by at most 4,000 characters per cut answer, and it ends in `handOffMarker`.
 */
function handOff(rows: readonly ChildRow[], section: (row: ChildRow, report: StoredReport | null, text: string) => string): { sections: string[]; cuts: HandOffCut[] } {
  let used = 0;
  const sections: string[] = [];
  const cuts: HandOffCut[] = [];
  for (const row of rows) {
    const r = parseReport(row);
    const text = r?.final_response || r?.last_response || (r?.key_findings ?? []).map((k) => `- ${k}`).join('\n') || r?.summary || '(no report)';
    const allowed = Math.max(HAND_OFF_BUDGET - used, REPORT_BLOCK_CAP);
    if (text.length <= allowed) {
      used += text.length;
      sections.push(section(row, r, text));
      continue;
    }
    used += allowed;
    cuts.push({ taskId: row.task_id, name: row.canonical_name, given: allowed, omitted: text.length - allowed });
    sections.push(section(row, r, `${text.slice(0, allowed)}\n${handOffMarker(row.canonical_name, allowed, text.length)}`));
  }
  return { sections, cuts };
}

/**
 * REQ-ORCH-047: the prior-agent-context block, prepended exactly once when the dependent becomes ready, under `PD-TOOLS-006`
 * revision 9's hand-off budget (OQ-256), and the answers it cut. Until revision 9 each dependency's answer was carried with no
 * bound, the summary its last fallback.
 */
export function priorAgentContextParts(deps: readonly ChildRow[]): HandOffBlock {
  if (deps.length === 0) return { block: '', cuts: [] };
  const { sections, cuts } = handOff(deps, (d, r, text) => `#### ${d.canonical_name} (${d.persona}, ${r?.status ?? d.state})\n${text}`);
  return { block: ['[Prior agent context — authoritative: rely on these findings rather than repeating the investigation]', ...sections].join('\n\n'), cuts };
}

/** REQ-ORCH-047's block alone (`priorAgentContextParts`). */
export function priorAgentContext(deps: readonly ChildRow[]): string {
  return priorAgentContextParts(deps).block;
}

/**
 * REQ-TOOLS-152 / REQ-TOOLS-154 item (5): the inherited-context block — the answers of the completed siblings the caller named in
 * `inherited_context`, as they stood when the call was made, and the answers it cut. Each reads as REQ-ORCH-060's report block
 * does — canonical name, role and status, then the result text, then a cut-off child's additions (PD-ORCH-004) — but its result
 * text is carried whole under `PD-TOOLS-006` revision 9's hand-off budget (OQ-256), not cut to that block's 4,000 characters. The
 * heading says what the block is and is not: context, not a dependency (REQ-ORCH-032 — "without imposing an ordering
 * dependency"), which is what tells it apart from REQ-ORCH-047's authoritative prior-agent context. Empty when nothing was carried.
 *
 * The falsified reason, kept beside its replacement: the block was each sibling's `reportBlock`, "the same rendering the parent
 * reads on a resume, so a child inherits exactly what its parent was told". A resume is the parent's overview of many children;
 * a hand-off is the one answer the child was delegated to build on, and the routing sentence (`PD-TOOLS-006` revision 8) sends
 * exactly the long answers through it. In the duress live run at 552d346 the architect's 28,330-character answer reached the
 * writer as 4,000 characters and a marker, and the writer wrote 7 of the document's 8 sections from its own reading
 * (docs/defects/fixed/an-answer-handed-on-through-inherited-context-reaches-the-writer-cut-to-4000-characters.md).
 */
export function inheritedContext(siblings: readonly ChildRow[]): HandOffBlock {
  if (siblings.length === 0) return { block: '', cuts: [] };
  const { sections, cuts } = handOff(siblings, (row, r, text) => [`### ${row.canonical_name} (${row.persona}) — ${r?.status ?? row.state}`, text, ...cutOffLines(r?.cut_off)].join('\n'));
  return { block: ['[Inherited context — the reports of sibling tasks that had already completed when you were delegated; read them as context, not as work to repeat, and not as a dependency of yours]', ...sections].join('\n\n'), cuts };
}

/** The inherited-context block alone (`inheritedContext`). */
export function inheritedContextBlock(siblings: readonly ChildRow[]): string {
  return inheritedContext(siblings).block;
}

/**
 * `PD-TOOLS-006` revision 10 (OQ-334, ruled 2026-10-15 under R-072): every child is told that the run keeps its report as an
 * artifact (REQ-LIBRARY-092), and that its report meets a request to publish when it holds no tool that publishes artifacts. Fixed,
 * and true under every grant: a child that holds `artifact_write` is not told its report meets the request. Before it a
 * codebase-analyst briefed to publish called `artifact_write`, which it does not hold (the default live run at 3c03287, d0c3a7f0
 * #10), and the report the run then kept said no artifact had been created (finding F10).
 */
export const CHILD_REPORT_ARTIFACT_SENTENCE = 'When you end, the run keeps your report as an artifact that later agents can list and be handed; if your task asks you to publish your findings and you hold no tool that publishes artifacts, your report meets that request.';

/**
 * REQ-TOOLS-154's order: REQ-ORCH-047's prior-agent context ahead of everything when present (REQ-ORCH-035), then
 * (1) the workspace root, followed by PD-TOOLS-006 revision 10's report-artifact sentence (OQ-334), with PD-TOOLS-006's write
 * scopes immediately after them, then Part Y's artifact blocks —
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
  // PD-TOOLS-006 revision 10 (OQ-334): directly after the root, ahead of the write scopes — in every payload.
  parts.push(CHILD_REPORT_ARTIFACT_SENTENCE);
  if (writeScopes !== '') parts.push(writeScopes);
  for (const block of artifactBlocks) if (block !== '') parts.push(block);
  if (inheritedContext !== '') parts.push(inheritedContext);
  parts.push(task);
  return parts.join('\n\n');
}
