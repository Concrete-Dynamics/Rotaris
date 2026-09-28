/**
 * A layout contract reaches the DOM only through `layoutContractAttributes` (`docs/design/README.md` §7, R-007).
 *
 * `pnpm lint` (`tools/check-ui-language.mjs`) runs this over `packages/ui/src` and the renderer root; what is
 * pinned here is the verdict, including the window controls' original hand-written object, which killed every
 * `ui-audit` (docs/defects/fixed/the-window-controls-contract-is-an-object-and-kills-every-ui-audit.md).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { CONTRACT_PUBLISHER, handWrittenContracts } from './ui-contract-publisher.mjs';

const TSX = 'packages/ui/src/Example.tsx';

describe('design README §7 (R-007): one publisher for data-ui-contract, PD-SHELL-003 the case that broke', () => {
  it('refuses the window controls\' hand-written object attribute', () => {
    const text = `export const C = () => <div data-ui="shell-window-controls" data-ui-contract='{"relations":[{"kind":"containment","target":"shell-title"}]}' />;\n`;
    expect(handWrittenContracts(TSX, text)).toEqual([`${TSX}:1 JSX attribute data-ui-contract`]);
  });

  it('refuses a hand-written attribute even when its value is a well-formed array', () => {
    const text = `export const C = () => (\n  <section\n    data-ui-contract='[{"kind":"containment"}]' />\n);\n`;
    expect(handWrittenContracts(TSX, text)).toEqual([`${TSX}:3 JSX attribute data-ui-contract`]);
  });

  it('refuses the attribute spelled as an object key, a setAttribute call or a dataset write', () => {
    const text = [
      `export const C = () => <div {...{ 'data-ui-contract': '[]' }} />;`,
      `export function f(el: HTMLElement) { el.setAttribute(\`data-ui-contract\`, '[]'); el.dataset.uiContract = '[]'; }`,
      '',
    ].join('\n');
    expect(handWrittenContracts(TSX, text)).toEqual([
      `${TSX}:1 string 'data-ui-contract'`,
      `${TSX}:2 string 'data-ui-contract'`,
      `${TSX}:2 dataset.uiContract`,
    ]);
  });

  it('passes the publisher spread, a data-ui marker alone, and prose that names the attribute', () => {
    const text = [
      `// data-ui-contract is written by layoutContractAttributes, never here`,
      `export const C = () => <div data-ui="x" {...layoutContractAttributes(LAYOUT)} />;`,
      '',
    ].join('\n');
    expect(handWrittenContracts(TSX, text)).toEqual([]);
  });

  it('exempts the publisher itself and ignores files that are not TypeScript', () => {
    const publisher = `export function layoutContractAttributes() { return { 'data-ui-contract': '[]' }; }\n`;
    expect(handWrittenContracts(CONTRACT_PUBLISHER, publisher)).toEqual([]);
    expect(handWrittenContracts('packages/ui/src/shell.css', `[data-ui-contract] { outline: 0; }`)).toEqual([]);
  });
});
