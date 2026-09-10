import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type * as TS from 'typescript';
import { nodeClocks } from '@rotaris/platform';
import { CONSUMER_MODULE_SOURCE, CONSUMER_MODULE_SPECIFIER, metaTests, regenerateBeforeCollection } from './consumer.js';
import { createTraceabilityEngine, fsArtifactIo } from './engine.js';
import { createInThreadExecutor } from './executor.js';

/**
 * Part AJ2 — the consumer integration contracts as far as the product reaches them: REQ-TRACE-176 (the declarations
 * module usable on import, parsing nothing), REQ-TRACE-181 (1) and REQ-TRACE-500 (a deleted requirement's reference
 * is a compile error, a deprecated one warns at the spot), REQ-TRACE-182 (regeneration before collection never
 * blocks it) and REQ-TRACE-183 (the three meta-test assertions). The consumer is compiled with the TypeScript
 * compiler API against a temporary repository this test writes — the artifact the engine regenerates, the
 * declarations module's source text, and a consumer of both. The annotation names are built by concatenation so a
 * sweep of THIS repository credits nothing here (REQ-TRACE-079).
 */
const ts = createRequire(import.meta.url)('typescript') as typeof TS;
const T = 'tra' + 'ces';
const C = 'cov' + 'ers';
const clocks = nodeClocks();
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-consumer-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const put = (rel: string, text: string): void => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
const doc = (id: string, status: string) => `---\nreq-id: ${id}\nstatus: ${status}\ntitle: Title ${id}\n---\n# ${id}\n\nprose\n`;
const engine = () => createTraceabilityEngine({ executor: createInThreadExecutor(clocks), io: fsArtifactIo(clocks.timers), clocks });
const signal = () => new AbortController().signal;

/** A project that traces REQ-1 from its source, covers it from a test, and still references the deprecated REQ-2. */
function seed(): void {
  put('docs/requirements/REQ-1.md', doc('REQ-1', 'approved'));
  put('docs/requirements/REQ-2.md', doc('REQ-2', 'deprecated'));
  put(`${CONSUMER_MODULE_SPECIFIER}.ts`, CONSUMER_MODULE_SOURCE);
  put('src/consumer.ts', `import { ${T} } from '${CONSUMER_MODULE_SPECIFIER}';\nimport { Requirement } from './requirement_ids';\n\n${T}(Requirement.REQ_1);\nexport const stillUsesTheOldOne = Requirement.REQ_2;\n`);
  put('tests/t.ts', `import { ${C} } from '${CONSUMER_MODULE_SPECIFIER}';\nimport { Requirement } from '../src/requirement_ids';\n\n${C}(Requirement.REQ_1);\nexport function testOne(): void {}\n`);
}

