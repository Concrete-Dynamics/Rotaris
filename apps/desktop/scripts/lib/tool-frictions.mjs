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
 * Both are read over EVERY session the run preserved (`runWideReadings`), not only `frictions` and `duress`: until fin23 the
 * NOTEs said a shape "was not asked this run" while the requirements and resume sessions held both
 * (`docs/defects/fixed/the-live-runs-tool-friction-checks-read-two-scenarios-and-miss-a-refused-call-whose-arguments-were-cut.md`).
 *
 * Nothing here is product code. It runs only from the live run.
 */
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { errorRecordCuts } from './error-record-cuts.mjs';
import { refusalIssues } from './refusal-issues.mjs';

/** The fields only another operation reads: any of them present, whatever its value, and the product infers nothing. */
const OTHER_OPERATION_FIELDS = ['old_string', 'new_string', 'insert_line'];

/**
 * The fields of a recorded `args`, `{ fields: Map<key, { value, complete }>, cut }`, or null where it is no object. Until
 * fin23's second repair (2026-10-06) the session writer stored an error-path record's arguments longer than 2,000
 * characters as their JSON cut to a string (REQ-SESSION-136; `settleToolCall` in `packages/engine/src/session-writer.ts`),
 * REQ-SESSION-194's `...` marker counted inside the cap or not: a whole-file write refused is exactly such a record, and a
 * pack or a store written before then still holds them. The cut string is read as far as it goes — each key, and each
 * string value with whether it was cut — so a key the cut took away is simply not seen. Since that repair the writer keeps
 * the arguments an object, cutting only free-text values, each ending `...`, and never a path (`cutArguments` in
 * `packages/engine/src/run/cut.ts`, OQ-209), so such a record is read as an object whose `content` ends with the marker.
 */
export function argumentFields(args) {
  if (args !== null && typeof args === 'object' && !Array.isArray(args)) {
    return { fields: new Map(Object.entries(args).map(([key, value]) => [key, { value, complete: true }])), cut: false };
  }
  if (typeof args !== 'string') return null;
  try {
    const whole = JSON.parse(args);
    return whole !== null && typeof whole === 'object' && !Array.isArray(whole) ? argumentFields(whole) : null;
  } catch { /* cut: read the prefix */ }
  return prefixFields(args);
}

/**
 * A JSON object's prefix, read key by key; null where it is no object's prefix. A literal value (`true`, `false`, `null`, a
 * number) is read and the reading goes on, so a `replace_all: false` before the content does not hide it (until fin25 any
 * non-string value ended the reading); a literal the cut may have split is read as incomplete. An object or array value
 * still ends the reading, so a key after one is never seen.
 */
function prefixFields(text) {
  const fields = new Map();
  let i = 0;
  const space = () => { while (i < text.length && /\s/.test(text[i])) i += 1; };
  // The rest is REQ-SESSION-194's marker, or nothing: the cut came here.
  const atEnd = () => { space(); return i >= text.length || /^\.{1,3}$/.test(text.slice(i)); };
  /** A JSON string from `i` (at its opening quote): its decoded value and whether it closed. */
  const string = () => {
    const start = i;
    i += 1;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i] === '"') { i += 1; return { value: JSON.parse(text.slice(start, i)), complete: true }; }
      i += 1;
    }
    // Cut inside the string: decode what survives, an escape the cut split dropped.
    let raw = text.slice(start + 1).replace(/\.{1,3}$/, '');
    for (;;) { try { return { value: JSON.parse(`"${raw}"`), complete: false }; } catch { if (raw === '') return { value: '', complete: false }; raw = raw.slice(0, -1); } }
  };
  space();
  if (text[i] !== '{') return null;
  i += 1;
  for (;;) {
    if (atEnd()) return { fields, cut: true };
    if (text[i] === '}') return { fields, cut: false };
    if (text[i] !== '"') return null;
    const key = string();
    if (!key.complete) return { fields, cut: true };
    if (atEnd()) { fields.set(key.value, { value: undefined, complete: false }); return { fields, cut: true }; }
    if (text[i] !== ':') return null;
    i += 1;
    if (atEnd()) { fields.set(key.value, { value: undefined, complete: false }); return { fields, cut: true }; }
    let value;
    if (text[i] === '"') value = string();
    else {
      const literal = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
      if (literal === null) { fields.set(key.value, { value: undefined, complete: false, notString: true }); return { fields, cut: true }; }
      i += literal[0].length;
      // `fals` is no literal, and `12` may have been `123`: a literal the cut reached is not known.
      if (atEnd()) { fields.set(key.value, { value: undefined, complete: false, notString: true }); return { fields, cut: true }; }
      value = { value: JSON.parse(literal[0]), complete: true, notString: true };
    }
    fields.set(key.value, value);
    if (!value.complete || atEnd()) return { fields, cut: true };
    if (text[i] === ',') { i += 1; space(); continue; }
    if (text[i] === '}') return { fields, cut: false };
    return null;
  }
}

