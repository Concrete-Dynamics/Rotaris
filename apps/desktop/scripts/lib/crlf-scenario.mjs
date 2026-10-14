/**
 * The live run's `crlf` scenario (fin42; N52 of the 2026-10-13 survey): the edit directives `PD-TOOLS-014` to `PD-TOOLS-018`
 * against a real model on a CRLF, tab-indented fixture. Every live edit until fin42 met the LF todo-app fixture and matched at
 * level 1, so no near miss was asked and no CRLF carry was needed (the 552d346 default autopsy, L69-71; the 0bc3eee log, L206).
 * The fixture is generated into the sandbox at the scenario's start (`lib/crlf-fixture.mjs`) and removed after: a committed CRLF
 * file is normalised by `.gitattributes` and refused by `tools/check-line-endings.mjs`.
 *
 * The model is asked for four edits, each with the tool named: a two-line `haet_edit` on `greet.js` (an LF `old_string` meets the
 * CRLF file at level 2, so `PD-TOOLS-014`'s near miss and its quoted retry), a three-line `write_file` edit of the loop body in
 * `render.js` (a window match, `PD-TOOLS-016`; one indented by hand may reach level 3 or 4), a `write_file` insert at the top of
 * `greet.js` (`PD-TOOLS-018`), and a `replace_all` on `list.txt` whose `new_string` is two lines (`PD-TOOLS-017`).
 *
 * What a pass shows, read from the bytes on disk and the stored results, never from the model's prose: no line of a file that
 * only `write_file` edits and inserts and `haet_edit` touched lost its `\r`; an insert and a multi-line replace-all that
 * succeeded on a CRLF file say they wrote the file's CRLF endings wherever the tool had a `\r` to add (`lfBreak`,
 * `insertOwesCr`). Which shapes the model chose is NOTED: a near miss asked (with `lib/near-miss-edits.mjs`'s reading: retried,
 * probed, ambiguous), the match level the window edit reached, and whether a level-4 window edit landed at the file's depth or as
 * given. Since `PD-TOOLS-019` (OQ-280, ruled 2026-10-13) level 3 sets a line's trailing `\r` aside, so two of those readings are
 * CHECKS: a `render.js` window edit that landed at level 4 although its `old_string` differed from the fixture's window by a
 * uniform indent alone (`\r` set aside) fails, and a level-3 one must land its block at the file's depth (its opening line's
 * indentation read whole, since fin44) and its reply must carry `PD-TOOLS-015`'s shift sentence, then, where `new_string` had an
 * LF break, `PD-TOOLS-016`'s CRLF sentence; any other level-4
 * landing stays a note. A `haet_edit` near miss at level 3 whose LF `old_string` met the CRLF file must name the line endings
 * (`PD-TOOLS-014` revision 3). Until the ruling the level-4 one-tab-shallow landing was a note naming OQ-280
 * (`docs/defects/fixed/on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3.md`).
 *
 * `ctx` is what `live-run.mjs` owns (`approvalContext()`); the readings below are pure and tested beside this file.
 */
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { GREET_LINES, LIST_LINES, RENDER_LINES, lineEndings, writeCrlfFixture } from './crlf-fixture.mjs';
import { nearMissReading } from './near-miss-edits.mjs';

const require = createRequire(import.meta.url);

export const CRLF_DIR = 'crlf-live';
export const CRLF_FILES = { [`${CRLF_DIR}/greet.js`]: GREET_LINES, [`${CRLF_DIR}/render.js`]: RENDER_LINES, [`${CRLF_DIR}/list.txt`]: LIST_LINES };

