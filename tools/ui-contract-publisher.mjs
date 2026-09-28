/**
 * One publisher for a layout contract (`docs/design/README.md` §7, R-007; `.claude/rules/ui-surfaces.md`).
 *
 * `layoutContractAttributes` (`packages/ui/src/design-system/layout-contract.ts`) is the only code that may
 * write `data-ui-contract`. It serialises the relations ARRAY, which is the shape `ui-audit`'s CONTRACTS sweep
 * iterates. A contract written by hand drifted once into `{"relations":[…]}` on the window controls, and the
 * sweep threw on the first view that drew the title bar, so every audit died and no evidence pack was written.
 * This guard makes the publisher the only way the attribute can reach the DOM: `tools/check-ui-language.mjs`
 * runs it over every drawing root and fails `pnpm lint` on a finding.
 *
 * What it reads, in the TypeScript AST rather than the text (a comment may name the attribute freely):
 *   - a JSX attribute named `data-ui-contract`;
 *   - a string literal `'data-ui-contract'` (an object key spread into JSX, a `setAttribute` call);
 *   - a property access `.uiContract` (a `dataset` write).
 */
import ts from 'typescript';

export const CONTRACT_ATTRIBUTE = 'data-ui-contract';
/** The one file allowed to spell the attribute, repository-relative with forward slashes. */
export const CONTRACT_PUBLISHER = 'packages/ui/src/design-system/layout-contract.ts';

/**
 * @param rel repository-relative path, forward slashes
 * @param text the file's source
 * @returns one `path:line what` string per hand-written contract; empty for the publisher itself
 */
export function handWrittenContracts(rel, text) {
  if (rel === CONTRACT_PUBLISHER) return [];
  const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : rel.endsWith('.ts') ? ts.ScriptKind.TS : null;
  if (kind === null) return [];
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  const found = [];
  const at = (node, what) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push(`${rel}:${line + 1} ${what}`);
  };
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === CONTRACT_ATTRIBUTE) at(node, `JSX attribute ${CONTRACT_ATTRIBUTE}`);
    else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === CONTRACT_ATTRIBUTE) at(node, `string '${CONTRACT_ATTRIBUTE}'`);
    else if (ts.isPropertyAccessExpression(node) && node.name.text === 'uiContract') at(node, 'dataset.uiContract');
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
