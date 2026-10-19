// The process helpers behind both wrappers: one command run with its output inherited or captured, and pnpm
// reached the way `tools/dev-time/dev-time.mjs` reaches it.
import { describe, expect, it } from 'vitest';
import { oneLine, pnpmCommand, run, seconds, shellCommand } from './exec.mjs';

describe('the process helpers', () => {
  it('quotes a Windows command line and leaves the tokens alone elsewhere', () => {
    const windows = shellCommand(['pnpm.cmd', 'run', 'check', 'a b'], 'win32');
    expect(windows.file).toBe('pnpm.cmd run check "a b"');
    expect(windows.shell).toBe(true);
    expect(shellCommand(['x', 'a"b'], 'win32').file).toBe('x "a""b"');
    const unix = shellCommand(['pnpm', 'run', 'check'], 'linux');
    expect(unix.file).toBe('pnpm');
    expect(unix.args).toEqual(['run', 'check']);
    expect(unix.shell).toBeUndefined();
  });

  it("prefers pnpm's own entry when the environment names one", () => {
    const viaEntry = pnpmCommand(['run', 'check'], { npm_execpath: 'C:\\tools\\pnpm.cjs' });
    expect(viaEntry.file).toBe(process.execPath);
    expect(viaEntry.args).toEqual(['C:\\tools\\pnpm.cjs', 'run', 'check']);
    const fallback = pnpmCommand(['run', 'check'], {});
    if (process.platform === 'win32') {
      expect(fallback.file).toBe('pnpm.cmd run check');
      expect(fallback.shell).toBe(true);
    } else {
      expect(fallback.file).toBe('pnpm');
      expect(fallback.args).toEqual(['run', 'check']);
    }
  });

  it('runs a command and captures its status and its streams', () => {
    const out = run(process.execPath, ['-e', 'process.stdout.write("hi")']);
    expect(out.status).toBe(0);
    expect(out.stdout).toBe('hi');
    const failed = run(process.execPath, ['-e', 'process.stderr.write("no"); process.exit(3)']);
    expect(failed.status).toBe(3);
    expect(failed.stderr).toBe('no');
  });

  it('reads the last line of a message, and formats a duration', () => {
    expect(oneLine('a\n\n b \n')).toBe('b');
    expect(oneLine('')).toBe('(no output)');
    expect(seconds(8200)).toBe('8.2 s');
    expect(seconds(410000)).toBe('6 m 50 s');
  });
});
