import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { nodeClocks } from '@rotaris/platform';
import type { HookEntry } from '@rotaris/config';
import { capStream, interpreterFor, invokeHook } from './runner.js';
import { decide } from './verdict.js';
import { serializePayload } from './payload.js';

/**
 * ADR-0015's runner against the REAL interpreter of this host (REQ-HOOKS-030): what the platform's command
 * processor does with a command handed as one argument, what a 60 s sleep under a 0.3 s budget costs, what a
 * grandchild holding the pipe open does to output collection. Under vitest's own timers.
 *
 * REQ-HOOKS-030 fixes that interpreter BY PLATFORM — `cmd.exe /c` on Windows, `/bin/sh -c` everywhere else —
 * so the invocations below are one set of proofs written once and spelled twice. They ran on Windows alone
 * until 2026-09-16, which left the `/bin/sh` half of the requirement, and every mechanic ADR-0015 rests on,
 * executed by nothing on a POSIX host. What a command SAYS differs per shell; what the outcome must be does
 * not, so only the command text and the two expectations the shell itself decides live in the table below.
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
const run = (hook: HookEntry, cwd = tmpdir(), bytes = payload) => invokeHook(hook, bytes, { cwd, env, timers: clocks.timers, monotonic: clocks.monotonic });

/**
 * The per-interpreter spellings. A `node -e "…"` command is NOT one of them: every script below is free of
 * `$`, of a backtick and of a backslash, so `cmd.exe` and `/bin/sh` both hand it to node unchanged, and the
 * proofs that carry one are the same bytes on both platforms.
 */
const SH = win
  ? {
      name: 'cmd.exe',
      // cmd.exe keeps the space before `&&` in what echo prints, and keeps the quotes: the command ran as typed, which is the point.
      quoting: { command: 'echo "a  b" && echo c', stdout: '"a  b" \nc\n' },
      // A separator and a substitution THIS shell would honour, carried as a tool argument (REQ-HOOKS-031).
      injection: (marker: string) => ({ path: `x" & type nul > ${marker} & echo "`, note: `%COMSPEC% & copy nul ${marker}` }),
      // Never measured: no Windows host has run this file since the proof was written. The portable half is asserted for both.
      notFound: { command: 'rotaris-no-such-executable-xyz', stderr: null as RegExp | null },
    }
  : {
      name: '/bin/sh',
      // `sh` strips the quotes and hands echo two words, which is the opposite of cmd.exe and the same point: the shell interpreted the line.
      quoting: { command: 'echo "a  b" && echo c', stdout: 'a  b\nc\n' },
      injection: (marker: string) => ({ path: `x"; touch ${marker}; echo "`, note: `$(touch ${marker})` }),
      notFound: { command: 'rotaris-no-such-executable-xyz', stderr: /not found/ as RegExp | null },
    };

describe('the interpreter', () => {
  it('REQ-HOOKS-030: fixed by platform, never by the command', () => {
    expect(interpreterFor('echo x && rm', 'win32', { ComSpec: 'C:\\W\\cmd.exe' })).toEqual({ command: 'C:\\W\\cmd.exe', args: ['/c', 'echo x && rm'], verbatim: true });
    expect(interpreterFor('x', 'win32', {})).toMatchObject({ command: 'cmd.exe' });
    expect(interpreterFor('x', 'linux', {})).toEqual({ command: '/bin/sh', args: ['-c', 'x'], verbatim: false });
    expect(interpreterFor('x', 'darwin', {})).toEqual({ command: '/bin/sh', args: ['-c', 'x'], verbatim: false });
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

describe(`invocations on this host (${SH.name})`, () => {
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
    const quoted = await run(h(SH.quoting.command));
    expect(quoted.stdout.replace(/\r/g, '')).toBe(SH.quoting.stdout);
  });
  it('REQ-HOOKS-030: executable lookup is the interpreter\'s, so an unknown name is an exit status and not a launch failure', async () => {
    const o = await run(h(SH.notFound.command));
    // REQ-HOOKS-035 is reserved for a process that never started; this one started, and the SHELL refused the name.
    expect(o.launchFailure).toBe('');
    expect(o.exitCode).toBeGreaterThan(0);
    if (SH.notFound.stderr) expect(o.stderr).toMatch(SH.notFound.stderr);
  });
  it('REQ-HOOKS-031: no part of the payload reaches the command line or the environment, so a separator this shell honours is inert', async () => {
    const marker = join(tmp(), 'must-not-exist');
    const nonce = 'rot-nonce-8f2a1c';
    const bytes = serializePayload({ event: 'pre_tool', tool_name: nonce, arguments: SH.injection(marker), session_id: 's', workspace: 'w', command: '' });
    const o = await run(h(`node -e "let b=[];process.stdin.on('data',d=>b.push(d)).on('end',()=>{const x=Buffer.concat(b);process.stdout.write(x.length+' '+(Object.values(process.env).some(v=>v.includes('${nonce}'))?'leaked':'clean'))})"`), tmpdir(), bytes);
    // The whole document arrived on stdin, nothing ran, and no environment variable carries it.
    expect(o.stdout.trim()).toBe(`${bytes.length} clean`);
    expect(existsSync(marker)).toBe(false);
  });
  it('REQ-HOOKS-033: a 60 s sleep under a 0.3 s budget returns far inside 60 s, timed out, no exit status', async () => {
    const started = Date.now();
    const o = await run(h('node -e "setTimeout(()=>{},60000)"', { timeoutSeconds: 0.3 }));
    const elapsed = Date.now() - started;
    expect(o.timedOut).toBe(true);
    expect(o.exitCode).toBe(-1);
    // The bound is the budget plus the 5.0 s grace plus one process start, and whether the grace is SPENT is
    // the shell's choice, not this runner's: an interpreter that exec'd the command dies with it and resolves
    // at once, one that forked it leaves the command holding the pipes and pays the grace in full. Measured
    // both ways — 5,334 ms on cmd.exe (2026-09-03), 5,306 ms on dash (2026-09-16) — so only the bound is asserted.
    expect(elapsed).toBeLessThan(6_000);
    expect(o.durationMs).toBeGreaterThanOrEqual(250);
  }, 20_000);
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

/**
 * REQ-HOOKS-039's signal path, which no platform but this one can reach: the outcome it describes is the
 * INTERPRETER ending on a signal, and a Windows command has no way to send one to the `cmd.exe` that started
 * it — `child.kill()` there is a TerminateProcess, which is the timeout path and is a different outcome. This
 * is the only proof in this file that is one platform's alone, and the reason is the platform's, not a skip.
 */
describe.runIf(!win)('the interpreter ended by a signal it did not get from the timeout path', () => {
  it('REQ-HOOKS-039: no exit status, signalled, not timed out, and REQ-HOOKS-052\'s abnormal-termination warning', async () => {
    const hook = h('kill -KILL $$'); // `$$` in `sh -c` is the shell's own pid, so the started process is the one that dies
    const o = await run(hook);
    expect(o).toMatchObject({ exitCode: -1, signalled: true, timedOut: false, launchFailure: '' });
    expect(decide(o, 't').warning).toBe("Hook 'T' (pre_tool) was ended before it could return an exit status.");
  }, 20_000);
});
