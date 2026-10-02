/**
 * Mechanical migration into the adopted UI component layer.
 *
 * The TypeScript parser identifies JSX tag tokens, so examples in comments and
 * string literals remain byte-identical. Run without `--write` for a report.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import ts from 'typescript';

const root = join(import.meta.dirname, '..');
const sourceRoot = join(root, 'packages', 'ui', 'src');
const designRoot = join(sourceRoot, 'design-system');
const write = process.argv.includes('--write');

const INTRINSIC = new Map([
  ['button', 'DesignButton'],
  ['input', 'DesignInput'],
  ['textarea', 'DesignTextArea'],
  ['select', 'DesignSelect'],
  ['table', 'DesignTable'],
]);

function files(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (path !== designRoot) found.push(...files(path));
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) found.push(path);
  }
  return found;
}

function literalClass(attributes) {
  const attribute = attributes.properties.find((candidate) => ts.isJsxAttribute(candidate) && candidate.name.text === 'className');
  if (!attribute || !ts.isJsxAttribute(attribute) || attribute.initializer === undefined) return '';
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (!ts.isJsxExpression(attribute.initializer) || attribute.initializer.expression === undefined) return '';
  const expression = attribute.initializer.expression;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  return '';
}

function replacement(tag, attributes) {
  const intrinsic = INTRINSIC.get(tag);
  if (intrinsic !== undefined) return intrinsic;
  const words = new Set(literalClass(attributes).split(/\s+/));
  if (tag === 'header' && words.has('page-header')) return 'DesignPageHeader';
  if (tag === 'div' && words.has('empty-state')) return 'DesignEmptyState';
  if (tag === 'div' && words.has('log-panel')) return 'DesignLogPanel';
  if (tag === 'div' && words.has('card')) return 'DesignCard';
  if (tag === 'span' && words.has('status-dot')) return 'DesignStatusDot';
  // The element only: a migrated Tag's `tag tag-<tone>` class is then refused by `pnpm lint` (check-ui-language), and the
  // tone moves to `kind` by hand — the design Tag joins its class to the foundation it draws itself (A40).
  if (tag === 'span' && words.has('tag')) return 'DesignTag';
  return undefined;
}

function modulePath(path) {
  let result = relative(dirname(path), join(designRoot, 'index.js')).split(sep).join('/');
  if (!result.startsWith('.')) result = `./${result}`;
  return result;
}

const changed = [];
for (const path of files(sourceRoot)) {
  const original = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const imports = new Set();

  const visit = (node) => {
    if (ts.isJsxElement(node)) {
      const open = node.openingElement;
      if (ts.isIdentifier(open.tagName)) {
        const next = replacement(open.tagName.text, open.attributes);
        if (next !== undefined) {
          imports.add(next);
          edits.push({ start: open.tagName.getStart(source), end: open.tagName.getEnd(), text: next });
          edits.push({ start: node.closingElement.tagName.getStart(source), end: node.closingElement.tagName.getEnd(), text: next });
        }
      }
    } else if (ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName)) {
      const next = replacement(node.tagName.text, node.attributes);
      if (next !== undefined) {
        imports.add(next);
        edits.push({ start: node.tagName.getStart(source), end: node.tagName.getEnd(), text: next });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (edits.length === 0) continue;

  const existing = source.statements.filter(ts.isImportDeclaration).find((statement) => ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === modulePath(path));
  if (existing !== undefined) throw new Error(`design-system import already exists in ${relative(root, path)}; merge it explicitly`);
  const importsText = [...imports].sort().map((name) => `${name.replace(/^Design/, '')} as ${name}`).join(', ');
  const importText = `\nimport { ${importsText} } from '${modulePath(path)}';`;
  const declarations = source.statements.filter(ts.isImportDeclaration);
  const insertAt = declarations.length === 0 ? 0 : declarations.at(-1).end;
  edits.push({ start: insertAt, end: insertAt, text: importText });
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let next = original;
  for (const edit of edits) next = `${next.slice(0, edit.start)}${edit.text}${next.slice(edit.end)}`;
  changed.push(relative(root, path).split(sep).join('/'));
  if (write) writeFileSync(path, next);
}

process.stdout.write(`${write ? 'migrated' : 'would migrate'} ${changed.length} file(s)\n${changed.join('\n')}${changed.length === 0 ? '' : '\n'}`);