export const CRLF_PROMPT = [
  `The three files under ${CRLF_DIR}/ use Windows CRLF line endings and tab indentation. Make these four changes, each with exactly the tool named. Do not use the terminal, and do not use write_file's overwrite or create.`,
  `1. ${CRLF_DIR}/greet.js: call haet_read, then make ONE haet_edit call whose old_string is the two consecutive lines \`const greeting = 'Hello';\` and \`if (name) {\` as they stand in the file, and whose new_string is the same two lines with 'Hello' changed to 'Hi'. If haet_edit refuses, do what its reply says and retry with haet_edit.`,
  `2. ${CRLF_DIR}/render.js: call read_file, then make ONE write_file edit (operation edit) whose old_string is the three lines of the if block inside the loop, from \`if (item.visible) {\` to its closing brace, and whose new_string is the same three lines with \`<li>\` changed to \`<li class="shown">\`.`,
  `3. ${CRLF_DIR}/greet.js: call read_file, then use write_file with operation insert and insert_line 0 to add the single line \`// edited by the live run\` at the top.`,
  `4. ${CRLF_DIR}/list.txt: call read_file, then make ONE write_file edit with replace_all true whose old_string is \`alpha\` and whose new_string is the two lines \`alpha-1\` and \`alpha-2\`.`,
  'Reply in one sentence when all four are done.',
].join('\n');