/**
 * A `write_file` call the product would have read as a create, had its fence let the path be written and its file not
 * existed — `{ path }`, or null. The product's reading is `createOnlyTarget` (`packages/agent-tools/src/tools/files.ts`)
 * and then the schema's own (`writeSchema`, which the gate applies to the inferred call): no `operation`; none of
 * `old_string`, `new_string` or `insert_line`, whatever its value; `replace_all` absent or `false`, since `true` is an
 * edit's and anything else is no boolean; `path` and `file_path` each absent or a string, the target `path ?? file_path`
 * not empty; `content` a string; any other key let through, the schema stripping it. Until fin25 this kept to path,
 * file_path and content alone and took an empty path
 * (docs/defects/fixed/the-live-runs-create-shape-reading-differs-from-the-products-create-only-target.md).
 *
 * Read from the object, or from its cut string, where the reading stops short of the product's in one way it cannot help:
 * a key the cut took away is not seen, so a call whose `old_string` came after its content is still called create-shaped.
 * There the target must have survived whole and the content must have begun; a cut that took the path away (the content
 * sent first) is not called create-shaped, since what it named cannot be read.
 */
function createShaped(args) {
  const read = argumentFields(args);
  if (read === null || read.fields.has('operation')) return null;
  const { fields } = read;
  if (OTHER_OPERATION_FIELDS.some((key) => fields.has(key))) return null;
  const replaceAll = fields.get('replace_all');
  if (replaceAll !== undefined && !(replaceAll.complete && replaceAll.value === false)) return null;
  const named = [fields.get('path'), fields.get('file_path')].filter((field) => field !== undefined);
  if (named.some((field) => typeof field.value !== 'string')) return null;
  const path = named[0];
  if (path === undefined || !path.complete || path.value === '') return null;
  const content = fields.get('content');
  if (content === undefined || content.notString) return null;
  if (content.complete && typeof content.value !== 'string') return null;
  return { path: path.value };
}

/**
 * PD-TOOLS-007's readings among `calls`: `inferred`, the calls the gate read as a create (their result says so);
 * `refusedInferable`, create-shaped calls with no `operation` refused for want of one without saying their file exists —
 * the old shape; and `refusedFenced`, the same refusal of a call whose path `outside(path)` says the write fence refuses,
 * which the directive's first execution reads as its own ("a path the fence refuses is not read as anything, and is
 * refused as before"). The gate records the repaired arguments, so an inferred call's `args` carry `operation: 'create'`;
 * it is found by its result. `outside` defaults to nothing being outside.
 */
