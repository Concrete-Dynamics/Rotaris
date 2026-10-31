import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flushDirectory, flushFile } from './flush.js';

/**
 * REQ-STARTUP-176 — the real ports, which no other test reaches: `strategies.test.ts` pins the order over fakes and
 * `flush.test.ts` runs the flushes against a real file system, but until this test nothing joined the two, so replacing
 * `electron.ts`'s two flush ports with no-ops left the whole updater suite green while the artifact the user runs on
 * Windows was installed through an unflushed rename again. `electron.ts` is the composition root over Electron and
 * cannot be run in a test, so the wiring is read from its source — the one fact this test needs, as
 * `../launch-artifact.test.ts` reads `index.ts` for the same reason — and the function it names is then called for real.
 */
const source = readFileSync(join(import.meta.dirname, 'electron.ts'), 'utf8');

/** The text of `createUpdaterPorts`'s `files` port object, which is where the swap's operations are bound. */
const filesPort = (): string => {
  const start = source.indexOf('files: {');
  expect(start, "electron.ts has no 'files: {' port object").toBeGreaterThan(0);
  const end = source.indexOf('spawn: {', start);
  expect(end, "electron.ts has no 'spawn: {' after its files port").toBeGreaterThan(start);
  return source.slice(start, end);
};

/** A port bound to the function of its name: shorthand, a direct reference, or an arrow handing its parameter on. A no-op matches none. */
const boundTo = (name: string): RegExp => new RegExp(`\\b${name}(?:\\s*,|\\s*:\\s*${name}\\s*,|\\s*:\\s*(?:async\\s*)?\\((\\w+)\\)\\s*=>\\s*(?:await\\s+)?${name}\\(\\1\\))`);

describe("the portable swap's real ports flush, and flush with the real implementations (REQ-STARTUP-176)", () => {
  it('electron.ts imports the two flushes from flush.js rather than doing nothing itself', () => {
    const names = /import \{([^}]*)\} from '\.\/flush\.js';/.exec(source)?.[1] ?? '';
    expect(names).toMatch(/\bflushFile\b/);
    expect(names).toMatch(/\bflushDirectory\b/);
  });

  it('the files port binds flushFile and flushDirectory to those functions, and neither is a no-op', () => {
    // The mutation this catches: `flushFile: async () => undefined,`, with or without a parameter — green everywhere else
    // in the suite, and the portable swap would again rename a copy nothing had flushed.
    const port = filesPort();
    expect(port).toMatch(boundTo('flushFile'));
    expect(port).toMatch(boundTo('flushDirectory'));
  });

  it('the functions the ports name are the ones that issue the sync, against a real medium', async () => {
    // The same two functions `electron.ts` imports, called here: a no-op cannot reject on an absent path, and these do.
    expect(flushFile).toBeTypeOf('function');
    expect(flushDirectory).toBeTypeOf('function');
    const absent = join(import.meta.dirname, 'no-such-artifact-to-flush.exe');
    await expect(flushFile(absent)).rejects.toThrow();
    await expect(flushDirectory(absent, 'linux')).rejects.toThrow();
  });
});