const CRLF_EDIT = "new_string was written with the file's CRLF line endings.";
const CRLF_INSERT = "content was written with the file's CRLF line endings.";
const EDIT_TOOLS = new Set(['write_file', 'haet_edit', 'haet']);
const pathOf = (call) => (typeof call.args?.path === 'string' ? call.args.path : typeof call.args?.file_path === 'string' ? call.args.file_path : null);
const norm = (path) => String(path ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
/**
 * Whether the tool had a `\r` to add, so that PD-TOOLS-017 clause 4 or PD-TOOLS-018 clause 3 owes its sentence: an edit's
 * `new_string` holding a line break with no `\r` before it, or an insert's `content` holding a line that does not end in one.
 * A model that writes the file's CRLF itself — the near-miss quote's `\r`s copied into `new_string` — leaves the tool nothing to
 * carry, and the tool rightly says nothing (`carryExact`, `carryInsert` report only a `\r` they added).
 */
export const lfBreak = (text) => /(^|[^\r])\n/.test(String(text ?? ''));
/**
 * Whether `oldString` differs from some window of `lines` (the fixture as generated) by one uniform leading prefix alone, each
 * line read with one trailing `\r` set aside — what `PD-TOOLS-019` makes a level-3 match. Mirrors REQ-TOOLS-136 level 3 as the
 * directive reads it; nothing here is product code.
 */
export function indentOnlyOff(oldString, lines) {
  const body = (x) => (x.endsWith('\r') ? x.slice(0, -1) : x);
  const indent = (x) => /^\s*/.exec(x)?.[0] ?? '';
  const old = String(oldString ?? '').split('\n').map(body);
  const file = lines.map(body);
  for (let i = 0; i + old.length <= file.length; i += 1) {
    const w = file.slice(i, i + old.length);
    const shift = indent(w[0]).length - indent(old[0]).length;
    if (shift === 0) continue;
    const shifted = old.map((l) => (shift > 0 ? `${indent(w[0]).slice(0, shift)}${l}` : l.startsWith(indent(old[0]).slice(0, -shift)) ? l.slice(-shift) : null));
    if (shifted.every((x, j) => x !== null && x === w[j])) return true;
  }
  return false;
}
export const insertOwesCr = (content) => { const lines = String(content ?? '').split('\n'); if (lines.at(-1) === '') lines.pop(); return lines.some((line) => !line.endsWith('\r')); };

/**
 * `[{ verdict: 'check'|'note', passed?, what, detail? }]` for one run: `calls` are the session's tool calls in order (`{
 * ordinal, tool_name, agent_name, status, args, result, isError }`), `files` maps each fixture path to its text after the run
 * (null when it is gone).
 */
export function crlfVerdicts({ calls, files }) {
  const verdicts = [];
  const touching = (path) => calls.filter((c) => norm(pathOf(c)) === path);
  for (const [path, text] of Object.entries(files)) {
    const writes = touching(path).filter((c) => EDIT_TOOLS.has(c.tool_name) && c.status === 'ok');
    const others = [...touching(path).filter((c) => c.tool_name === 'write_file' && ['overwrite', 'create'].includes(c.args?.operation)), ...calls.filter((c) => c.tool_name === 'terminal' && String(c.args?.command ?? '').includes(path.split('/').pop()))];
    if (text === null) { verdicts.push({ verdict: 'note', what: `crlf: ${path} is gone after the run`, detail: `${writes.length} edit(s) landed` }); continue; }
    const endings = lineEndings(text);
    if (writes.length === 0) { verdicts.push({ verdict: 'note', what: `crlf: no edit of ${path} landed, so its endings were not measured` }); continue; }
    if (others.length > 0) { verdicts.push({ verdict: 'note', what: `crlf: ${path} was also written by overwrite, create or the terminal, so its endings are not the edits' alone`, detail: `LF-only lines ${endings.lfOnlyLines.join(', ') || 'none'}` }); continue; }
    verdicts.push({ verdict: 'check', passed: endings.lfOnly === 0, what: `crlf: every line of ${path} keeps its CRLF ending after ${writes.length} edit(s) (PD-TOOLS-016, PD-TOOLS-017, PD-TOOLS-018)`, detail: endings.lfOnly === 0 ? undefined : `LF-only lines ${endings.lfOnlyLines.join(', ')}` });
  }
  // PD-TOOLS-018: an insert that landed on the CRLF greet.js says so, where it had a `\r` to add.
  const inserts = calls.filter((c) => c.tool_name === 'write_file' && c.args?.operation === 'insert' && c.status === 'ok' && norm(pathOf(c)).startsWith(`${CRLF_DIR}/`));
  if (inserts.length === 0) verdicts.push({ verdict: 'note', what: 'crlf: no write_file insert landed (PD-TOOLS-018 not reached)' });
  else verdicts.push({ verdict: 'check', passed: inserts.every((c) => c.result.includes(CRLF_INSERT) || !insertOwesCr(c.args?.content)), what: "crlf: each insert into a CRLF file says it wrote the file's CRLF endings (PD-TOOLS-018)", detail: inserts.map((c) => `#${c.ordinal} ${c.result.split('\n')[0].slice(0, 160)}`).join(' | ') });
  // PD-TOOLS-017: a replace-all whose new_string holds a line break says so, where it had a `\r` to add.
  const replaceAll = calls.filter((c) => c.tool_name === 'write_file' && c.args?.replace_all === true && c.status === 'ok' && String(c.args?.new_string ?? '').includes('\n'));
  if (replaceAll.length === 0) verdicts.push({ verdict: 'note', what: 'crlf: no replace_all with a multi-line new_string landed (PD-TOOLS-017 replace_all not reached)' });
  else verdicts.push({ verdict: 'check', passed: replaceAll.every((c) => c.result.includes(CRLF_EDIT) || !lfBreak(c.args?.new_string)), what: "crlf: each multi-line replace_all says it wrote the file's CRLF endings (PD-TOOLS-017)", detail: replaceAll.map((c) => `#${c.ordinal} ${c.result.split('\n')[0].slice(0, 160)}`).join(' | ') });
  // PD-TOOLS-014: the near miss, as the live run's own reading counts it.
  const reading = nearMissReading([{ scenario: 'crlf', calls }]);
  verdicts.push({ verdict: 'note', what: `crlf: haet_edit near misses ${reading.misses.length} (levels ${reading.misses.map((m) => m.level).join(', ') || 'none'}), retried ${reading.retried.length}, probed ${reading.probed.length} (target 0), ambiguous ${reading.ambiguous.length} (target 0) (PD-TOOLS-014)` });
  // PD-TOOLS-014 revision 3 with PD-TOOLS-019: a level-3 near miss whose LF old_string met the CRLF file names the line endings.
  const level3Lf = calls.filter((c) => (c.tool_name === 'haet_edit' || c.tool_name === 'haet') && c.status !== 'ok' && norm(pathOf(c)).startsWith(`${CRLF_DIR}/`) && /at match level 3 \(/.test(c.result) && !String(c.args?.old_string ?? '').includes('\r'));
  if (level3Lf.length > 0) verdicts.push({ verdict: 'check', passed: level3Lf.every((c) => c.result.includes('The line endings differ too: CRLF in the file and LF in old_string.')), what: 'crlf: each haet_edit near miss at match level 3 with an LF old_string names the line endings (PD-TOOLS-014 revision 3, PD-TOOLS-019)', detail: level3Lf.map((c) => `#${c.ordinal} ${c.result.slice(0, 240)}`).join(' | ') });
  const retries = calls.filter((c) => EDIT_TOOLS.has(c.tool_name) && c.tool_name !== 'write_file' && c.status === 'ok' && norm(pathOf(c)) === `${CRLF_DIR}/greet.js`);
  if (retries.length > 0) verdicts.push({ verdict: 'check', passed: retries.every((c) => c.result.includes(CRLF_EDIT) || !lfBreak(c.args?.new_string)), what: "crlf: a haet_edit that landed a multi-line new_string on greet.js says it wrote the file's CRLF endings (PD-TOOLS-017)", detail: retries.map((c) => `#${c.ordinal} ${c.result.split('\n')[0].slice(0, 160)}`).join(' | ') });
  // The render.js window edit: which level it reached, and where it put the block (PD-TOOLS-019, which ruled OQ-280).
  const window = calls.filter((c) => c.tool_name === 'write_file' && c.args?.operation === 'edit' && norm(pathOf(c)) === `${CRLF_DIR}/render.js`);
  const landed = window.find((c) => c.status === 'ok');
  const level = landed === undefined ? null : /Match level: (\d)/.exec(landed.result)?.[1] ?? '1';
  const render = files[`${CRLF_DIR}/render.js`] ?? '';
  // The block's opening line, read whole: its indentation against the fixture's (a substring test read one tab too deep as
  // the file's depth, since `\t\t\tif` contains `\t\tif`).
  const opening = render.split(/\r?\n/).find((l) => l.trimStart().startsWith('if (item.visible) {'));
  const leading = (line) => /^[ \t]*/.exec(line ?? '')?.[0] ?? '';
  const fileIndent = leading(RENDER_LINES.find((l) => l.trimStart().startsWith('if (item.visible) {')));
  const depth = opening === undefined ? 'neither' : leading(opening) === fileIndent ? 'the file\'s depth' : leading(opening) === fileIndent.slice(1) ? 'one tab shallow, as given' : 'neither';
  const said = `crlf: the render.js window edit ${landed === undefined ? `did not land (${window.length} attempt(s))` : `landed at match level ${level}, its block at ${depth}`}`;
  if (level === '4' && indentOnlyOff(landed.args?.old_string, RENDER_LINES)) {
    verdicts.push({ verdict: 'check', passed: false, what: 'crlf: a render.js window edit whose old_string was a uniform indent off matches at level 3, never level 4 (PD-TOOLS-019)', detail: `${said}: ${landed.result.split('\n')[0].slice(0, 200)}` });
  } else if (level === '3') {
    verdicts.push({ verdict: 'check', passed: depth === 'the file\'s depth', what: 'crlf: a level-3 render.js window edit lands its block at the file\'s depth (PD-TOOLS-019, PD-TOOLS-015)', detail: `${said}: ${landed.result.split('\n')[0].slice(0, 200)}` });
    // The reply: PD-TOOLS-015's shift sentence, then PD-TOOLS-016's CRLF sentence where new_string had an LF break to carry.
    const shiftAt = landed.result.indexOf('new_string was shifted by');
    const crlfAt = landed.result.indexOf(CRLF_EDIT);
    const crlfOwed = lfBreak(landed.args?.new_string);
    verdicts.push({ verdict: 'check', passed: shiftAt >= 0 && (crlfOwed ? crlfAt > shiftAt : true), what: "crlf: a level-3 render.js window edit's reply says the shift, then (where owed) the file's CRLF endings (PD-TOOLS-015, PD-TOOLS-016)", detail: landed.result.split('\n')[0].slice(0, 300) });
  } else {
    verdicts.push({ verdict: 'note', what: said });
  }
  return verdicts;
}

function readCalls(dbPath, sessionId) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare('SELECT ordinal, tool_name, agent_name, status, entry FROM tool_calls WHERE session_id = ? ORDER BY ordinal').all(sessionId).map((c) => {
      let e = {};
      try { e = JSON.parse(c.entry); } catch { /* a row that will not parse is still a call */ }
      return { ordinal: c.ordinal, tool_name: c.tool_name, agent_name: c.agent_name, status: c.status, args: e.args ?? {}, result: String(e.result ?? ''), isError: e.is_error === true };
    });
  } finally { db.close(); }
}

