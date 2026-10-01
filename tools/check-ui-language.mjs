/**
 * Adopted-language guard. Raw JSX controls are closed debt; CSS and inline
 * geometry are normalized against a committed baseline that can only shrink.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import ts from 'typescript';
import { baselineDocument, compareDebt } from './ui-language-debt.mjs';
import { handWrittenContracts } from './ui-contract-publisher.mjs';

const root = join(import.meta.dirname, '..');
// Every place that draws: the component package and the renderer composition root, which
// holds the terminal and persona window bodies and is as much production UI as the package.
const drawingRoots = [join(root, 'packages', 'ui', 'src'), join(root, 'apps', 'desktop', 'src', 'renderer')];
const baselinePath = join(import.meta.dirname, 'ui-language-baseline.json');
const writing = process.argv.includes('--write-baseline');
const forbiddenTags = new Set(['button', 'input', 'textarea', 'select', 'table']);
const raw = [];
/**
 * A design Tag whose class spells its foundation or a tone (`tag`, `tag-run`). The Tag joins a caller's class to `tag
 * tag-<kind>` and names the tone by `kind` alone, so a tone spelled in the class sits beside the one `kind` gives — the
 * default `neutral` included — and which one paints is the stylesheet's order, not the caller's choice. Until 2026-10-01
 * a class REPLACED the foundation, every caller spelled it by hand, and one spelled `tag-failure`, which the language does
 * not define (docs/defects/fixed/the-design-tags-kinds-name-classes-the-adopted-stylesheet-does-not-define.md).
 */
const tagTones = [];
const TAG_COMPONENTS = new Set(['Tag', 'DesignTag']);
/** Every literal piece of an attribute's value: string literals and the static parts of templates, at any depth. */
function literalPieces(node, out = []) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
  else if (ts.isTemplateExpression(node)) { out.push(node.head.text); for (const span of node.templateSpans) { literalPieces(span.expression, out); out.push(span.literal.text); } }
  else ts.forEachChild(node, (child) => { literalPieces(child, out); });
  return out;
}
/** A `data-ui-contract` written anywhere but `layoutContractAttributes` — the design system included. */
const contracts = [];
const debt = {};

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', 'out'].includes(entry.name)) found.push(...walk(path));
    } else found.push(path);
  }
  return found;
}

function addDebt(path, category, signature) {
  const key = `${relative(root, path).split(sep).join('/')}|${category}|${signature}`;
  debt[key] = (debt[key] ?? 0) + 1;
}

