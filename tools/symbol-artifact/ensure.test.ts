import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureSymbolArtifact, symbolArtifactPlugin } from './ensure.mjs';

/**
 * ADR-0056's build input on the build path: a tree with no artifact gets one from the generator, a tree with one keeps
 * it untouched, and a generation that fails fails the build naming the file and `pnpm symbols`
 * (docs/defects/fixed/a-fresh-clone-cannot-build-until-pnpm-symbols-has-run.md). The generator here is a stand-in
 * written to a scratch directory, so the real artifact, which the running suite imports, is never removed.
 */
describe('ADR-0056: the build writes the requirement-symbol artifact when it is absent', () => {
  let dir: string;
  let artifact: string;
  let ran: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'symbol-ensure-'));
    artifact = join(dir, 'generated', 'requirements.ts');
    ran = join(dir, 'ran');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** A generator that leaves a mark that it ran, then does `body`. */
  const generator = (body: string): string => {
    const path = join(dir, 'generate.mjs');
    writeFileSync(
      path,
      `import { mkdirSync, writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(ran)}, '');\n${body}\n`,
    );
    return path;
  };
  const writes = (): string => `mkdirSync(${JSON.stringify(join(dir, 'generated'))}, { recursive: true });\nwriteFileSync(${JSON.stringify(artifact)}, 'export const REQ = {};\\n');`;

  it('runs the generator when the artifact does not exist, and the artifact then does', () => {
    expect(ensureSymbolArtifact({ artifact, generator: generator(writes()) })).toEqual({ generated: true });
    expect(existsSync(ran)).toBe(true);
    expect(readFileSync(artifact, 'utf8')).toBe('export const REQ = {};\n');
  });

  it('does not run the generator when the artifact exists: the test session and `pnpm symbols` keep it current', () => {
    const path = generator(writes());
    ensureSymbolArtifact({ artifact, generator: path });
    rmSync(ran);
    writeFileSync(artifact, 'the artifact a test session wrote\n');
    expect(ensureSymbolArtifact({ artifact, generator: path })).toEqual({ generated: false });
    expect(existsSync(ran)).toBe(false);
    expect(readFileSync(artifact, 'utf8')).toBe('the artifact a test session wrote\n');
  });

  it('fails, naming the artifact and `pnpm symbols`, when the generator fails', () => {
    const path = generator(`console.error('no requirement identifier was found'); process.exit(1);`);
    expect(() => ensureSymbolArtifact({ artifact, generator: path })).toThrow(
      new RegExp(`^symbol artifact: ${escape(artifact)} is missing and pnpm symbols \\(node ${escape(path)}\\) could not write it — `),
    );
    expect(existsSync(artifact)).toBe(false);
  });

  it('fails when the generator exits 0 and writes nothing: an exit status is not evidence of a file', () => {
    const path = generator('');
    expect(() => ensureSymbolArtifact({ artifact, generator: path })).toThrow(
      `symbol artifact: pnpm symbols (node ${path}) exited 0 and ${artifact} still does not exist`,
    );
    expect(existsSync(ran)).toBe(true);
  });

  it('runs at buildStart as a Vite plugin', () => {
    const plugin = symbolArtifactPlugin({ artifact, generator: generator(writes()) });
    plugin.buildStart();
    expect(existsSync(artifact)).toBe(true);
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
