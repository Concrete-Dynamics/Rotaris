/**
 * The run host is typechecked without the DOM (R-091, `docs/architecture/hardening.md` §3.5 row 5; ADR-0002), although the
 * terminal emulator it runs imports `@xterm/addon-serialize`, whose typings import `@xterm/xterm`'s, which open with
 * `/// <reference lib="dom" />`. `tsconfig.run-host.json` maps `@xterm/xterm` to
 * `packages/agent-tools/src/terminal/xterm-api.d.ts`, so that reference is never read. This pins:
 * - a program built with the run host's options over a file holding the emulator's two imports and a `document` refuses
 *   the `document`, and reads neither the DOM library nor `@xterm/xterm`'s typings;
 * - the run host's `paths` repeat the base's every entry (`paths` replaces the base's whole), so a package added to the
 *   base resolves the same way in the run host's program.
 * The program holds the probe and what it imports alone, so this runs in seconds where `pnpm typecheck` takes minutes.
 */
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..').split('\\').join('/');

function options(project: string): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(join(root, project), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); },
  });
  if (parsed === undefined) throw new Error(`${project} did not parse`);
  return parsed.options;
}

/** The probe stands, in memory only, where the emulator stands, so its imports resolve as `emulator.ts`'s do. */
const PROBE = `${root}/packages/agent-tools/src/terminal/typecheck-projects-probe.ts`;
const PROBE_TEXT = [
  "import { Terminal } from '@xterm/headless';",
  "import { SerializeAddon } from '@xterm/addon-serialize';",
  'new Terminal({ allowProposedApi: true }).loadAddon(new SerializeAddon());',
  'export const title: string = document.title;',
].join('\n');

function probe(compilerOptions: ts.CompilerOptions) {
  const host = ts.createCompilerHost(compilerOptions);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  host.getSourceFile = (name, version, ...rest) =>
    name === PROBE ? ts.createSourceFile(name, PROBE_TEXT, version) : getSourceFile(name, version, ...rest);
  host.fileExists = (name) => name === PROBE || fileExists(name);
  host.readFile = (name) => (name === PROBE ? PROBE_TEXT : readFile(name));
  const program = ts.createProgram([PROBE], compilerOptions, host);
  const source = program.getSourceFile(PROBE);
  if (source === undefined) throw new Error('the probe is not in its program');
  return {
    errors: ts.getPreEmitDiagnostics(program, source).map((d) => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`),
    files: program.getSourceFiles().map((f) => f.fileName),
  };
}

describe("the run host's typecheck (tsconfig.run-host.json)", () => {
  it('refuses a `document` in a program that holds the terminal emulator', () => {
    const { errors, files } = probe(options('tsconfig.run-host.json'));
    expect(errors).toEqual([expect.stringMatching(/^TS2584: Cannot find name 'document'/)]);
    expect(files.filter((f) => /\/lib\.dom(\.[a-z]+)?\.d\.ts$/.test(f))).toEqual([]);
    expect(files.filter((f) => f.includes('/@xterm/xterm/'))).toEqual([]);
    expect(files).toContain(`${root}/packages/agent-tools/src/terminal/xterm-api.d.ts`);
  });

  it("repeats the base's every path, and adds only the emulator's", () => {
    const base = options('tsconfig.base.json').paths ?? {};
    const runHost = options('tsconfig.run-host.json').paths ?? {};
    const { ['@xterm/xterm']: xterm, ...rest } = runHost;
    expect(rest).toEqual(base);
    expect(xterm).toEqual(['./packages/agent-tools/src/terminal/xterm-api.d.ts']);
  });
});
