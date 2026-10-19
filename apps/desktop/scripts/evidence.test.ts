import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main, parseArgs } from './evidence.mjs';

const made = [];
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-cli-'));
  made.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function capture() {
  const out = [];
  const err = [];
  return { out, err, io: { out: (text) => { out.push(text); }, err: (text) => { err.push(text); } } };
}

describe('evidence — arguments', () => {
  it('reads the command, the directory and the flags, and refuses an unknown flag', () => {
    expect(parseArgs(['write', 'pack', '--kind=proof', '--label=x y', '--json'])).toMatchObject({ command: 'write', dir: 'pack', kind: 'proof', label: 'x y', json: true, unknown: [] });
    expect(parseArgs(['verify', 'pack', '--force']).unknown).toEqual(['--force']);
    expect(parseArgs(['--help']).help).toBe(true);
  });
});

describe('evidence — the command', () => {
  it('writes a manifest and verifies it', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'results.json'), '{}');
    const written = capture();
    expect(main(['write', dir, '--kind=live-run', '--label=k · ask'], written.io)).toBe(0);
    expect(written.out.join('')).toContain('1 file, 2 bytes');
    expect(written.out.join('')).toContain('live-run: k · ask');
    const verified = capture();
    expect(main(['verify', dir], verified.io)).toBe(0);
    expect(verified.out.join('')).toContain('PASS');
    expect(verified.out.join('')).toContain('1 file, 2 bytes');
  });

  it('a changed file fails the verification with exit 1 and names it', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'a.txt'), 'one');
    main(['write', dir], capture().io);
    writeFileSync(join(dir, 'a.txt'), 'two');
    const run = capture();
    expect(main(['verify', dir], run.io)).toBe(1);
    expect(run.err.join('')).toContain('changed: a.txt');
    expect(run.err.join('')).toContain('1 difference');
  });

  it('a directory without a manifest is a usage error, not a mismatch', () => {
    const run = capture();
    expect(main(['verify', scratch()], run.io)).toBe(2);
    expect(run.err.join('')).toContain('pnpm evidence write');
  });

  it('refuses an unknown command, a missing directory and one absent on disk', () => {
    expect(main(['inspect', 'x'], capture().io)).toBe(2);
    expect(main(['write'], capture().io)).toBe(2);
    const gone = scratch();
    rmSync(gone, { recursive: true, force: true });
    expect(main(['write', gone], capture().io)).toBe(2);
  });

  it('--json prints the verification result', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'a.txt'), 'x');
    main(['write', dir], capture().io);
    const run = capture();
    expect(main(['verify', dir, '--json'], run.io)).toBe(0);
    expect(JSON.parse(run.out.join(''))).toMatchObject({ ok: true, files: 1 });
  });
});
