/**
 * The live run's `crlf` scenario readings (fin42, N52): which edit shapes a real model chose on the generated CRLF fixture, and
 * whether the bytes the edits left kept every `\r` (PD-TOOLS-014 to PD-TOOLS-018). The shapes below are the ones `edits-proof`
 * reads from the built app, and the ones a broken carry would leave.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the scripts that run it.
import { CRLF_DIR, CRLF_FILES, CRLF_PROMPT, crlfVerdicts } from './crlf-scenario.mjs';
// @ts-expect-error — the fixture is plain ESM beside the scripts that run it.
import { GREET_LINES, LIST_LINES, RENDER_LINES, crlf, lineEndings } from './crlf-fixture.mjs';

type Verdict = { verdict: 'check' | 'note'; passed?: boolean; what: string; detail?: string };
type Call = { ordinal: number; tool_name: string; agent_name: string; status: string; args: Record<string, unknown>; result: string; isError: boolean };
const G = `${CRLF_DIR}/greet.js`;
const R = `${CRLF_DIR}/render.js`;
const L = `${CRLF_DIR}/list.txt`;
let n = 0;
const call = (tool_name: string, args: Record<string, unknown>, result: string, status = 'ok'): Call => ({ ordinal: (n += 1), tool_name, agent_name: 'orchestrator', status, args, result, isError: status !== 'ok' });
const CRLF_EDIT = " new_string was written with the file's CRLF line endings.";
const NEAR = `old_string was not found exactly in ${G}. It matches lines 2-3 at match level 2 (trailing whitespace). …`;
const failed = (vs: Verdict[]) => vs.filter((v) => v.verdict === 'check' && !v.passed).map((v) => v.what);
const notes = (vs: Verdict[]) => vs.filter((v) => v.verdict === 'note').map((v) => v.what);

/** The run a model that took every shape asked for leaves. */
function wholeRun(): { calls: Call[]; files: Record<string, string | null> } {
  n = 0;
  const calls = [
    call('haet_read', { path: G }, 'content_hash: …'),
    call('haet_edit', { path: G, old_string: "\tconst greeting = 'Hello';\n\tif (name) {", new_string: "\tconst greeting = 'Hi';\n\tif (name) {" }, NEAR, 'failed'),
    call('haet_edit', { path: G, old_string: "\tconst greeting = 'Hello';\r\n\tif (name) {\r", new_string: "\tconst greeting = 'Hi';\n\tif (name) {" }, `Edited ${G}: 2 lines replaced by 2 at line 2 (+1 -1).${CRLF_EDIT} content_hash: …`),
    call('read_file', { path: R }, '…'),
    call('write_file', { operation: 'edit', path: R, old_string: '\t\tif (item.visible) {\n…', new_string: '…' }, `Edited ${R}: 3 lines replaced by 3 at line 4 (+1 -1). Match level: 2.${CRLF_EDIT}`),
    call('read_file', { path: G }, '…'),
    call('write_file', { operation: 'insert', path: G, insert_line: 0, content: '// edited by the live run' }, `Inserted 1 line into ${G} at line 0. content was written with the file's CRLF line endings.`),
    call('read_file', { path: L }, '…'),
    call('write_file', { operation: 'edit', path: L, old_string: 'alpha', new_string: 'alpha-1\nalpha-2', replace_all: true }, `Replaced 2 occurrences in ${L}.${CRLF_EDIT}`),
  ];
  const files = {
    [G]: crlf(['// edited by the live run', ...GREET_LINES.map((l: string) => l.replace("'Hello'", "'Hi'"))]),
    [R]: crlf(RENDER_LINES.map((l: string) => l.replace('<li>', '<li class="shown">'))),
    [L]: crlf(['alpha-1', 'alpha-2', 'beta', 'alpha-1', 'alpha-2']),
  };
  return { calls, files };
}

