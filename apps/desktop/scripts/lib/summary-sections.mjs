/**
 * The live run's reading of a session's `summary.md` (REQ-SESSION-140), the file the product writes beside the session's
 * log and `preserveRun` copies into the pack (`apps/desktop/scripts/live-run.mjs`). Until fin23 the pack carried no
 * `summary.md` and nothing read it, so fin22's repair of the file had no live evidence
 * (`docs/defects/fixed/the-live-runs-pack-carries-no-summary-md.md`).
 *
 * The requirement's order: a `# Session <id>` heading; status, workspace, created and updated; the task; the stop reason
 * only where one is recorded; Metrics; Warnings (the kinds it names, the permission audit named beside the denials);
 * Agents; Slowest Tools; the closing inspection note. The Outcome block (OQ-60 as ruled) is the build's own and is not
 * read here. Beside the order, one agreement the file owes itself: the Warnings line's tool errors are the Issues line's
 * `tool_error` entries (REQ-SESSION-136; `docs/defects/fixed/summary-md-tool-errors-line-counts-one-outcome-bucket-not-every-tool-error.md`).
 *
 * Nothing here is product code. It runs only from the live run.
 */

/** The Warnings section's kinds, as `renderSummary` labels them, in the requirement's order. */
export const SUMMARY_WARNING_KINDS = ['Stale-input drops', 'Mostly-elided artifacts', 'Report downgrades', 'Permission denials', 'Tool errors', 'Terminal failures', 'Terminal suspicious successes', 'Timeouts'];

/**
 * `{ ok, problems }` for one `summary.md`: `problems` names each way the file departs from REQ-SESSION-140, empty when it
 * does not. `stopReason` is the session's recorded stop reason, or null where none is.
 */
export function summaryReading(md, { sessionId, stopReason }) {
  const problems = [];
  const text = String(md ?? '');
  const lines = text.split('\n');
  const order = [
    [`# Session ${sessionId}`, (l) => l === `# Session ${sessionId}`],
    ['- Status: ', (l) => l.startsWith('- Status: ')],
    ['- Workspace: ', (l) => l.startsWith('- Workspace: ')],
    ['- Created: ', (l) => l.startsWith('- Created: ')],
    ['- Updated: ', (l) => l.startsWith('- Updated: ')],
    ['- Task: ', (l) => l.startsWith('- Task: ')],
    ...(stopReason ? [[`- Stop reason: ${stopReason}`, (l) => l === `- Stop reason: ${stopReason}`]] : []),
    ['## Metrics', (l) => l === '## Metrics'],
    ['## Warnings', (l) => l === '## Warnings'],
    ['## Agents', (l) => l === '## Agents'],
    ['## Slowest Tools', (l) => l === '## Slowest Tools'],
    ["_The rest of this session's record", (l) => l.startsWith("_The rest of this session's record")],
  ];
  let from = 0;
  for (const [label, matches] of order) {
    const at = lines.findIndex((l, i) => i >= from && matches(l));
    if (at === -1) { problems.push(lines.some(matches) ? `"${label}" is out of order` : `no "${label}"`); continue; }
    from = at + 1;
  }
  if (!stopReason && lines.some((l) => l.startsWith('- Stop reason:'))) problems.push('a stop-reason line where none is recorded');
  const warnings = sectionOf(lines, 'Warnings');
  let next = 0;
  for (const kind of SUMMARY_WARNING_KINDS) {
    const at = warnings.findIndex((l, i) => i >= next && l.startsWith(`- ${kind}: `));
    if (at === -1) { problems.push(`Warnings has no "${kind}" line, or not in its place`); continue; }
    next = at + 1;
  }
  const denials = warnings.find((l) => l.startsWith('- Permission denials: '));
  if (denials !== undefined && !denials.includes('permission audit')) problems.push('the permission denials do not name the permission audit');
  const toolErrors = /^- Tool errors: (\d+)/.exec(warnings.find((l) => l.startsWith('- Tool errors: ')) ?? '');
  const issues = lines.find((l) => l.startsWith('- Issues: '));
  if (toolErrors !== null && issues !== undefined) {
    const filed = /\btool_error (\d+)/.exec(issues);
    const n = filed === null ? 0 : Number(filed[1]);
    if (Number(toolErrors[1]) !== n) problems.push(`Warnings reads ${toolErrors[1]} tool error(s) and the Issues line ${n} tool_error`);
  }
  return { ok: problems.length === 0, problems };
}

/** The lines of one `## <name>` section, its blank lines dropped. */
function sectionOf(lines, name) {
  const start = lines.indexOf(`## ${name}`);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## ') || l.startsWith('_'));
  return rest.slice(0, end === -1 ? undefined : end).filter((l) => l !== '');
}
