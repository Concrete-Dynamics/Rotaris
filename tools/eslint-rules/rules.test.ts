import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * The boundary matrix and the engine-code timer rule are structural only if
 * a violation actually fails. These fixtures are the deliberate violations
 * the plan called for: each must be reported, or the lint is decorative.
 */
const repo = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd: repo, overrideConfigFile: join(repo, 'eslint.config.js') });

async function lintAs(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(repo, filePath) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'parse');
}

describe('lint — the dependency matrix is enforced (docs/architecture/README.md §1, W-01)', () => {
  it('a renderer package importing the store fails boundaries/element-types', async () => {
    const rules = await lintAs('packages/ui/src/violation.ts', "import { openStore } from '@rotaris/store';\nexport const x = openStore;\n");
    expect(rules).toContain('boundaries/element-types');
  });
  it('main importing the store fails (main never opens the workspace store)', async () => {
    const rules = await lintAs('apps/desktop/src/main/violation.ts', "import { openStore } from '@rotaris/store';\nexport const x = openStore;\n");
    expect(rules).toContain('boundaries/element-types');
  });
  it('the allowed direction passes: store importing platform', async () => {
    const rules = await lintAs('packages/store/src/ok.ts', "import { canonicalPath } from '@rotaris/platform';\nexport const x = canonicalPath;\n");
    expect(rules).not.toContain('boundaries/element-types');
  });
});

describe('lint — ADR-0006: no bare timers in engine code', () => {
  it('setTimeout and Date.now in an engine package are reported', async () => {
    const rules = await lintAs('packages/engine/src/violation.ts', "export const t = Date.now();\nsetTimeout(() => {}, 1);\n");
    expect(rules.filter((r) => r === 'rotaris/no-bare-timers')).toHaveLength(2);
  });
  it('the same code in the renderer is not (animation frames are a named exception)', async () => {
    const rules = await lintAs('packages/ui/src/fine.ts', "export const t = Date.now();\n");
    expect(rules).not.toContain('rotaris/no-bare-timers');
  });
});

describe('lint — electron is a composition-root dependency', () => {
  it('a library package importing electron is reported', async () => {
    const rules = await lintAs('packages/engine/src/violation.ts', "import { app } from 'electron';\nexport const a = app;\n");
    expect(rules).toContain('rotaris/no-electron-outside-roots');
  });
});

describe('lint — ADR-0031: arithmetic on an amount lives in kernel/src/money.ts', () => {
  const money = (rules: string[]) => rules.filter((r) => r === 'rotaris/money-only-in-money-ts');
  it('a bigint outside money.ts is reported, in any package', async () => {
    expect(money(await lintAs('packages/engine/src/violation.ts', 'export const a = BigInt(3);\nexport const b = 10n;\n'))).toHaveLength(2);
    expect(money(await lintAs('packages/ui/src/violation.ts', 'export const a = BigInt(3);\n'))).toHaveLength(1);
  });
  it('arithmetic, a numeric conversion or a compound assignment on a money-named value is reported', async () => {
    const code = [
      'declare const cost: string; declare const usage: { inputPrice: number }; declare let total: number; declare const tokens: number;',
      'export const a = usage.inputPrice * tokens;',
      'export const b = Number(cost);',
      'export const c = parseFloat(cost);',
      'export const d = +cost;',
      'export let totalCost = 0; totalCost += tokens;',
      'total = total + usage.inputPrice;',
    ].join('\n');
    expect(money(await lintAs('packages/engine/src/violation.ts', code))).toHaveLength(6);
  });
  it('money.ts itself, a test, and code that only carries or compares an amount are not reported', async () => {
    expect(money(await lintAs('packages/kernel/src/money.ts', 'export const a = BigInt(3) * 2n;\n'))).toEqual([]);
    expect(money(await lintAs('packages/engine/src/x.test.ts', 'export const a = 0.1 * 3; declare const cost: number; export const b = cost * 2;\n'))).toEqual([]);
    const carried = "import { addAmounts } from '@rotaris/kernel';\ndeclare const cost: string;\nexport const total = addAmounts(cost, '0.1');\nexport const same = cost === '0';\nexport const label = `${cost} reported`;\n";
    expect(money(await lintAs('packages/engine/src/fine.ts', carried))).toEqual([]);
  });
});