for (const path of drawingRoots.flatMap((drawingRoot) => walk(drawingRoot))) {
  const rel = relative(root, path).split(sep).join('/');
  if (/\.test\.[^.]+$/.test(path)) continue;
  const extension = extname(path);
  const text = readFileSync(path, 'utf8');
  contracts.push(...handWrittenContracts(rel, text));
  if (rel.includes('/design-system/')) continue;
  if (extension === '.tsx') {
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      const tagName = ts.isJsxElement(node) ? node.openingElement.tagName : ts.isJsxSelfClosingElement(node) ? node.tagName : undefined;
      if (tagName && ts.isIdentifier(tagName) && forbiddenTags.has(tagName.text)) {
        const at = source.getLineAndCharacterOfPosition(tagName.getStart(source));
        raw.push(`${relative(root, path).split(sep).join('/')}:${at.line + 1} <${tagName.text}>`);
      }
      if (tagName && ts.isIdentifier(tagName) && TAG_COMPONENTS.has(tagName.text)) {
        const attributes = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
        for (const attribute of attributes.properties) {
          if (!ts.isJsxAttribute(attribute) || attribute.name.getText(source) !== 'className' || attribute.initializer === undefined) continue;
          const spelled = literalPieces(attribute.initializer).flatMap((piece) => piece.split(/\s+/)).filter((token) => token === 'tag' || token.startsWith('tag-'));
          if (spelled.length === 0) continue;
          const at = source.getLineAndCharacterOfPosition(attribute.getStart(source));
          tagTones.push(`${rel}:${at.line + 1} <${tagName.text} className> spells ${spelled.join(', ')}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const match of text.matchAll(/\b(gap|padding(?:-(?:top|right|bottom|left))?|margin(?:-(?:top|right|bottom|left))?|borderRadius|fontSize|width|height|minWidth|minHeight|maxWidth|maxHeight)\s*:\s*['"]?(-?\d+(?:\.\d+)?(?:px|pt|ms)?)/g)) addDebt(path, 'inline-metric', `${match[1]}:${match[2]}`);
  }
  if (extension === '.css') {
    // Found while writing the plan gate's styles (2026-09-13,
    // a defect note, removed once repaired): these scans ran over raw text, so a
    // property name in prose inside a `/* … */` block was read as a declaration — and because the
    // value pattern runs to the next `;` or `}` and a comment holds neither, the match continued
    // PAST the comment's end and attributed the first literal of the next rule to the sentence.
    // The false positive is safe in direction (it can only over-count), but it failed `pnpm check`
    // naming a metric nowhere near the change. Strip comments before scanning; `.tsx` keeps its
    // raw-text scan, where the inline-metric pattern is anchored on quotes and has no such reach.
    const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/\b(gap|row-gap|column-gap|padding(?:-(?:top|right|bottom|left))?|margin(?:-(?:top|right|bottom|left))?|inset|top|right|bottom|left|width|min-width|max-width|height|min-height|max-height|font-size|border-radius)\s*:\s*([^;}]*?)(-?\d+(?:\.\d+)?(?:px|pt))\b/g)) addDebt(path, 'css-metric', `${match[1]}:${match[3]}`);
    for (const match of css.matchAll(/\b(transition(?:-duration)?|animation(?:-duration)?)\s*:\s*([^;}]*?)(\d+(?:\.\d+)?ms)\b/g)) addDebt(path, 'css-motion', `${match[1]}:${match[3]}`);
  }
}

const document = baselineDocument(debt);
const normalized = document.debt;
if (writing) {
  writeFileSync(baselinePath, `${JSON.stringify(document, null, 2)}\n`);
  process.stdout.write(`wrote ${Object.keys(normalized).length} normalized UI-language debt entries\n`);
  process.exit(0);
}

if (!existsSync(baselinePath)) throw new Error(`UI-language baseline is absent: ${baselinePath}`);
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).debt ?? {};
// Burn-down only: a reduction lowers the baseline, so the allowance can never be re-spent
// elsewhere. Paying debt therefore ends in one command, never in a silently loose ceiling.
const { growth, stale } = compareDebt(normalized, baseline);
if (raw.length > 0 || contracts.length > 0 || tagTones.length > 0 || growth.length > 0 || stale.length > 0) {
  if (tagTones.length > 0) process.stderr.write(`A design Tag names its tone by \`kind\`; its class joins \`tag tag-<kind>\` and never spells either (packages/ui/src/design-system/core.tsx):\n${tagTones.join('\n')}\n`);
  if (contracts.length > 0) process.stderr.write(`A layout contract is published only by layoutContractAttributes (packages/ui/src/design-system/layout-contract.ts):\n${contracts.join('\n')}\n`);
  if (raw.length > 0) process.stderr.write(`Raw design-equivalent JSX belongs in packages/ui/src/design-system:\n${raw.join('\n')}\n`);
  if (growth.length > 0) process.stderr.write(`UI-language literal debt grew:\n${growth.map(({ key, count, allowed }) => `${key}: ${count} > ${allowed}`).join('\n')}\n`);
  if (stale.length > 0) process.stderr.write(`UI-language debt fell below the baseline — lower it with \`node tools/check-ui-language.mjs --write-baseline\`:\n${stale.map(({ key, count, allowed }) => `${key}: ${count} < ${allowed}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`UI language: 0 raw controls, 0 hand-written layout contracts; ${Object.keys(normalized).length} normalized legacy debt entries at the baseline\n`);
}
