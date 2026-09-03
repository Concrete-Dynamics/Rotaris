import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { nodeClocks } from '@rotaris/platform';
import type { HookEntry } from '@rotaris/config';
import { capStream, interpreterFor, invokeHook } from './runner.js';
import { serializePayload } from './payload.js';

/**
 * ADR-0015's runner against the REAL interpreter of this host (REQ-HOOKS-030): what cmd.exe does with a
 * command handed as one verbatim argument, what a 60 s sleep under a 0.3 s budget costs, what a
 * grandchild holding the pipe open does to output collection. Under vitest's own timers.
 */
const win = process.platform === 'win32';
const clocks = nodeClocks();
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'rotaris-hook-run-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const env = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined));
const h = (command: string, over: Partial<HookEntry> = {}): HookEntry => ({ id: 'global:0:pre_tool', event: 'pre_tool', command, name: 'T', matcher: '', timeoutSeconds: 10, required: false, enabled: true, source: 'global', index: 0, ...over });
const payload = serializePayload({ event: 'pre_tool', tool_name: 't', arguments: { a: 1 }, session_id: 's', workspace: 'w', command: '' });
// The working directory is the OS temp directory itself: a killed child or a surviving grandchild may still hold it, so no per-test directory is removed under it.
const run = (hook: HookEntry, cwd = tmpdir()) => invokeHook(hook, payload, { cwd, env, timers: clocks.timers, monotonic: clocks.monotonic });

describe('the interpreter', () => {
  it('REQ-HOOKS-030: fixed by platform, never by the command', () => {
    expect(interpreterFor('echo x && rm', 'win32', { ComSpec: 'C:\\W\\cmd.exe' })).toEqual({ command: 'C:\\W\\cmd.exe', args: ['/c', 'echo x && rm'], verbatim: true });
    expect(interpreterFor('x', 'win32', {})).toMatchObject({ command: 'cmd.exe' });
    expect(interpreterFor('x', 'linux', {})).toEqual({ command: '/bin/sh', args: ['-c', 'x'], verbatim: false });
  });
  it('REQ-HOOKS-037: the cap is per stream, at a character boundary, the marker beyond it', () => {
    const enc = new TextEncoder();
    const small = enc.encode('abc');
    expect(capStream([small], 3)).toBe('abc');
    const big = enc.encode('é'.repeat(9000)); // 18,000 bytes; 16,384 is not a boundary (odd/even)
    const out = capStream([big], big.length);
    expect(out.endsWith('\n[truncated: 18000 bytes of output, 16384 kept]')).toBe(true);
    const kept = out.slice(0, out.indexOf('\n[truncated'));
    expect(enc.encode(kept).length).toBeLessThanOrEqual(16_384);
    expect(kept).toBe('é'.repeat(8192));
    const bad = new Uint8Array([0x61, 0xff, 0x62]);
    expect(capStream([bad], 3)).toBe('a\uFFFDb');
  });
});

describe.skipIf(!win)('invocations on this host (cmd.exe)', () => {
  it('exit 0 with stdout; exit 2 with stderr; the payload arrives byte-exact on stdin; operators and quoting take effect', async () => {
    const ok = await run(h('echo hello'));
    expect(ok).toMatchObject({ exitCode: 0, timedOut: false, launchFailure: '', signalled: false });
    expect(ok.stdout.trim()).toBe('hello');
    const two = await run(h('echo refused 1>&2 && exit 2'));
    expect(two.exitCode).toBe(2);
    expect(two.stderr.trim()).toBe('refused');
    // node reads stdin to the end and echoes its length and last byte
    const cat = await run(h(`node -e "let b=[];process.stdin.on('data',d=>b.push(d)).on('end',()=>{const x=Buffer.concat(b);process.stdout.write(x.length+' '+x[x.length-1])})"`));
    expect(cat.exitCode).toBe(0);
    expect(cat.stdout.trim()).toBe(`${payload.length} ${'}'.charCodeAt(0)}`);
    const quoted = await run(h('echo "a  b" && echo c'));
    // cmd.exe keeps the space before `&&` in what echo prints: the command ran as typed, which is the point.
    expect(quoted.stdout.replace(/\r/g, '')).toBe('"a  b" \nc\n');
  });
  it('REQ-HOOKS-033: a 60 s sleep under a 0.3 s budget returns far inside 60 s, timed out, no exit status', async () => {
    const started = Date.now();
    const o = await run(h('node -e "setTimeout(()=>{},60000)"', { timeoutSeconds: 0.3 }));
    const elapsed = Date.now() - started;
    expect(o.timedOut).toBe(true);
    expect(o.exitCode).toBe(-1);
    expect(elapsed).toBeLessThan(6_000);
    expect(o.durationMs).toBeGreaterThanOrEqual(250);
  });
  it('REQ-HOOKS-033: a grandchild holding the pipe open does not stall collection; the hook resolves on exit plus the grace', async () => {
    // the hook starts a detached grandchild that inherits the pipes and sleeps 30 s, then the hook exits 0
    const started = Date.now();
    const o = await run(h(`node -e "require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{stdio:'inherit',detached:true}).unref();process.stdout.write('parent done')"`));
    const elapsed = Date.now() - started;
    expect(o.exitCode).toBe(0);
    expect(o.timedOut).toBe(false);
    expect(o.stdout).toContain('parent done');
    expect(elapsed).toBeLessThan(9_000);
  }, 20_000);
  it('REQ-HOOKS-035: a missing working directory is a launch failure with no exit status and empty output', async () => {
    const o = await run(h('echo x'), join(tmp(), 'does-not-exist'));
    expect(o.exitCode).toBe(-1);
    expect(o.launchFailure).not.toBe('');
    expect(o.stdout).toBe('');
  });
  it('REQ-HOOKS-037: 20 KB per stream is cut at 16,384 bytes with the total in the marker; a hook writing before it reads does not stall', async () => {
    const o = await run(h(`node -e "process.stdout.write('x'.repeat(20000));process.stderr.write('y'.repeat(20000));process.stdin.resume()"`));
    expect(o.exitCode).toBe(0);
    expect(o.stdout.endsWith('\n[truncated: 20000 bytes of output, 16384 kept]')).toBe(true);
    expect(o.stderr.endsWith('\n[truncated: 20000 bytes of output, 16384 kept]')).toBe(true);
    expect(o.stdout.indexOf('\n[truncated')).toBe(16_384);
  });
});
