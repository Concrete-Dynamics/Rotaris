/**
 * The live `rename` scenario's readings (fin42, N59; OQ-245, PD-MCP-004, PD-ORCH-004, REQ-ORCH-109, REQ-MCP-015): a coding-agent
 * asked to rename the todo-app fixture's `remaining` to `countRemaining` with the code-intelligence EDIT tier's symbol rename.
 *
 * What it reads, each from the store or the files on disk and never from the model's prose:
 * - whether any agent called `rename_symbol` at all — a live model may choose another tool, and then the scenario's questions are
 *   unasked (a NOTE, "not reached"), never a silent pass;
 * - whether the agent that renamed searched for the symbol's references first (`find_referencing_symbols` before its first
 *   rename): the pinned runtime renamed the declaring file alone when the rename was its first cross-file request, and since
 *   PD-MCP-004 (OQ-273, ruled 2026-10-13) the run host sends that search itself before every rename and records no row for it
 *   (docs/defects/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md), so a
 *   cold rename must reach every file on its own;
 * - which of the three files still call or import the old name, which carry the new one, and which were written by another tool
 *   after the first rename (mended by hand);
 * - whether the renaming child's stored report and its child-report artifact list every one of the three files that changed
 *   (OQ-245's reach observation, PD-ORCH-004, REQ-ORCH-109).
 *
 * Nothing here is product code. It runs only from the live run.
 */

export const RENAME_FROM = 'remaining';
export const RENAME_TO = 'countRemaining';
/** The fixture's three files that declare, call or import `remaining` (`apps/desktop/scripts/fixtures/todo-app/src`). */
export const RENAME_FILES = ['src/App.jsx', 'src/todos.js', 'src/todos.test.js'];

/** The calls that may write a workspace file: the native file tools and the code-intelligence EDIT tier. */
const WRITERS = new Set(['write_file', 'haet_edit', 'haet', 'edit', 'replace_content', 'replace_in_files', 'replace_symbol_body', 'insert_before_symbol', 'insert_after_symbol', 'safe_delete_symbol', 'rename_symbol']);

/**
 * Whether a file's text still uses `name` as an identifier — a call, or a name in an import or export list. A string or a
 * comment that merely says the word (the fixture's test title, "the remaining count") is not a use, and a rename leaves it.
 */
export function namesIdentifier(text, name) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${n}\\s*\\(|[{,]\\s*${n}\\s*(?:,|\\}|as\\b)|\\bfunction\\s+${n}\\b`).test(String(text ?? ''));
}

/** The workspace-relative path a writing call names, from the argument names the native tools and the EDIT tier use. */
function pathOf(args) {
  const p = args?.path ?? args?.relative_path ?? args?.file_path ?? null;
  return typeof p === 'string' ? p.replace(/\\/g, '/').replace(/^\.\//, '') : null;
}

/**
 * The scenario's reading.
 *
 * @param {{ calls: Array<{ ordinal: number, tool_name: string, agent_name: string | null, status: string, args: Record<string, unknown>, result: string }>,
 *           files: Record<string, string | null>,
 *           children: Array<{ canonical_name: string, persona?: string | null, report: string | null }>,
 *           artifacts?: Array<{ edited_files: string | null }> }} input
 */
export function renameReading({ calls, files, children, artifacts = [] }) {
  const renames = calls.filter((c) => c.tool_name === 'rename_symbol');
  const leftBehind = RENAME_FILES.filter((f) => files[f] != null && namesIdentifier(files[f], RENAME_FROM));
  const carrying = RENAME_FILES.filter((f) => files[f] != null && namesIdentifier(files[f], RENAME_TO));
  if (renames.length === 0) return { reached: false, renames: 0, leftBehind, carrying };
  const first = renames[0];
  const agent = first.agent_name ?? null;
  const byAgent = calls.filter((c) => c.agent_name === agent);
  const searchedFirst = byAgent.some((c) => c.tool_name === 'find_referencing_symbols' && c.ordinal < first.ordinal);
  const mendedAfter = [...new Set(calls
    .filter((c) => c.ordinal > first.ordinal && WRITERS.has(c.tool_name) && c.tool_name !== 'rename_symbol' && c.status === 'ok')
    .map((c) => pathOf(c.args))
    .filter((p) => p !== null && RENAME_FILES.includes(p)))].sort();
  const child = children.find((c) => c.canonical_name === agent) ?? null;
  let report = null;
  try { report = child?.report ? JSON.parse(child.report) : null; } catch { report = null; }
  const reportFiles = Array.isArray(report?.edited_files) ? report.edited_files.map(String) : null;
  const artifactLists = artifacts.map((a) => { try { return JSON.parse(a.edited_files ?? '[]').map((f) => (typeof f === 'string' ? f : f?.path)).filter((f) => typeof f === 'string'); } catch { return []; } });
  const reportMissing = reportFiles === null ? [...carrying] : carrying.filter((f) => !reportFiles.includes(f));
  const artifactMissing = artifactLists.length === 0 ? [...carrying] : carrying.filter((f) => !artifactLists.some((list) => list.includes(f)));
  const cold = !searchedFirst && first.status === 'ok';
  return {
    reached: true, renames: renames.length, agent, persona: child?.persona ?? null,
    first: { ordinal: first.ordinal, status: first.status, args: first.args, result: String(first.result ?? '').slice(0, 300) },
    searchedFirst, cold, leftBehind, carrying, mendedAfter,
    reportFiles, reportMissing, artifactFiles: artifactLists, artifactMissing,
    // A finding against PD-MCP-004: a rename with nothing before it that left the importing files behind, or whose importing files
    // another tool wrote afterwards — the run host's own search before the rename did not make it reach them. Until the ruling this
    // was OQ-273's signature, read as a NOTE (the field was `oq273`).
    coldLeftBehind: cold && (leftBehind.length > 0 || mendedAfter.some((f) => f !== 'src/todos.js')),
  };
}
