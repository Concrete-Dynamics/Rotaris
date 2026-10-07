/**
 * The live run's reading of REQ-SESSION-136's error-path cut under REQ-SESSION-194's marker, read from the tool-call record
 * as `readToolCalls` returns it (`{ ordinal, tool_name, isError, args, result }`) over every session the run kept
 * (`runWideReadings` in `./tool-frictions.mjs`).
 *
 * Live-run finding M3 (the default live run at `c2a9444`, 2026-10-06;
 * `docs/defects/fixed/an-error-path-tool-record-cuts-its-arguments-and-result-without-the-cut-marker.md`): the session writer
 * cut an error-path record's arguments and result with a bare `slice(0, 2000)`. Its requirements session held two refused
 * `write_file` calls whose arguments were 2,000-character strings, and a failed `terminal` call whose result was 2,000
 * characters ending mid-word; none carried `...`. Since fin23 the writer cuts with `run/cut.ts`: a result at most 2,000
 * characters, the last three the marker, and the arguments kept an object, only their free-text values cut, each marked
 * (`cutArguments`). Until this reading no live check looked, so the repair was pinned by unit tests alone.
 *
 * What it reads, for each call settled as an error:
 * - a result longer than the cap is `overlong`; one of exactly the cap ending with the marker is `markedResults`, and one of
 *   exactly the cap without it is `unmarkedResults` (a whole result of exactly 2,000 characters reads so too: a coincidence
 *   the detail names, never a pass);
 * - arguments stored as a string are `stringArgs` (M3's shape); an object carrying a string value that ends with the marker
 *   is `markedArgs` (a whole value may end with `...` as well, so this is a count, never a check on its own); an object whose
 *   JSON text passes the cap is `overCapArgs`, which PD-SESSION-003 (OQ-209, ruled 2026-10-07) allows where a path or an
 *   identifier alone passes it.
 *
 * Nothing here is product code. It runs only from the live run.
 */

/** REQ-SESSION-136: an error-path record's arguments and result are cut to this many characters, marker included. */
export const ERROR_RECORD_CAP = 2000;
const MARKER = '...';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Whether any string beneath `value` ends with the marker. */
function carriesMarker(value) {
  if (typeof value === 'string') return value.endsWith(MARKER);
  if (Array.isArray(value)) return value.some(carriesMarker);
  if (isObject(value)) return Object.values(value).some(carriesMarker);
  return false;
}

/**
 * The error-path records of one session's tool calls, sorted by what their cut shows. `failures` is every record that
 * contradicts the repaired cut: an overlong or unmarked result, or arguments stored as a string.
 */
export function errorRecordCuts(calls, cap = ERROR_RECORD_CAP) {
  const out = { errors: [], markedResults: [], unmarkedResults: [], overlongResults: [], markedArgs: [], stringArgs: [], overCapArgs: [], failures: [] };
  for (const call of calls) {
    if (call.isError !== true) continue;
    out.errors.push(call);
    let failed = false;
    const result = String(call.result ?? '');
    if (result.length > cap) { out.overlongResults.push(call); failed = true; }
    else if (result.length === cap) {
      if (result.endsWith(MARKER)) out.markedResults.push(call);
      else { out.unmarkedResults.push(call); failed = true; }
    }
    const args = call.args;
    if (typeof args === 'string') { out.stringArgs.push(call); failed = true; }
    else if (isObject(args)) {
      if (JSON.stringify(args).length > cap) out.overCapArgs.push(call);
      if (carriesMarker(args)) out.markedArgs.push(call);
    }
    if (failed) out.failures.push(call);
  }
  return out;
}
