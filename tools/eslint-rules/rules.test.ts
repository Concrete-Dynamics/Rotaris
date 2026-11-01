import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
// @ts-expect-error -- a plain JavaScript module without declarations
import { citationFindings, loadArtifact } from './index.js';
import { REQ, SUPERSEDED_BY } from '@rotaris/kernel';

/**
 * The boundary matrix and the engine-code timer rule are structural only if
 * a violation actually fails. These fixtures are the deliberate violations
 * the plan called for: each must be reported, or the lint is decorative.
 */
const repo = fileURLToPath(new URL('../..', import.meta.url));
/*
 * The fixtures are text at paths no file occupies, so no tsconfig's program holds them: the type-aware parse (R-091)
 * takes them into the default project the repository's own configuration names, on the root tsconfig's options. Only
 * the list of files it admits is widened; every rule is the repository's.
 */
const FIXTURES = ['tools/*.test.ts', 'packages/*/src/violation.ts', 'packages/*/src/fine.ts', 'packages/*/src/ok.ts', 'packages/*/src/x.test.ts', 'packages/*/src/violation.tsx', 'apps/desktop/src/main/violation.ts', 'apps/desktop/src/main/fine.ts', 'tools/requirement-coverage/fixture.test.ts'];
const eslint = new ESLint({
  cwd: repo,
  overrideConfigFile: join(repo, 'eslint.config.js'),
  overrideConfig: { files: ['**/*.{ts,tsx,mts,cts}'], languageOptions: { parserOptions: { projectService: { allowDefaultProject: FIXTURES, defaultProject: 'tsconfig.json', maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 64 } } } },
});

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

describe('lint — R-092 (ReqToCode §4.6): every cited requirement or directive identifier resolves', () => {
  // Identifiers are built, never written whole, so this file's own text cites nothing the rule would read.
  const id = (kind: 'REQ' | 'PD', domain: string, n: string) => [kind, domain, n].join('-');
  const cites = async (filePath: string, code: string) => {
    const [result] = await eslint.lintText(code, { filePath: join(repo, filePath) });
    return (result?.messages ?? []).filter((m) => m.ruleId === 'rotaris/requirement-citations-resolve').map((m) => `${m.line}: ${m.message}`);
  };
  const unknown = id('REQ', 'CHAT', '999');
  const live = id('REQ', 'CHAT', '001');
  const withdrawn = id('REQ', 'CONFIG', '058');
  const superseded = id('REQ', 'CHAT', '098');
  const retired = id('REQ', 'TUI', '001');
  const lastChat = Object.keys(REQ).filter((k) => k.startsWith('REQ-CHAT-')).map((k) => Number(k.slice(-3))).reduce((a, b) => Math.max(a, b));
  const pad = (n: number) => String(n).padStart(3, '0');

  it('an identifier the artifact does not define fails, in a comment, a string, a template, a test name and JSX text', async () => {
    const code = [
      `// ${unknown}: a line comment`,
      `/* ${id('PD', 'CHAT', '999')} in a block comment */`,
      `export const a = '${unknown}';`,
      `export const b = \`${unknown} \${a}\`;`,
      `declare function it(name: string, fn: () => void): void;`,
      `it('${unknown}: a test name', () => {});`,
    ].join('\n');
    const found = await cites('packages/engine/src/violation.ts', code);
    expect(found).toHaveLength(5);
    expect(found[0]).toBe(`1: cites ${unknown}, which docs/spec/ does not define. Correct it to the identifier meant, or remove it.`);
    expect(found[1]).toContain('which docs/product/directives/ does not define');
    expect(await cites('packages/ui/src/violation.tsx', `export const v = <p>see ${unknown}</p>;\n`)).toHaveLength(1);
  });

  it('a digit too many or too few is an identifier the artifact does not define, never text the rule skips', async () => {
    const extra = `${live}1`;
    const short = id('PD', 'CHAT', '2');
    const found = await cites('packages/engine/src/violation.ts', `// ${extra} and ${short}\nexport const s = '${id('REQ', 'CHAT', '1')}';\n`);
    expect(found).toEqual([
      `1: cites ${extra}, which docs/spec/ does not define. Correct it to the identifier meant, or remove it.`,
      `1: cites ${short}, which docs/product/directives/ does not define. Correct it to the identifier meant, or remove it.`,
      `2: cites ${id('REQ', 'CHAT', '1')}, which docs/spec/ does not define. Correct it to the identifier meant, or remove it.`,
    ]);
  });

  it('a range is expanded: an end past the last identifier fails, and a live range passes', async () => {
    const found = await cites('packages/engine/src/violation.ts', `// REQ-CHAT-${pad(lastChat - 1)}..${pad(lastChat + 1)}\n`);
    expect(found).toEqual([`1: cites REQ-CHAT-${pad(lastChat + 1)}, which docs/spec/ does not define. Correct it to the identifier meant, or remove it.`]);
    expect(await cites('packages/engine/src/fine.ts', `// ${live}..003, ${live} to 003, ${live}/002, ${live}, 002 and 003\n`)).toEqual([]);
  });

  it('a withdrawn identifier fails unless its line or the line above says withdrawn; a range spanning one does not', async () => {
    expect(await cites('packages/engine/src/violation.ts', `// the old directory (${withdrawn})\n`)).toEqual([
      `1: cites ${withdrawn}, withdrawn in place (docs/spec/15-settings-configuration/02-legacy-migration.md:7). Cite what replaced it, or mark a deliberate historical citation with the word \`withdrawn\` on this line or the line above.`,
    ]);
    expect(await cites('packages/engine/src/fine.ts', `// the old directory (${withdrawn}, withdrawn)\n`)).toEqual([]);
    expect(await cites('packages/engine/src/fine.ts', `// Withdrawn, and cited as history:\n// ${withdrawn}\n`)).toEqual([]);
    expect(await cites('packages/engine/src/fine.ts', `// ${id('REQ', 'CONFIG', '050')}..057 and a span: ${id('REQ', 'CONFIG', '057')}..062\n`)).toEqual([]);
  });

  it('a superseded identifier fails unless the line names its directive or says superseded', async () => {
    expect(await cites('packages/ui/src/violation.ts', `// the modal stepper (${superseded})\n`)).toEqual([
      `1: cites ${superseded}, superseded by PD-CHAT-002, which governs instead. Cite PD-CHAT-002, or mark a deliberate historical citation (\`superseded by PD-CHAT-002\`).`,
    ]);
    expect(await cites('packages/ui/src/fine.ts', `// the modal stepper (${superseded}, superseded by ${id('PD', 'CHAT', '002')})\n`)).toEqual([]);
    // The word alone marks it, with no directive named, on the line or the line above.
    expect(await cites('packages/ui/src/fine.ts', `// the modal stepper (${superseded}, superseded)\n`)).toEqual([]);
    expect(await cites('packages/ui/src/fine.ts', `// Superseded, and cited as history:\nexport const s = '${superseded}';\n`)).toEqual([]);
    expect(await cites('packages/ui/src/fine.ts', `// ${id('PD', 'CHAT', '002')} (was ${superseded})\n`)).toEqual([]);
  });

  it('an identifier of a retired domain fails unless the line says retired', async () => {
    expect(await cites('tools/x/violation.mjs', `// ${retired}\n`)).toEqual([
      `1: cites ${retired}, in the retired TUI domain (docs/spec/README.md). Remove it, or mark a deliberate historical citation with the word \`retired\`.`,
    ]);
    expect(await cites('tools/x/fine.mjs', `// ${retired}, retired with the terminal interface\n`)).toEqual([]);
  });

  it('live identifiers pass, and the scope is packages/, apps/ and tools/ less the coverage report\'s made-up fixtures', async () => {
    expect(await cites('apps/desktop/src/main/fine.ts', `// ${live}, ${id('PD', 'CHAT', '011')}\nexport const s = '${live}';\n`)).toEqual([]);
    expect(await cites('tools/requirement-coverage/fixture.test.ts', `// ${unknown}\n`)).toEqual([]);
    expect(await cites('packages/engine/src/x.test.ts', `// ${unknown}\n`)).toHaveLength(1);
  });

  it('an identifier the record holds open (`pending`) waits on its question for its lifecycle, never for its existence', async () => {
    const held = id('REQ', 'ORCH', '153');
    expect(SUPERSEDED_BY[held as keyof typeof SUPERSEDED_BY]).toBe('PD-ORCH-002');
    expect(await cites('packages/engine/src/fine.ts', `// the plan gate (${held})\n`)).toEqual([]);
    const art = loadArtifact();
    expect(citationFindings(`// ${held}`, '', art).map((f: { kind: string }) => f.kind)).toEqual(['superseded']);
    expect(citationFindings(`// ${held}`, '', art, { [held]: 'OQ-491' })).toEqual([]);
  });
});

