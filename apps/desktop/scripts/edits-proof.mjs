/**
 * The edits proof (fin42, N52): the edit directives `PD-TOOLS-014` to `PD-TOOLS-018` driven through the built application on a
 * CRLF, tab-indented fixture. Until this proof they were pinned by unit cases alone (`tools.test.ts`, `diff.test.ts`), every
 * live edit had met an LF file and matched at level 1, and no proof sent a `write_file` edit or insert, or a `haet_edit`,
 * through the run host. The fixture is generated here (`lib/crlf-fixture.mjs`): a committed CRLF file would be normalised by
 * `.gitattributes` and refused by `tools/check-line-endings.mjs`.
 *
 * One launch, the scripted coordinator granted the direct-work bundle (`explicit_trivial`, `delegation_strategy: single`), its
 * calls taken from `ROTARIS_SCRIPT_TOOL_ARGS` through the scripted step `tool:<key>` (`@content_hash` sends the hash the newest
 * tool result carried). The steps, in order, each on its own generated file:
 *
 *   exact         write_file edit, level 1, a one-line anchor replaced by two LF lines        PD-TOOLS-017 clauses 2 and 4
 *   insert        write_file insert of two LF lines at line 0 of the same file                 PD-TOOLS-018
 *   replace-all   write_file edit, `replace_all`, a word replaced by two LF lines twice        PD-TOOLS-017
 *   window        write_file edit, a two-line LF `old_string` matching at level 2 only         PD-TOOLS-016 clauses 1 to 3
 *   noop-window   the same window again, `new_string` already what the file holds              PD-TOOLS-016 clause 4 (revision 3)
 *   noop-endings  an exact `old_string` with CRLF, `new_string` the same with LF               PD-TOOLS-017 clause 3
 *   shift         write_file edit, a level-3 window one tab shallow, `new_string` at old's depth PD-TOOLS-015 clause 2 with 016
 *   near          haet_edit with a two-line LF `old_string` on a CRLF file: level 2           PD-TOOLS-014, nothing written
 *   retry         haet_edit with the quote the near miss gave, the same hash                    PD-TOOLS-014 clause 5 with 017
 *   shift-lf      write_file edit, a one-tab-shallow LF `old_string` on a CRLF loop: level 3      PD-TOOLS-019 with 015 and 016
 *   near-lf       haet_edit with the same LF `old_string` on a copy of the loop: level 3          PD-TOOLS-019 with 014 revision 3
 *   retry-lf      haet_edit with that near miss's quote, the same hash                           PD-TOOLS-014 clause 5 with 017
 *   blank-lf      write_file edit, an LF block one tab shallow with an empty interior line: level 3   PD-TOOLS-020 with 015 and 016
 *
 * Asserted from the bytes on disk (every line of every file still CRLF, each file's exact bytes), from each call's stored
 * result (the directive's sentence, the match level, a refusal's words) and from `lib/near-miss-edits.mjs`'s reading, the one
 * the live run counts near misses with. `shift-lf` is the shape a model sends on Windows. Until `PD-TOOLS-019` (OQ-280, ruled
 * 2026-10-13) level 3 compared a window's lines exactly once the prefix was moved, so a file line's `\r` kept an LF `old_string`
 * from level 3 and the edit fell to level 4, outside `PD-TOOLS-015`: on fin42's runs it applied at "Match level: 4 (similarity
 * 0.91)" and wrote the block one tab too shallow beside a success, recorded here as observed
 * (`docs/defects/fixed/on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3.md`). Level 3 now sets a line's
 * trailing `\r` aside, and `shift-lf`, `near-lf` and `retry-lf` are asserted: level 3, the shift sentence then the CRLF sentence,
 * the exact bytes; the near miss naming the line endings; its quote applying. Until `PD-TOOLS-020` (OQ-295, ruled 2026-10-13) a
 * blank line took part in level 3's shift, so `blank-lf`'s block, which holds one, matched nothing on the CRLF file; it is
 * asserted at level 3 with the shift sentence, the CRLF sentence and the exact bytes, the blank line kept as the file's own.
 *
 * Evidence under `.proof/edits-proof/`: the launch's log and picture, `results.json`, and the files as the run left them.
 * `--skip-build` skips the build.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { cleanEnvironment, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { BLANK_LINES, CHECK_LINES, GREET_LINES, LIST_LINES, RENDER_LINES, crlf, lineEndings, writeCrlfFixture } from './lib/crlf-fixture.mjs';
import { nearMissReading } from './lib/near-miss-edits.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'edits-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
mkdirSync(local, { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# Edits proof workspace\n');
// The workspace is a repository of its own, so the skill catalog's project walk stops here (REQ-WORKSPACE-051).
spawnSync('git', ['init', '-q'], { cwd: workspace, encoding: 'utf8', timeout: 30_000 });
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
  '# scratch configuration written by the edits proof',
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'runtime:', '  permission_mode: autonomous', '  allow_unsandboxed_autonomous: true',
  'mcp_servers:', '  code_intelligence: { enabled: false }',
  'rotaris:', '  delegation_strategy: single', '',
].join('\n'));

const FILES = {
  'crlf/exact.js': GREET_LINES, 'crlf/list.txt': LIST_LINES, 'crlf/window.js': GREET_LINES,
  'crlf/shift.js': CHECK_LINES, 'crlf/haet.js': GREET_LINES, 'crlf/render.js': RENDER_LINES, 'crlf/render-haet.js': RENDER_LINES,
  'crlf/blank.js': BLANK_LINES,
};
writeCrlfFixture(workspace, FILES);
for (const [path, lines] of Object.entries(FILES)) if (readFileSync(join(workspace, path), 'utf8') !== crlf(lines)) throw new Error(`the fixture ${path} was not written as CRLF`);

/** The quote PD-TOOLS-014 clause 5 gives for `near`: the file's lines 2-3 joined by `\n`, each keeping its `\r`. */
const QUOTE = "\tconst greeting = 'Hello';\r\n\tif (name) {\r";
/** `render.js`'s lines 4-6 one tab shallow, LF, as a model writes them; and the same with one attribute added. */
const SHALLOW_OLD = ['\tif (item.visible) {', '\t\tout.push(`<li>${item.label}</li>`);', '\t}'].join('\n');
const SHALLOW_NEW = ['\tif (item.visible) {', '\t\tout.push(`<li class="shown">${item.label}</li>`);', '\t}'].join('\n');
/** The quote PD-TOOLS-014 gives for `near-lf`: `render-haet.js`'s lines 4-6 joined by `\n`, each keeping its `\r`. */
const QUOTE_LF = RENDER_LINES.slice(3, 6).map((l) => `${l}\r`).join('\n');
/** The same edit at the file's depth, LF, as a model retrying with the quote writes it. */
const DEEP_NEW = ['\t\tif (item.visible) {', '\t\t\tout.push(`<li class="shown">${item.label}</li>`);', '\t\t}'].join('\n');
/** `render.js` after the edit: the push line at the file's depth with the attribute. */
const RENDER_SHOWN = RENDER_LINES.map((l) => l.replace('out.push(`<li>', 'out.push(`<li class="shown">'));
/** `blank.js`'s loop body one tab shallow, LF, its blank interior line empty (PD-TOOLS-020); and the same with the price doubled. */
const BLANK_OLD = ['\tconst price = item.price;', '', '\tsum += price;'].join('\n');
const BLANK_NEW = ['\tconst price = item.price * 2;', '', '\tsum += price;'].join('\n');
const write = (key, args) => [key, { name: 'write_file', args }];
const read = (key, path) => [key, { name: 'read_file', args: { path } }];
const STEPS = [
  read('read-exact', 'crlf/exact.js'),
  write('exact', { operation: 'edit', path: 'crlf/exact.js', old_string: '\treturn greeting;', new_string: '\tconst out = greeting;\n\treturn out;' }),
  write('insert', { operation: 'insert', path: 'crlf/exact.js', insert_line: 0, content: "// generated\n'use strict';" }),
  read('read-list', 'crlf/list.txt'),
  write('replace-all', { operation: 'edit', path: 'crlf/list.txt', old_string: 'alpha', new_string: 'one\ntwo', replace_all: true }),
  read('read-window', 'crlf/window.js'),
  write('window', { operation: 'edit', path: 'crlf/window.js', old_string: "\tconst greeting = 'Hello';\n\tif (name) {", new_string: "\tconst greeting = 'Hi';\n\tif (name) {" }),
  write('noop-window', { operation: 'edit', path: 'crlf/window.js', old_string: "\tconst greeting = 'Hi';  \n\tif (name) {", new_string: "\tconst greeting = 'Hi';\n\tif (name) {" }),
  write('noop-endings', { operation: 'edit', path: 'crlf/window.js', old_string: '\treturn greeting;\r\n}', new_string: '\treturn greeting;\n}' }),
  read('read-shift', 'crlf/shift.js'),
  write('shift', { operation: 'edit', path: 'crlf/shift.js', old_string: 'if (name) {\r\n\treturn name;\r\n}\r', new_string: 'if (name) {\n\treturn name.trim();\n}' }),
  ['haet-read', { name: 'haet_read', args: { path: 'crlf/haet.js' } }],
  ['near', { name: 'haet_edit', args: { path: 'crlf/haet.js', content_hash: '@content_hash', old_string: "\tconst greeting = 'Hello';\n\tif (name) {", new_string: "\tconst greeting = 'Hey';\n\tif (name) {" } }],
  ['retry', { name: 'haet_edit', args: { path: 'crlf/haet.js', content_hash: '@content_hash', old_string: QUOTE, new_string: "\tconst greeting = 'Hey';\n\tif (name) {" } }],
  read('read-render', 'crlf/render.js'),
  write('shift-lf', { operation: 'edit', path: 'crlf/render.js', old_string: SHALLOW_OLD, new_string: SHALLOW_NEW }),
  ['haet-read-render', { name: 'haet_read', args: { path: 'crlf/render-haet.js' } }],
  ['near-lf', { name: 'haet_edit', args: { path: 'crlf/render-haet.js', content_hash: '@content_hash', old_string: SHALLOW_OLD, new_string: SHALLOW_NEW } }],
  ['retry-lf', { name: 'haet_edit', args: { path: 'crlf/render-haet.js', content_hash: '@content_hash', old_string: QUOTE_LF, new_string: DEEP_NEW } }],
  read('read-blank', 'crlf/blank.js'),
  write('blank-lf', { operation: 'edit', path: 'crlf/blank.js', old_string: BLANK_OLD, new_string: BLANK_NEW }),
];
const toolArgs = Object.fromEntries(STEPS);

