/**
 * REQ-SHELL-044: "the literal parenthesised '(s)' form is never rendered anywhere in the product". This gate reads every
 * string the product's source can put on a surface — string literals, template pieces and JSX text in `packages/<name>/src`
 * and `apps/desktop/src`, tests excluded — and fails on a parenthesised plural marker in one: `(s)`, `(es)` or `(ies)` after a
 * letter. A count gets `countNoun` from `@rotaris/kernel` instead.
 *
 * Two kinds of string are not a surface and pass:
 *   - a LOG line: the argument of a call named `log`, `say`, `info`, `warn` or `debug` (`deps.log`, `s.log?.info`, …) outside
 *     the drawing roots. The run host's and the workspace service's `log` and `warn` travel as `log` events to main, which
 *     writes them to the application log and draws none of them; several proofs match those lines as written.
 *   - an entry in ALLOWED below, each with the reason it stays — a text a requirement fixes that is not only drawn, and the
 *     generated declarations module's doc comments, which are written into the workspace rather than shown.
 *
 * `http(s)` is a scheme, not a plural, and passes. Live-run finding L11 (2026-09-29) is why this exists: "Added Katalyst;
 * discovered 1 model(s)." in the sign-in dialog, and some thirty more sites the grep behind the repair found
 * (docs/defects/fixed/a-literal-plural-marker-is-rendered-in-sign-in-notices.md).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

const MARKER = /[A-Za-z]\((?:s|es|ies)\)/;
const LOG_CALL = /(?:^|\.)(?:log|say|info|warn|debug)$/;
/** The drawing roots (`tools/check-ui-language.mjs`): nothing there is a log line, whatever its call is named. */
const DRAWING = [/^packages\/ui\//, /^packages\/ui-core\//, /^apps\/desktop\/src\/renderer\//];

/**
 * The texts that keep the marker, each with its reason. `phrase` is matched against the literal piece that carries the
 * marker. An entry that no longer matches anything fails the gate too, so the list cannot outlive what it excuses.
 */
export const ALLOWED = [
  { file: 'packages/agent-tools/src/terminal/index.ts', phrase: ' byte(s) to session ', reason: 'REQ-TOOLS-110 fixes the tool result `Sent <n> byte(s) to session <id>.`; the result is also drawn in the tool row (OQ-138)' },
  { file: 'packages/agent-tools/src/tools/files.ts', phrase: ' match(es) for \'', reason: 'REQ-TOOLS-134 fixes the grep header `N match(es) for \'<pattern>\':`; the result is also drawn in the tool row (OQ-138)' },
  { file: 'packages/agent-tools/src/tools/artifacts.ts', phrase: ' artifact(s):', reason: 'REQ-LIBRARY-100 fixes the listing `<N> artifact(s):`; the result is also drawn in the tool row (OQ-138)' },
  { file: 'packages/contracts/src/artifacts.ts', phrase: 'Invalid tag(s): ', reason: 'REQ-LIBRARY-089 fixes the refusal\'s opening `Invalid tag(s): `; the result is also drawn in the tool row (OQ-138)' },
  { file: 'packages/workspace/src/traceability/consumer.ts', phrase: 'implements the named requirement(s). */', reason: 'a doc comment of the generated declarations module, written into the workspace and never drawn; not a count' },
  { file: 'packages/workspace/src/traceability/consumer.ts', phrase: 'covers the named requirement(s). */', reason: 'a doc comment of the generated declarations module, written into the workspace and never drawn; not a count' },
];

/** The nearest enclosing call's callee, spelled without optional chaining (`s.log?.info` → `s.log.info`). */
function calleeOf(node) {
  for (let p = node.parent; p && !ts.isSourceFile(p); p = p.parent) {
    if (ts.isCallExpression(p)) return p.expression.getText().replace(/\?\./g, '.').replace(/\?$/, '');
    if (ts.isFunctionLike(p)) return '';
  }
  return '';
}

/** Every string piece in one source that carries a marker: `{ line, text, callee }`. */
export function markersIn(text, fileName) {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const found = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
      const value = ts.isJsxText(node) ? node.getText() : node.text;
      if (MARKER.test(value.replace(/https?\(s\)|http\(s\)/g, ''))) {
        found.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: value, callee: calleeOf(node) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function sources(root) {
  const roots = [...readdirSync(join(root, 'packages')).map((name) => join(root, 'packages', name, 'src')), join(root, 'apps', 'desktop', 'src')];
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { if (!['node_modules', 'generated', 'dist', 'out'].includes(entry.name)) walk(path); }
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(path);
    }
  };
  roots.forEach(walk);
  return out;
}

/** The product's offending strings and the ALLOWED entries that excused nothing. */
export function checkProduct(root, allowed = ALLOWED) {
  const problems = [];
  const used = new Set();
  for (const path of sources(root)) {
    const rel = relative(root, path).split(sep).join('/');
    const drawing = DRAWING.some((re) => re.test(rel));
    for (const m of markersIn(readFileSync(path, 'utf8'), path)) {
      if (!drawing && LOG_CALL.test(m.callee)) continue;
      const excuse = allowed.findIndex((a) => a.file === rel && m.text.includes(a.phrase));
      if (excuse >= 0) { used.add(excuse); continue; }
      problems.push(`${rel}:${m.line}: ${JSON.stringify(m.text.length > 90 ? `${m.text.slice(0, 87)}…` : m.text)}`);
    }
  }
  const stale = allowed.filter((_, i) => !used.has(i)).map((a) => `${a.file}: ALLOWED entry ${JSON.stringify(a.phrase)} matches nothing — remove it`);
  return { problems, stale };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const { problems, stale } = checkProduct(join(import.meta.dirname, '..'));
  if (problems.length > 0 || stale.length > 0) {
    console.error(`check-plural-markers: ${problems.length + stale.length} problem${problems.length + stale.length === 1 ? '' : 's'} (REQ-SHELL-044 — use countNoun from @rotaris/kernel):`);
    for (const p of [...problems, ...stale]) console.error(`  ${p}`);
    process.exitCode = 1;
  } else console.log('check-plural-markers: no literal plural marker in a string the product can draw');
}
