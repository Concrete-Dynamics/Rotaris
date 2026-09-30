/**
 * REQ-SHELL-044's gate over the product's own source, and over fixtures for what it must tell apart: a count's literal
 * "(s)" in a drawn string fails, a log line and a scheme's `http(s)` pass, and a log-named call inside a drawing root is
 * still drawn text. Live-run finding L11 (2026-09-29): "Added Katalyst; discovered 1 model(s)." in the sign-in dialog.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { checkProduct, markersIn } from './check-plural-markers.mjs';

describe('check-plural-markers (REQ-SHELL-044)', () => {
  it('no string the product can draw carries a literal plural marker, and every ALLOWED entry still excuses one', () => {
    const { problems, stale } = checkProduct(join(import.meta.dirname, '..'));
    expect(problems).toEqual([]);
    expect(stale).toEqual([]);
  });

  describe('over fixtures', () => {
    let root: string;
    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'plural-markers-'));
      mkdirSync(join(root, 'packages', 'engine', 'src'), { recursive: true });
      mkdirSync(join(root, 'packages', 'ui', 'src'), { recursive: true });
      mkdirSync(join(root, 'apps', 'desktop', 'src'), { recursive: true });
    });
    afterEach(() => { rmSync(root, { recursive: true, force: true }); });

    it('a drawn count fails; a log line, a scheme and a test file pass; a log-named call in a drawing root fails', () => {
      writeFileSync(join(root, 'packages', 'engine', 'src', 'a.ts'), [
        'export const m = (n: number) => `discovered ${n} model(s).`;',
        'export const t = (n: number) => `${n} match(es)`;',
        "declare const log: (m: string) => void; declare const s: { log?: { info(m: string): void } };",
        'export function f(n: number) { log(`${n} file(s)`); s.log?.info(`${n} row(s)`); }',
        "export const url = 'an http(s) link';",
      ].join('\n'));
      writeFileSync(join(root, 'packages', 'engine', 'src', 'a.test.ts'), "export const x = '1 model(s)';\n");
      writeFileSync(join(root, 'packages', 'ui', 'src', 'V.tsx'), [
        'declare const log: (m: string) => void;',
        'export const V = ({ n }: { n: number }) => <span onClick={() => log(`${n} click(s)`)}>Overwrite {n} change(s)</span>;',
      ].join('\n'));
      const { problems } = checkProduct(root, []);
      expect(problems).toHaveLength(4);
      expect(problems.join('\n')).toMatch(/packages\/engine\/src\/a\.ts:1: " model\(s\)\."/);
      expect(problems.join('\n')).toMatch(/packages\/engine\/src\/a\.ts:2: " match\(es\)"/);
      expect(problems.join('\n')).toMatch(/packages\/ui\/src\/V\.tsx:2: " click\(s\)"/);
      expect(problems.join('\n')).toMatch(/packages\/ui\/src\/V\.tsx:2: " ?change\(s\)"/);
    });

    it('an ALLOWED entry excuses its phrase in its file only, and one that excuses nothing is reported', () => {
      writeFileSync(join(root, 'packages', 'engine', 'src', 'a.ts'), 'export const m = (n: number) => `Sent ${n} byte(s) to session x.`;\n');
      const allowed = [
        { file: 'packages/engine/src/a.ts', phrase: ' byte(s) to session ', reason: 'fixture' },
        { file: 'packages/engine/src/b.ts', phrase: ' byte(s) to session ', reason: 'fixture' },
      ];
      const { problems, stale } = checkProduct(root, allowed);
      expect(problems).toEqual([]);
      expect(stale).toEqual(['packages/engine/src/b.ts: ALLOWED entry " byte(s) to session " matches nothing — remove it']);
    });

    it('reports the line of the piece that carries the marker, and its enclosing call', () => {
      const found = markersIn('const a = 1;\nwarn(`${a} record(s)`);\n', 'x.ts');
      expect(found).toEqual([{ line: 2, text: ' record(s)', callee: 'warn' }]);
    });
  });
});