describe('lint — the type-aware rules run (R-091, hardening.md §3.5 row 1)', () => {
  it('a promise neither awaited, caught nor marked void is reported', async () => {
    const work = 'async function work(): Promise<number> { return 1; }\n';
    expect(await lintAs('packages/engine/src/violation.ts', `${work}export function caller(): void { work(); }\n`)).toContain('@typescript-eslint/no-floating-promises');
    expect(await lintAs('packages/engine/src/fine.ts', `${work}export function caller(): void { void work(); }\n`)).not.toContain('@typescript-eslint/no-floating-promises');
  });
  it('an async callback where a () => void is expected is reported', async () => {
    const rules = await lintAs('packages/engine/src/violation.ts', 'declare function after(fn: () => void): void;\nafter(async () => { await Promise.resolve(); });\n');
    expect(rules).toContain('@typescript-eslint/no-misused-promises');
  });
  it('a switch over a union whose default covers a member it does not name is reported', async () => {
    const code = (cases: string) => `type Kind = 'a' | 'b' | 'c';\nexport function name(k: Kind): string {\n  switch (k) {\n    ${cases}\n    default: return 'other';\n  }\n}\n`;
    expect(await lintAs('packages/engine/src/violation.ts', code("case 'a': return 'A';"))).toContain('@typescript-eslint/switch-exhaustiveness-check');
    expect(await lintAs('packages/engine/src/fine.ts', code("case 'a': return 'A';\n    case 'b': case 'c':"))).not.toContain('@typescript-eslint/switch-exhaustiveness-check');
  });
  it('an await of a value that is no promise is reported', async () => {
    expect(await lintAs('packages/engine/src/violation.ts', 'export async function f(): Promise<number> { return await 3; }\n')).toContain('@typescript-eslint/await-thenable');
  });
});