export function writeSelectorReadings(calls, { outside = () => false } = {}) {
  const writes = calls.filter((call) => call.tool_name === 'write_file');
  const inferred = writes.filter((call) => /No operation was given, so this call was read as 'create'/.test(String(call.result ?? '')));
  const refusedShaped = writes.flatMap((call) => {
    if (call.status === 'ok' || !/requires an operation/.test(String(call.result ?? '')) || /already exists, so the call was not read as a create/.test(String(call.result ?? ''))) return [];
    const shape = createShaped(call.args);
    return shape === null ? [] : [{ call, path: shape.path }];
  });
  const refusedInferable = refusedShaped.filter((r) => !outside(r.path)).map((r) => r.call);
  const refusedFenced = refusedShaped.filter((r) => outside(r.path)).map((r) => r.call);
  return { inferred, refusedInferable, refusedFenced };
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

/**
 * The root a session's write fence stands on (REQ-TOOLS-130), from its `sessions` row: the requirements worktree its record
 * holds (`worktree`'s `worktree_path`), else its `workspace_root`; null where the row names neither. A requirements run is
 * fenced to its worktree under `<workspace>/.rotaris/requirements/worktrees/…`, not to the workspace: the c2a9444 pack's
 * requirements session refused its ordinal 66 "Path '…' is outside workspace root '<that worktree>'". Until fin25 the live run
 * judged every session by the sandbox's workspace
 * (docs/defects/fixed/the-live-runs-pd-tools-007-check-judges-a-requirements-runs-fence-by-the-workspace.md).
 */
export function fenceRootOf({ workspace_root: workspaceRoot, worktree }) {
  if (typeof worktree === 'string' && worktree !== '') {
    try {
      const path = JSON.parse(worktree)?.worktree_path;
      if (typeof path === 'string' && path !== '') return path;
    } catch { /* an unreadable binding: the workspace root */ }
  }
  return typeof workspaceRoot === 'string' && workspaceRoot !== '' ? workspaceRoot : null;
}

/**
 * Whether the write fence rooted at `root` refuses `path`, as `checkFence` (`packages/agent-tools/src/tools/fence.ts`) reads
 * it with `allow_outside_workspace` off: a relative path resolved against the root, outside both the root as given and its
 * real path.
 */
export function outsideFence(root, path) {
  const roots = [root];
  try { roots.push(realpathSync(root)); } catch { /* the sandbox is gone: the root as given */ }
  return roots.every((r) => {
    const rel = relative(r, isAbsolute(path) ? path : resolve(r, path));
    return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  });
}

/**
 * The readings above, and REQ-SESSION-136's for the gate's refusals (`refusalIssues`), over every session the run
 * preserved: `sessions` is `[{ scenario, calls, issues, fenceRoot? }]`, each call tagged with its scenario in what comes
 * back. `read` names the scenarios read, so a NOTE that nothing arose can say where it looked. A path is judged against the
 * session's own fence (`fenceRoot`, from `fenceRootOf`) by `outside(path, session)`, which defaults to `outsideFence` on it
 * and to nothing being outside where a session names no root. `errorCuts` is `errorRecordCuts` (REQ-SESSION-136's error-path
 * cut under REQ-SESSION-194's marker, live-run finding M3) over the same sessions, each list tagged the same way.
 */
export function runWideReadings(sessions, { outside = (path, session) => (typeof session.fenceRoot === 'string' ? outsideFence(session.fenceRoot, path) : false) } = {}) {
  const tag = (scenario, list) => list.map((call) => ({ ...call, scenario }));
  const out = { read: sessions.map((s) => s.scenario), refused: [], unfiled: [], inferred: [], refusedInferable: [], refusedFenced: [], severalActive: [], phantoms: [] };
  // REQ-SESSION-136's error-path cut under REQ-SESSION-194's marker (live-run finding M3; `./error-record-cuts.mjs`).
  const errorCuts = { errors: [], markedResults: [], unmarkedResults: [], overlongResults: [], markedArgs: [], stringArgs: [], overCapArgs: [], failures: [] };
  for (const session of sessions) {
    const { scenario, calls, issues } = session;
    const { refused, unfiled } = refusalIssues(calls, issues);
    const writes = writeSelectorReadings(calls, { outside: (path) => outside(path, session) });
    const todo = todoActiveReadings(calls);
    out.refused.push(...tag(scenario, refused));
    out.unfiled.push(...tag(scenario, unfiled));
    out.inferred.push(...tag(scenario, writes.inferred));
    out.refusedInferable.push(...tag(scenario, writes.refusedInferable));
    out.refusedFenced.push(...tag(scenario, writes.refusedFenced));
    out.severalActive.push(...tag(scenario, todo.severalActive));
    out.phantoms.push(...tag(scenario, todo.phantoms));
    const cuts = errorRecordCuts(calls);
    for (const key of Object.keys(errorCuts)) errorCuts[key].push(...tag(scenario, cuts[key]));
  }
  return { ...out, errorCuts };
}
