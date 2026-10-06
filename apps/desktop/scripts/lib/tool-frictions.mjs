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
import { refusalIssues } from './refusal-issues.mjs';

const CREATE_FIELDS = new Set(['path', 'file_path', 'content']);

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

/** A JSON object's prefix, read key by key; null where it is no object's prefix. A non-string value ends the reading. */
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
    if (text[i] !== '"') { fields.set(key.value, { value: undefined, complete: false, notString: true }); return { fields, cut: true }; }
    const value = string();
    fields.set(key.value, value);
    if (!value.complete || atEnd()) return { fields, cut: true };
    if (text[i] === ',') { i += 1; space(); continue; }
    if (text[i] === '}') return { fields, cut: false };
    return null;
  }
}

/**
 * A `write_file` call whose arguments are only those a create reads, and no `operation` — `{ path }`, or null. Read from
 * the object, or from its cut string: there the path must have survived whole and the content must have begun, and no key
 * read may be another's. A cut that took the path away (the content sent first) is not called create-shaped, since what it
 * named cannot be read.
 */
function createShaped(args) {
  const read = argumentFields(args);
  if (read === null || read.fields.has('operation')) return null;
  const { fields } = read;
  if (![...fields.keys()].every((key) => CREATE_FIELDS.has(key))) return null;
  const path = fields.get('path') ?? fields.get('file_path');
  const content = fields.get('content');
  if (path === undefined || !path.complete || typeof path.value !== 'string' || content === undefined || content.notString) return null;
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
 * The readings above, and REQ-SESSION-136's for the gate's refusals (`refusalIssues`), over every session the run
 * preserved: `sessions` is `[{ scenario, calls, issues }]`, each call tagged with its scenario in what comes back. `read`
 * names the scenarios read, so a NOTE that nothing arose can say where it looked.
 */
export function runWideReadings(sessions, { outside = () => false } = {}) {
  const tag = (scenario, list) => list.map((call) => ({ ...call, scenario }));
  const out = { read: sessions.map((s) => s.scenario), refused: [], unfiled: [], inferred: [], refusedInferable: [], refusedFenced: [], severalActive: [], phantoms: [] };
  for (const { scenario, calls, issues } of sessions) {
    const { refused, unfiled } = refusalIssues(calls, issues);
    const writes = writeSelectorReadings(calls, { outside });
    const todo = todoActiveReadings(calls);
    out.refused.push(...tag(scenario, refused));
    out.unfiled.push(...tag(scenario, unfiled));
    out.inferred.push(...tag(scenario, writes.inferred));
    out.refusedInferable.push(...tag(scenario, writes.refusedInferable));
    out.refusedFenced.push(...tag(scenario, writes.refusedFenced));
    out.severalActive.push(...tag(scenario, todo.severalActive));
    out.phantoms.push(...tag(scenario, todo.phantoms));
  }
  return out;
}