const started = Date.now();
const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
  cwd: app, timeoutMs: 180_000, windowsHide: true,
  env: {
    ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
    ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_INTENT_SCRIPT: 'explicit_trivial', ROTARIS_CIRCUIT_BREAKER: 'off', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROTARIS_SCRIPT: [...STEPS.map(([key]) => `tool:${key}`), 'answer'].join(','), ROTARIS_SCRIPT_TOOL_ARGS: JSON.stringify(toolArgs),
    ROTARIS_CAPTURE_PROMPT: 'Edit the CRLF files.', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '1500',
    ROTARIS_CAPTURE_PNG: join(output, 'edits.png'),
  },
});
const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
writeFileSync(join(output, 'edits.log'), log);
if (result.overran) throw new Error(overrunMessage('edits', result, log));
if (result.status !== 0) throw new Error(`edits exited ${result.status ?? result.signal ?? 'unknown'}; see edits.log`);
cpSync(join(workspace, 'crlf'), join(output, 'files'), { recursive: true });

const db = new Database(oneDatabase(local), { readonly: true });
const session = db.prepare('SELECT session_id, execution_status, stop_reason FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
const calls = db.prepare('SELECT ordinal, tool_name, agent_name, status, entry FROM tool_calls WHERE session_id = ? ORDER BY ordinal').all(session.session_id).map((c) => {
  const entry = JSON.parse(c.entry);
  return { ordinal: c.ordinal, tool_name: c.tool_name, agent_name: c.agent_name, status: c.status, args: entry.args ?? {}, result: String(entry.result ?? ''), isError: entry.is_error === true };
});
db.close();

const failures = [];
const results = { session: session.session_id, status: session.execution_status, launchMs: Date.now() - started, steps: {}, files: {} };
const check = (ok, what, detail) => { if (!ok) failures.push(`${what}${detail === undefined ? '' : `: ${detail}`}`); };
check(session.execution_status === 'completed', 'the run completed', `${session.execution_status} (${session.stop_reason})`);
check(calls.length === STEPS.length, `the run made the ${STEPS.length} calls the script names`, calls.map((c) => `${c.tool_name}:${c.status}`).join(', '));
const byKey = Object.fromEntries(STEPS.map(([key], i) => [key, calls[i]]));
for (const [key] of STEPS) {
  const c = byKey[key];
  results.steps[key] = c === undefined ? null : { tool: c.tool_name, status: c.status, result: c.result.split('\n').slice(0, 3).join(' | ').slice(0, 400) };
}
const text = (key) => byKey[key]?.result ?? '';
const CRLF_EDIT = "new_string was written with the file's CRLF line endings.";
const ok = (key) => byKey[key]?.status === 'ok' && byKey[key]?.isError !== true;
const refused = (key) => byKey[key]?.status === 'failed' && byKey[key]?.isError === true;

// PD-TOOLS-017: the exact edit's two LF lines landed CRLF, and the success says so; no match level is named (level 1).
check(ok('exact') && text('exact').includes(CRLF_EDIT) && !/Match level/.test(text('exact')), 'exact: a level-1 edit keeps the CRLF endings and says so (PD-TOOLS-017 clauses 2 and 4)', text('exact'));
// PD-TOOLS-018: the insert's two LF lines landed CRLF, and the success says so.
check(ok('insert') && /^Inserted 2 lines into crlf\/exact\.js at line \d+\./.test(text('insert')) && text('insert').includes("content was written with the file's CRLF line endings."), 'insert: an insert keeps the CRLF endings and says so (PD-TOOLS-018)', text('insert'));
check(readFileSync(join(workspace, 'crlf/exact.js'), 'utf8') === crlf(["// generated", "'use strict';", ...GREET_LINES.slice(0, 5), '\tconst out = greeting;', '\treturn out;', '}']), 'exact.js holds the edit and the insert, every line CRLF', JSON.stringify(readFileSync(join(workspace, 'crlf/exact.js'), 'utf8')));
// PD-TOOLS-017 with replace_all.
check(ok('replace-all') && text('replace-all').includes(CRLF_EDIT), 'replace-all: every occurrence keeps the CRLF endings and says so (PD-TOOLS-017)', text('replace-all'));
check(readFileSync(join(workspace, 'crlf/list.txt'), 'utf8') === crlf(['one', 'two', 'beta', 'one', 'two']), 'list.txt holds both replacements, every line CRLF', JSON.stringify(readFileSync(join(workspace, 'crlf/list.txt'), 'utf8')));
// PD-TOOLS-016 clauses 1 to 3: the LF window matched at level 2 and was written with the file's endings.
check(ok('window') && /Match level: 2\./.test(text('window')) && text('window').includes(CRLF_EDIT), 'window: a level-2 window edit keeps the CRLF endings and says so after "Match level: 2." (PD-TOOLS-016)', text('window'));
// PD-TOOLS-016 clause 4 (revision 3): the same window, already holding new_string as the edit would write it, refused.
check(refused('noop-window') && text('noop-window') === "old_string matches crlf/window.js only at match level 2 (lines 2-3), and those lines already hold new_string as this edit would write it; nothing to change. Use write_file's 'overwrite' to write a file exactly as given.", 'noop-window: a window edit that would change nothing is refused in clause 4\'s words (PD-TOOLS-016 revision 3)', text('noop-window'));
// PD-TOOLS-017 clause 3: an exact edit that differs only in line endings, refused.
check(refused('noop-endings') && text('noop-endings') === "old_string and new_string differ only in line endings, which an edit keeps as the file's; nothing to change. Use write_file's 'overwrite' to change a file's line endings.", 'noop-endings: an edit differing only in line endings is refused in clause 3\'s words (PD-TOOLS-017)', text('noop-endings'));
const greetHi = GREET_LINES.map((l) => l.replace("'Hello'", "'Hi'"));
check(readFileSync(join(workspace, 'crlf/window.js'), 'utf8') === crlf(greetHi), 'window.js holds the window edit alone, every line CRLF', JSON.stringify(readFileSync(join(workspace, 'crlf/window.js'), 'utf8')));
// PD-TOOLS-015 clause 2 with PD-TOOLS-016: the one-tab-shallow window took the shift and the file's endings.
check(ok('shift') && text('shift').includes('Match level: 3. new_string was shifted by the same leading prefix "\\t" (1 character added) to the file\'s indentation.') && text('shift').includes(CRLF_EDIT), 'shift: a level-3 edit takes the window\'s shift and the CRLF endings (PD-TOOLS-015 clause 2, PD-TOOLS-016 clause 3)', text('shift'));
check(readFileSync(join(workspace, 'crlf/shift.js'), 'utf8') === crlf(CHECK_LINES.map((l) => l.replace('return name;', 'return name.trim();'))), 'shift.js holds the shifted edit at the file\'s depth, every line CRLF', JSON.stringify(readFileSync(join(workspace, 'crlf/shift.js'), 'utf8')));
// PD-TOOLS-014: the LF two-line old_string met the CRLF file at level 2; the reply names the level and lines, says the hash is
// current and nothing was written, and quotes the window with its `\r`s; the retry with the quote applied, CRLF kept.
const near = text('near');
check(refused('near') && near.startsWith('old_string was not found exactly in crlf/haet.js.') && /match level 2/.test(near) && /lines 2-3|lines 2–3/.test(near) && near.includes(JSON.stringify(QUOTE)), 'near: a haet_edit near miss names match level 2 and lines 2-3 and quotes the window with its carriage returns (PD-TOOLS-014)', near);
check(near.indexOf(JSON.stringify(QUOTE)) > near.indexOf('match level 2'), 'near: the facts come before the quote (PD-TOOLS-014)', near);
check(ok('retry') && text('retry').includes(`${CRLF_EDIT} content_hash: `), 'retry: the quote sent back with the same hash applied, the CRLF sentence before content_hash (PD-TOOLS-014 clause 5, PD-TOOLS-017 clause 4)', text('retry'));
check(readFileSync(join(workspace, 'crlf/haet.js'), 'utf8') === crlf(GREET_LINES.map((l) => l.replace("'Hello'", "'Hey'"))), 'haet.js holds the retried edit alone, every line CRLF', JSON.stringify(readFileSync(join(workspace, 'crlf/haet.js'), 'utf8')));
// PD-TOOLS-019 with PD-TOOLS-015 clause 2 and PD-TOOLS-016: the LF old_string one tab shallow on the CRLF loop matched at
// level 3, took the shift, then the file's endings, the block landing at the file's depth. Until the ruling it landed at level 4,
// one tab too shallow beside a success.
const SHIFTED = 'Match level: 3. new_string was shifted by the same leading prefix "\\t" (1 character added) to the file\'s indentation.';
check(ok('shift-lf') && text('shift-lf').includes(`${SHIFTED} ${CRLF_EDIT}`), 'shift-lf: an LF old_string one tab shallow on a CRLF file matches at level 3, the shift sentence then the CRLF sentence (PD-TOOLS-019, PD-TOOLS-015 clause 2, PD-TOOLS-016 clause 3)', text('shift-lf'));
check(readFileSync(join(workspace, 'crlf/render.js'), 'utf8') === crlf(RENDER_SHOWN), 'render.js holds the shifted block at the file\'s depth, every line CRLF (PD-TOOLS-019)', JSON.stringify(readFileSync(join(workspace, 'crlf/render.js'), 'utf8')));
// PD-TOOLS-019 with PD-TOOLS-014 revision 3: the same LF old_string through haet_edit is the level-3 near miss naming the line
// endings, its quote carrying the file's `\r`s; the quote sent back with the same hash applied, the file still CRLF.
const nearLf = text('near-lf');
check(refused('near-lf') && nearLf.startsWith('old_string was not found exactly in crlf/render-haet.js.') && nearLf.includes('It matches lines 4-6 at match level 3 (indentation shift).') && nearLf.includes("The line endings differ too: CRLF in the file and LF in old_string. The quoted text carries the file's line endings.") && nearLf.includes(JSON.stringify(QUOTE_LF)), 'near-lf: a haet_edit near miss at match level 3 names the line endings and quotes the window with its carriage returns (PD-TOOLS-019, PD-TOOLS-014 revision 3)', nearLf);
check(ok('retry-lf') && !/Match level/.test(text('retry-lf')) && text('retry-lf').includes(`${CRLF_EDIT} content_hash: `), 'retry-lf: the quote sent back with the same hash applied at level 1, the CRLF sentence before content_hash (PD-TOOLS-014 clause 5, PD-TOOLS-017)', text('retry-lf'));
check(readFileSync(join(workspace, 'crlf/render-haet.js'), 'utf8') === crlf(RENDER_SHOWN), 'render-haet.js holds the retried edit at the file\'s depth, every line CRLF', JSON.stringify(readFileSync(join(workspace, 'crlf/render-haet.js'), 'utf8')));
// PD-TOOLS-020 with PD-TOOLS-015 clause 2 and PD-TOOLS-016: the LF block one tab shallow with an empty interior line matched the
// CRLF loop at level 3, took the shift, then the file's endings; the blank line is the file's own (`\r` and nothing else). Until
// the ruling the blank line took part in the shift and the block matched nothing on the CRLF file.
check(ok('blank-lf') && text('blank-lf').includes(`${SHIFTED} ${CRLF_EDIT}`), 'blank-lf: an LF block with a blank interior line, one tab shallow on a CRLF file, matches at level 3, the shift sentence then the CRLF sentence (PD-TOOLS-020, PD-TOOLS-015 clause 2, PD-TOOLS-016 clause 3)', text('blank-lf'));
check(readFileSync(join(workspace, 'crlf/blank.js'), 'utf8') === crlf(BLANK_LINES.map((l) => l.replace('item.price;', 'item.price * 2;'))), 'blank.js holds the shifted block at the file\'s depth, its blank line kept, every line CRLF (PD-TOOLS-020)', JSON.stringify(readFileSync(join(workspace, 'crlf/blank.js'), 'utf8')));
// The live run's own reading of a near miss: two misses, at levels 2 and 3, each retried on the same path and not probed.
const reading = nearMissReading([{ scenario: 'edits', calls }]);
check(reading.misses.length === 2 && reading.misses.map((m) => m.level).join(',') === '2,3' && reading.retried.length === 2 && reading.probed.length === 0 && reading.ambiguous.length === 0, 'the near-miss reading counts a level-2 and a level-3 miss, each retried on the same path, with no probe', JSON.stringify(reading));
results.nearMiss = { misses: reading.misses.length, retried: reading.retried.length, probed: reading.probed.length, ambiguous: reading.ambiguous.length };
// Every file the asserted steps touched is still CRLF throughout.
for (const path of ['crlf/exact.js', 'crlf/list.txt', 'crlf/window.js', 'crlf/shift.js', 'crlf/haet.js', 'crlf/render.js', 'crlf/render-haet.js', 'crlf/blank.js']) {
  const endings = lineEndings(readFileSync(join(workspace, path), 'utf8'));
  results.files[path] = endings;
  check(endings.lfOnly === 0, `${path}: no line lost its carriage return`, `LF-only lines ${endings.lfOnlyLines.join(', ')}`);
}
// What `shift-lf` did, recorded beside the assertions above (until PD-TOOLS-019 it was recorded alone, as observed).
const render = readFileSync(join(workspace, 'crlf/render.js'), 'utf8');
results.observed = {
  shiftLf: {
    status: byKey['shift-lf']?.status ?? null, matchLevel: /Match level: (\d)/.exec(text('shift-lf'))?.[1] ?? null, result: text('shift-lf').split('\n')[0]?.slice(0, 300) ?? '',
    endings: lineEndings(render),
    // Where the edited block landed: at the file's depth (two tabs before `if`), or as given (one tab).
    atFileDepth: render.includes('\t\tif (item.visible) {\r\n\t\t\tout.push(`<li class="shown">'), asGiven: render.includes('\r\n\tif (item.visible) {\r\n\t\tout.push(`<li class="shown">'),
  },
};
console.log(`[edits-proof] shift-lf: ${JSON.stringify(results.observed.shiftLf)}`);

results.failures = failures;
writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
if (failures.length > 0) {
  console.error(`edits-proof: ${failures.length} failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