describe('the crlf scenario (PD-TOOLS-014 to PD-TOOLS-018 live)', () => {
  it('generates three CRLF files and names each tool and shape in its prompt', () => {
    expect(Object.keys(CRLF_FILES)).toEqual([G, R, L]);
    for (const lines of Object.values(CRLF_FILES) as string[][]) expect(lineEndings(crlf(lines))).toMatchObject({ lfOnly: 0, final: true });
    for (const word of ['haet_edit', 'write_file edit', 'operation insert', 'replace_all true', 'Do not use the terminal']) expect(CRLF_PROMPT).toContain(word);
    expect(LIST_LINES).toEqual(['alpha', 'beta', 'alpha']);
    expect(lineEndings('a\r\nb\nc')).toEqual({ crlf: 1, lfOnly: 1, lfOnlyLines: [2], final: false });
  });

  it('passes a run whose every edit kept the endings, and notes the near miss and the window level', () => {
    const vs: Verdict[] = crlfVerdicts(wholeRun());
    expect(failed(vs)).toEqual([]);
    expect(vs.filter((v) => v.verdict === 'check')).toHaveLength(6);
    expect(notes(vs)).toEqual([
      'crlf: haet_edit near misses 1 (levels 2), retried 1, probed 0 (target 0), ambiguous 0 (target 0) (PD-TOOLS-014)',
      "crlf: the render.js window edit landed at match level 2, its block at the file's depth",
    ]);
  });

  it('fails an LF line an insert left in a file only edits touched, and an insert that did not say so', () => {
    const run = wholeRun();
    run.files[G] = `// edited by the live run\n${crlf(GREET_LINES)}`;
    run.calls[6] = { ...run.calls[6]!, result: `Inserted 1 line into ${G} at line 0.` };
    expect(failed(crlfVerdicts(run))).toEqual([
      `crlf: every line of ${G} keeps its CRLF ending after 2 edit(s) (PD-TOOLS-016, PD-TOOLS-017, PD-TOOLS-018)`,
      "crlf: each insert into a CRLF file says it wrote the file's CRLF endings (PD-TOOLS-018)",
    ]);
  });

  it('asks for the CRLF sentence only where the edit had to add a carriage return (PD-TOOLS-017 clause 4, PD-TOOLS-018 clause 3)', () => {
    // A model that copied the near-miss quote's `\r`s into its `new_string`, and wrote CRLF itself elsewhere: the tool added no
    // `\r`, so it rightly says nothing, and the bytes are still CRLF throughout.
    const run = wholeRun();
    run.calls[2] = { ...run.calls[2]!, args: { ...run.calls[2]!.args, new_string: "\tconst greeting = 'Hi';\r\n\tif (name) {\r" }, result: `Edited ${G}: 2 lines replaced by 2 at line 2 (+1 -1). content_hash: …` };
    run.calls[6] = { ...run.calls[6]!, args: { ...run.calls[6]!.args, content: '// edited by the live run\r\n' }, result: `Inserted 1 line into ${G} at line 0.` };
    run.calls[8] = { ...run.calls[8]!, args: { ...run.calls[8]!.args, new_string: 'alpha-1\r\nalpha-2' }, result: `Replaced 2 occurrences in ${L}.` };
    expect(failed(crlfVerdicts(run))).toEqual([]);
    // One LF break left for the tool to carry is enough to owe the sentence.
    run.calls[8] = { ...run.calls[8]!, args: { ...run.calls[8]!.args, new_string: 'alpha-1\r\nalpha-2\nalpha-3' } };
    expect(failed(crlfVerdicts(run))).toEqual(["crlf: each multi-line replace_all says it wrote the file's CRLF endings (PD-TOOLS-017)"]);
  });

  it('notes, rather than fails, a file the model overwrote, and a shape it never sent', () => {
    const run = wholeRun();
    run.calls.push(call('write_file', { operation: 'overwrite', path: L, content: 'x\n' }, `Overwrote ${L}.`));
    run.files[L] = 'x\n';
    run.calls = run.calls.filter((c) => c.args.operation !== 'insert');
    const vs: Verdict[] = crlfVerdicts(run);
    expect(failed(vs)).toEqual([]);
    expect(notes(vs)).toContain(`crlf: ${L} was also written by overwrite, create or the terminal, so its endings are not the edits' alone`);
    expect(notes(vs)).toContain('crlf: no write_file insert landed (PD-TOOLS-018 not reached)');
  });

  it('PD-TOOLS-019: a level-4 landing whose old_string was a uniform indent off fails, and so does the same with the old_string\'s \\r', () => {
    const run = wholeRun();
    run.calls[4] = { ...run.calls[4]!, args: { operation: 'edit', path: R, old_string: '\tif (item.visible) {\n\t\tout.push(`<li>${item.label}</li>`);\n\t}', new_string: '…' }, result: `Edited ${R}: 3 lines replaced by 3 at line 4 (+3 -3). Match level: 4 (similarity: 0.91). Verify the result.${CRLF_EDIT}` };
    run.files[R] = crlf([...RENDER_LINES.slice(0, 3), '\tif (item.visible) {', '\t\tout.push(`<li class="shown">${item.label}</li>`);', '\t}', ...RENDER_LINES.slice(6)]);
    expect(failed(crlfVerdicts(run))).toContain('crlf: a render.js window edit whose old_string was a uniform indent off matches at level 3, never level 4 (PD-TOOLS-019)');
    run.calls[4] = { ...run.calls[4]!, args: { ...run.calls[4]!.args, old_string: '\tif (item.visible) {\r\n\t\tout.push(`<li>${item.label}</li>`);\r\n\t}\r' } };
    expect(failed(crlfVerdicts(run))).toContain('crlf: a render.js window edit whose old_string was a uniform indent off matches at level 3, never level 4 (PD-TOOLS-019)');
  });

  it('any other level-4 landing stays a note; a level-3 one is checked at the file\'s depth', () => {
    const run = wholeRun();
    run.calls[4] = { ...run.calls[4]!, args: { operation: 'edit', path: R, old_string: '\t\tif (item.visible) {\n\t\t\tout.push(`<li>${item.lbl}</li>`);\n\t\t}', new_string: '…' }, result: `Edited ${R}: 3 lines replaced by 3 at line 4 (+1 -1). Match level: 4 (similarity: 0.97). Verify the result.${CRLF_EDIT}` };
    const typo = crlfVerdicts(run);
    expect(failed(typo)).toEqual([]);
    expect(notes(typo)).toContain("crlf: the render.js window edit landed at match level 4, its block at the file's depth");
    run.calls[4] = { ...run.calls[4]!, result: `Edited ${R}: 3 lines replaced by 3 at line 4 (+1 -1). Match level: 3. new_string was shifted by the same leading prefix "\\t" (1 character added) to the file's indentation.${CRLF_EDIT}` };
    const shifted = crlfVerdicts(run);
    expect(failed(shifted)).toEqual([]);
    expect(shifted.filter((v: Verdict) => v.verdict === 'check').map((v: Verdict) => v.what)).toContain("crlf: a level-3 render.js window edit lands its block at the file's depth (PD-TOOLS-019, PD-TOOLS-015)");
    run.files[R] = crlf([...RENDER_LINES.slice(0, 3), '\tif (item.visible) {', '\t\tout.push(`<li class="shown">${item.label}</li>`);', '\t}', ...RENDER_LINES.slice(6)]);
    expect(failed(crlfVerdicts(run))).toContain("crlf: a level-3 render.js window edit lands its block at the file's depth (PD-TOOLS-019, PD-TOOLS-015)");
  });

  it('a level-3 haet_edit near miss with an LF old_string must name the line endings (PD-TOOLS-014 revision 3)', () => {
    const run = wholeRun();
    const near3 = `old_string was not found exactly in ${G}. It matches lines 3-5 at match level 3 (indentation shift). Every line of the file carries the leading prefix "\\t" (1 character) in addition to old_string's indentation.`;
    run.calls[1] = { ...run.calls[1]!, result: `${near3} Your content_hash is still current and nothing was written.` };
    expect(failed(crlfVerdicts(run))).toContain('crlf: each haet_edit near miss at match level 3 with an LF old_string names the line endings (PD-TOOLS-014 revision 3, PD-TOOLS-019)');
    run.calls[1] = { ...run.calls[1]!, result: `${near3} The line endings differ too: CRLF in the file and LF in old_string. The quoted text carries the file's line endings. Your content_hash is still current and nothing was written.` };
    expect(failed(crlfVerdicts(run))).toEqual([]);
  });
});
