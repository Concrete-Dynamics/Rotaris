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
const filesPort = ((): string => {
  const start = source.indexOf('files: {');
  expect(start).toBeGreaterThan(0);
  const end = source.indexOf('spawn: {', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
})();

describe("the portable swap's real ports flush, and flush with the real implementations (REQ-STARTUP-176)", () => {
  it('electron.ts imports the two flushes from flush.js rather than doing nothing itself', () => {
    expect(source).toMatch(/import \{[^}]*\bflushDirectory\b[^}]*\bflushFile\b[^}]*\} from '\.\/flush\.js';/);
  });

  it('the files port binds flushFile and flushDirectory to those functions', () => {
    expect(filesPort).toMatch(/flushFile: \(path\) => flushFile\(path\),/);
    expect(filesPort).toMatch(/flushDirectory: \(dir\) => flushDirectory\(dir\),/);
  });

  it('neither port is a no-op: both name a call, and neither swallows what it returns', () => {
    // The mutation this catches: `flushFile: async () => undefined,` — green everywhere else in the suite, and the
    // portable swap would again rename a copy nothing had flushed.
    expect(filesPort).not.toMatch(/flushFile: async \(\) =>/);
    expect(filesPort).not.toMatch(/flushDirectory: async \(\) =>/);
    expect(filesPort).not.toMatch(/flushFile: \(\) =>/);
    expect(filesPort).not.toMatch(/flushDirectory: \(\) =>/);
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