/** The project's own compile: errors from the program, deprecations from the language service's suggestions. */
function compile(files: readonly string[]) {
  const options: TS.CompilerOptions = {
    strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    baseUrl: root, paths: { [CONSUMER_MODULE_SPECIFIER]: [`./${CONSUMER_MODULE_SPECIFIER}.ts`] }, types: [], lib: ['lib.es2022.d.ts'], skipLibCheck: true,
  };
  const names = files.map((f) => join(root, f));
  const host: TS.LanguageServiceHost = {
    getScriptFileNames: () => names,
    getScriptVersion: () => '1',
    getScriptSnapshot: (f) => (existsSync(f) ? ts.ScriptSnapshot.fromString(readFileSync(f, 'utf8')) : undefined),
    getCurrentDirectory: () => root,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists, readFile: ts.sys.readFile, readDirectory: ts.sys.readDirectory, directoryExists: ts.sys.directoryExists, getDirectories: ts.sys.getDirectories,
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  const locate = (d: TS.Diagnostic) => {
    const where = d.file !== undefined && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : undefined;
    return { file: d.file?.fileName.slice(root.length + 1).replace(/\\/g, '/'), line: where === undefined ? undefined : where.line + 1, code: d.code, text: ts.flattenDiagnosticMessageText(d.messageText, '\n'), deprecated: d.reportsDeprecated === true };
  };
  const errors = names.flatMap((n) => [...service.getSyntacticDiagnostics(n), ...service.getSemanticDiagnostics(n)]).map(locate);
  const suggestions = names.flatMap((n) => service.getSuggestionDiagnostics(n)).map(locate);
  service.dispose();
  return { errors, suggestions };
}

describe('REQ-TRACE-176: the declarations module', () => {
  it('compiles on its own and offers exactly the lifecycle enumeration, the metadata record and the two annotation kinds', () => {
    put(`${CONSUMER_MODULE_SPECIFIER}.ts`, CONSUMER_MODULE_SOURCE);
    put('src/uses.ts', `import { Lifecycle, RequirementMeta, ${T}, ${C} } from '${CONSUMER_MODULE_SPECIFIER}';\nexport const m = new RequirementMeta('REQ-9', 9, Lifecycle.Approved, 'nine', 'docs/x.md');\n${T}(9); ${C}(9);\nexport const older = new RequirementMeta('REQ-8', 8, Lifecycle.Draft, 'eight', 'docs/y.md');\n`);
    expect(compile(['src/uses.ts']).errors).toEqual([]);
    // REQ-TRACE-176: a name the public surface does not offer is the language's ordinary error, naming the module and the name.
    put('src/wrong.ts', `import { nothingHere } from '${CONSUMER_MODULE_SPECIFIER}';\nexport const x = nothingHere;\n`);
    const wrong = compile(['src/wrong.ts']).errors;
    expect(wrong.map((e) => [e.file, e.line, e.code])).toEqual([['src/wrong.ts', 1, 2305]]);
    expect(wrong[0]!.text).toContain(CONSUMER_MODULE_SPECIFIER);
    expect(wrong[0]!.text).toContain('nothingHere');
    // the module is the artifact's own import target (R5), and it parses no store: nothing under docs/ exists here
    expect(existsSync(join(root, 'docs'))).toBe(false);
  });
});

describe('REQ-TRACE-500 / REQ-TRACE-181 (1): the build-break through the generated symbols', () => {
  it('a consumer compiles against the regenerated artifact, a deprecated reference warns at its exact spot, and a deleted requirement turns every reference into a compile error at its site', async () => {
    seed();
    const e = engine();
    const first = await e.regenerate(root, { signal: signal() });
    expect(first.ok && first.value).toMatchObject({ outcome: 'regenerated', count: 2 });
    const clean = compile(['src/consumer.ts', 'tests/t.ts']);
    expect(clean.errors).toEqual([]);
    // REQ-TRACE-181 (1): the deprecated member carries the language's deprecation marker; the reference at consumer.ts line 5 warns
    expect(clean.suggestions.filter((s) => s.deprecated).map((s) => [s.file, s.line])).toEqual([['src/consumer.ts', 5]]);
    expect(clean.suggestions.find((s) => s.deprecated)!.text).toContain('REQ_2');
    // the requirement is deleted; the next regeneration retires it (REQ-TRACE-132/133) and its symbol vanishes
    rmSync(join(root, 'docs/requirements/REQ-1.md'));
    const second = await e.regenerate(root, { signal: signal() });
    expect(second.ok && second.value).toMatchObject({ outcome: 'regenerated', count: 1 });
    expect(readFileSync(join(root, 'docs/requirements/retired-identifiers.tsv'), 'utf8')).toMatch(/\nREQ-1\t\d{4}-\d{2}-\d{2}\t/);
    const broken = compile(['src/consumer.ts', 'tests/t.ts']);
    // REQ-TRACE-500: every reference to the deleted symbol fails compilation, each at its own file and line
    // 2339 "Property does not exist", or 2551 — the same error when the compiler can suggest a neighbour ("Did you mean 'REQ_2'?")
    expect(broken.errors.map((x) => [x.file, x.line])).toEqual([['src/consumer.ts', 4], ['tests/t.ts', 4]]);
    expect(broken.errors.every((x) => x.code === 2339 || x.code === 2551)).toBe(true);
    expect(broken.errors[0]!.text).toContain('REQ_1');
    e.dispose();
  });
});

describe('REQ-TRACE-182: regeneration before collection', () => {
  it('reports regenerated, then already up to date, and a store that does not parse as a skipped-regeneration notice with the parse errors — never a throw, the artifact untouched', async () => {
    seed();
    const a = await regenerateBeforeCollection(root, { clocks });
    expect(a.outcome).toBe('regenerated');
    expect(a.notice).toContain('src/requirement_ids.ts is regenerated (2 requirement(s))');
    const b = await regenerateBeforeCollection(root, { clocks });
    expect(b).toMatchObject({ outcome: 'already up to date', parseErrors: [] });
    const artifact = readFileSync(join(root, 'src/requirement_ids.ts'), 'utf8');
    put('docs/requirements/REQ-3.md', doc('REQ-3', 'not-a-lifecycle'));
    const c = await regenerateBeforeCollection(root, { clocks });
    expect(c.outcome).toBe('skipped');
    expect(c.notice).toContain('regeneration skipped');
    expect(c.notice).toContain('the artifact was left exactly as it stood');
    expect(c.parseErrors.map((p) => p.path)).toEqual(['docs/requirements/REQ-3.md']);
    expect(readFileSync(join(root, 'src/requirement_ids.ts'), 'utf8')).toBe(artifact);
  });
});

describe('REQ-TRACE-183: the meta-tests over the real repository', () => {
  it('assert a non-empty parse, an up-to-date artifact naming the regeneration action when stale, and zero errors', async () => {
    seed();
    const stale = await metaTests(root, { clocks });
    expect(stale.ok).toBe(false);
    // a missing artifact is an error finding (REQ-TRACE-093), so the third assertion fails with the first
    expect(stale.assertions.map((a) => [a.name, a.ok])).toEqual([['store parses and is non-empty', true], ['artifact is up to date', false], ['verification reports zero errors', false]]);
    expect(stale.assertions[1]!.message).toContain('Regenerate requirement symbols');
    await regenerateBeforeCollection(root, { clocks });
    const steady = await metaTests(root, { clocks });
    // REQ-TRACE-183: the steady state — no violation, only the deprecated reference's warning
    expect(steady.ok).toBe(true);
    expect(steady.assertions.map((a) => a.ok)).toEqual([true, true, true]);
    rmSync(join(root, 'docs/requirements/REQ-1.md'));
    const dangling = await metaTests(root, { clocks });
    expect(dangling.assertions.map((a) => a.ok)).toEqual([true, false, false]);
    expect(dangling.assertions[2]!.message).toContain('REQ-1');
  });
});
