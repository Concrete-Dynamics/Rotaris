/**
 * The live run's reading of two tool frictions the owner ruled on 2026-10-06 (R-071), read from the tool-call record as
 * `readToolCalls` returns it (`{ ordinal, tool_name, status, args, result }`), in `apps/desktop/scripts/live-run.mjs`'s
 * `frictions` and `duress` scenarios.
 *
 * - **PD-TOOLS-007 (OQ-139).** A `write_file` call with a path and content and no `operation`, for a file that does not
 *   exist, is read as a create and says so. The duress runs refused 1 to 4 children's first write this way, each then
 *   resending its whole file (`docs/defects/fixed/write-files-first-use-refusal-recurred-under-duress.md`). Such a call
 *   refused now is the old shape; a refusal of the same shape that says its file already exists is the directive's own.
 * - **PD-TOOLS-008 (OQ-163).** A `todo` `replace` whose own list marks two tasks `IN_PROGRESS` while none is active is
 *   refused saying so. Before, the refusal named an "Active task" under an id the rejected list minted, and the agent's
 *   `update` of it was refused "Unknown task id" (`docs/defects/fixed/a-rejected-todo-replace-names-an-active-task-it-never-stored.md`).
 *
 * Nothing here is product code. It runs only from the live run.
 */

const CREATE_FIELDS = new Set(['path', 'file_path', 'content']);

/** A `write_file` call whose arguments are only those a create reads, and no `operation`. */
function createShaped(args) {
  if (args === null || typeof args !== 'object' || args.operation !== undefined) return false;
  const path = args.path ?? args.file_path;
  return typeof path === 'string' && typeof args.content === 'string' && Object.keys(args).every((key) => CREATE_FIELDS.has(key));
}

/**
 * PD-TOOLS-007's two readings among `calls`: `inferred`, the calls the gate read as a create (their result says so), and
 * `refusedInferable`, create-shaped calls with no `operation` refused for want of one without saying their file exists.
 * The gate records the repaired arguments, so an inferred call's `args` carry `operation: 'create'`; it is found by its
 * result.
 */
export function writeSelectorReadings(calls) {
  const writes = calls.filter((call) => call.tool_name === 'write_file');
  const inferred = writes.filter((call) => /No operation was given, so this call was read as 'create'/.test(String(call.result ?? '')));
  const refusedInferable = writes.filter((call) => call.status !== 'ok' && /requires an operation/.test(String(call.result ?? '')) && createShaped(call.args) && !/already exists, so the call was not read as a create/.test(String(call.result ?? '')));
  return { inferred, refusedInferable };
}

/**
 * PD-TOOLS-008's reading among `calls`, in ordinal order: `severalActive`, the `replace` refusals that say the submitted
 * list marks more than one task in progress; and `phantoms`, the `todo` calls refused "Unknown task id '<id>'" for an id an
 * earlier refusal named as the "Active task" — the old shape, an id that was never stored.
 */
export function todoActiveReadings(calls) {
  const todos = [...calls].filter((call) => call.tool_name === 'todo').sort((a, b) => a.ordinal - b.ordinal);
  const named = new Set();
  const phantoms = [];
  const severalActive = [];
  for (const call of todos) {
    const result = String(call.result ?? '');
    if (/The submitted list marks \d+ tasks IN_PROGRESS/.test(result)) severalActive.push(call);
    const unknown = /Unknown task id '([^']+)'/.exec(result);
    if (unknown !== null && named.has(unknown[1])) phantoms.push(call);
    const active = /Active task: (\S+) \(/.exec(result);
    if (active !== null) named.add(active[1]);
  }
  return { severalActive, phantoms };
}
