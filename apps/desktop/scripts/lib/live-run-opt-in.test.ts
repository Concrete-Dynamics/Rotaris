/**
 * What `live-run.mjs` says about its opt-in scenarios agrees with `OPT_IN`, the list that decides which scenarios run only
 * when named. Section 9 called duress "the only scenario here that is" while `OPT_IN` named five, so a reader took a default
 * run for a measurement only `cutoff`, `rename`, `plan-open` and `empty-answer` make (acceptance finding L9 at b9e3005,
 * `docs/defects/fixed/the-live-runs-duress-section-calls-itself-its-only-opt-in-scenario.md`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = readFileSync(join(import.meta.dirname, '..', 'live-run.mjs'), 'utf8');
const optIn = (() => {
  const list = /^const OPT_IN = \[([^\]]*)\];$/m.exec(script)?.[1] ?? '';
  return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
})();
const header = script.slice(0, script.indexOf('\nimport '));
const body = script.slice(script.indexOf('\nimport '));
/** One numbered section of the body: from its `// ── <id>. ` banner to the next banner (or the end). */
function sectionOf(id: string, text: string = body): string {
  const start = text.indexOf(`\n// ── ${id}. `);
  if (start < 0) return '';
  const next = text.indexOf('\n// ── ', start + 1);
  return next < 0 ? text.slice(start) : text.slice(start, next);
}

describe("live-run.mjs's opt-in scenarios (acceptance finding L9)", () => {
  it('OPT_IN is read from the script', () => {
    expect(optIn).toEqual(expect.arrayContaining(['duress', 'cutoff', 'rename', 'plan-open', 'empty-answer']));
  });

  it('the header and each scenario\'s own section mark every opt-in scenario OPT-IN with the flag that runs it', () => {
    for (const name of optIn) {
      const mark = `OPT-IN (\`--only=${name}\`)`;
      expect(header, `${name} in the header`).toContain(mark);
      // The mark must sit in the scenario's OWN section — between its banner and the next — not anywhere in the body (until
      // fin47 a mark misplaced into a neighbour's section passed). The header's line names the section (`8e. cutoff — …`).
      const id = new RegExp(`^ \\*\\s+(\\d+[a-z]?)\\.\\s+${name.replace(/[-]/g, '\\-')}\\s+—\\s+OPT-IN`, 'm').exec(header)?.[1];
      expect(id, `${name}'s section number in the header`).toBeDefined();
      expect(sectionOf(id as string), `${name} in its section ${id as string}`).toContain(mark);
    }
  });

  it('a mark in a neighbour\'s section is not read as the scenario\'s own', () => {
    const fake = '\n// ── 1. One ──\n * OPT-IN (`--only=two`)\n// ── 2. Two ──\n * nothing here\n';
    expect(sectionOf('2', fake)).not.toContain('OPT-IN (`--only=two`)');
    expect(sectionOf('1', fake)).toContain('OPT-IN (`--only=two`)');
  });

  it('no comment calls one scenario the only opt-in one, and the long run\'s section names the others', () => {
    expect(script).not.toMatch(/the only scenario here that is/);
    expect(script).not.toMatch(/the only opt-in/i);
    const duress = body.slice(body.indexOf('// ── 9. The long run'));
    const opening = duress.slice(0, duress.indexOf('`codebase.md`'));
    for (const name of optIn.filter((n) => n !== 'duress')) expect(opening, name).toContain(`\`${name}\``);
  });
});
