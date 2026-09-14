/**
 * Adopted-language guard. Raw JSX controls are closed debt; CSS and inline
 * geometry are normalized against a committed baseline that can only shrink.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import ts from 'typescript';
import { baselineDocument, compareDebt } from './ui-language-debt.mjs';

const root = join(import.meta.dirname, '..');
// Every place that draws: the component package and the renderer composition root, which
// holds the terminal and persona window bodies and is as much production UI as the package.
const drawingRoots = [join(root, 'packages', 'ui', 'src'), join(root, 'apps', 'desktop', 'src', 'renderer')];
const baselinePath = join(import.meta.dirname, 'ui-language-baseline.json');
const writing = process.argv.includes('--write-baseline');
const forbiddenTags = new Set(['button', 'input', 'textarea', 'select', 'table']);
const raw = [];
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
  if (rel.includes('/design-system/') || /\.test\.[^.]+$/.test(path)) continue;
  const extension = extname(path);
  const text = readFileSync(path, 'utf8');
  if (extension === '.tsx') {
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      const tagName = ts.isJsxElement(node) ? node.openingElement.tagName : ts.isJsxSelfClosingElement(node) ? node.tagName : undefined;
      if (tagName && ts.isIdentifier(tagName) && forbiddenTags.has(tagName.text)) {
        const at = source.getLineAndCharacterOfPosition(tagName.getStart(source));
        raw.push(`${relative(root, path).split(sep).join('/')}:${at.line + 1} <${tagName.text}>`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const match of text.matchAll(/\b(gap|padding(?:-(?:top|right|bottom|left))?|margin(?:-(?:top|right|bottom|left))?|borderRadius|fontSize|width|height|minWidth|minHeight|maxWidth|maxHeight)\s*:\s*['"]?(-?\d+(?:\.\d+)?(?:px|pt|ms)?)/g)) addDebt(path, 'inline-metric', `${match[1]}:${match[2]}`);
  }
  if (extension === '.css') {
    // Found while writing the plan gate's styles (2026-09-13,
    // docs/defects/ui-language-checker-reads-css-comments.md): these scans ran over raw text, so a
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
if (raw.length > 0 || growth.length > 0 || stale.length > 0) {
  if (raw.length > 0) process.stderr.write(`Raw design-equivalent JSX belongs in packages/ui/src/design-system:\n${raw.join('\n')}\n`);
  if (growth.length > 0) process.stderr.write(`UI-language literal debt grew:\n${growth.map(({ key, count, allowed }) => `${key}: ${count} > ${allowed}`).join('\n')}\n`);
  if (stale.length > 0) process.stderr.write(`UI-language debt fell below the baseline — lower it with \`node tools/check-ui-language.mjs --write-baseline\`:\n${stale.map(({ key, count, allowed }) => `${key}: ${count} < ${allowed}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`UI language: 0 raw controls; ${Object.keys(normalized).length} normalized legacy debt entries at the baseline\n`);
}