export async function runCrlfScenario(ctx) {
  rmSync(join(ctx.workspace, CRLF_DIR), { recursive: true, force: true });
  writeCrlfFixture(ctx.workspace, CRLF_FILES);
  try {
    const log = await ctx.launch('crlf', {
      ROTARIS_CAPTURE_PROMPT: CRLF_PROMPT,
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(ctx.RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
    }, ctx.RUN_WAIT_MS + 90_000);
    ctx.check(!/capture: wait for result timed out/.test(log), 'crlf: the run reached its result inside the wait');
    const read = ctx.readSession();
    if (!read) { ctx.check(false, 'crlf: the run left a session row', 'no session was recorded'); return; }
    const sessionId = read.session.session_id;
    const calls = readCalls(ctx.oneDatabase(), sessionId);
    const files = Object.fromEntries(Object.keys(CRLF_FILES).map((path) => { const file = join(ctx.workspace, path); return [path, existsSync(file) ? readFileSync(file, 'utf8') : null]; }));
    // The bytes the run left, kept in the pack: the endings are the measurement.
    cpSync(join(ctx.workspace, CRLF_DIR), join(ctx.scenarioDir('crlf'), 'files'), { recursive: true });
    for (const v of crlfVerdicts({ calls, files })) { if (v.verdict === 'note') ctx.noted(v.what, v.detail); else ctx.check(v.passed, v.what, v.detail ?? undefined); }
    ctx.check(read.session.execution_status === 'completed', 'crlf: the run completed', `${read.session.execution_status} (${read.session.stop_reason})`);
    const reading = nearMissReading([{ scenario: 'crlf', calls }]);
    ctx.results.scenarios.crlf = {
      status: read.session.execution_status,
      edits: calls.filter((c) => EDIT_TOOLS.has(c.tool_name)).map((c) => ({ ordinal: c.ordinal, tool: c.tool_name, operation: c.args?.operation ?? null, path: pathOf(c), status: c.status, level: /[Mm]atch level:? (\d)/.exec(c.result)?.[1] ?? null, crlfSentence: c.result.includes(CRLF_EDIT) || c.result.includes(CRLF_INSERT) })),
      nearMiss: { misses: reading.misses.length, retried: reading.retried.length, probed: reading.probed.length, ambiguous: reading.ambiguous.length },
      endings: Object.fromEntries(Object.entries(files).map(([path, text]) => [path, text === null ? null : lineEndings(text)])),
    };
    ctx.preserveRun('crlf', sessionId);
  } finally {
    rmSync(join(ctx.workspace, CRLF_DIR), { recursive: true, force: true });
  }
  await ctx.budgetGate();
}
