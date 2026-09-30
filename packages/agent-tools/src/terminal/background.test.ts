import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, realpathSync } from 'node:fs';
import { nodeClocks, type GroupMember } from '@rotaris/platform';
import { BackgroundManager, missedSigint, shellComm, type BackgroundSession } from './background.js';

/**
 * OQ-135 (REQ-TOOLS-110, REQ-TOOLS-128; OQ-10 as ruled in R-044), acceptance finding A8: where `/bin/sh` is `dash`, a
 * SIGINT that reaches a command between `dash`'s `vfork` and its `exec` is discarded by the command, and the shell holds
 * its own copy until the command ends. "Sent SIGINT" was reported while the session ran on: 45 of 200 `sleep 30`
 * sessions signalled the instant they started were still running 3 s later under six CPU burners, measured through this
 * manager on the branch before the repair (`docs/defects/fixed/a-sigint-that-reaches-a-command-as-sh-starts-it-does-not-stop-the-session.md`).
 */
describe('OQ-135: which members of a still-running group never received the SIGINT', () => {
  const m = (pid: number, comm: string, sigint: GroupMember['sigint'], state = 'S'): GroupMember => ({ pid, comm, state, sigint });

  it('the command dash was starting: the shell holding SIGINT off before the signal, now another image at the default', () => {
    // As the reading of an aimed signal found them: the shell that vforked (10) and its child in the window (11), both
    // blocking signals across the vfork; then the child exec'd `sleep` and stands at the default.
    expect(missedSigint([m(10, 'sh', 'blocked'), m(11, 'sh', 'blocked')], [m(10, 'sh', 'caught'), m(11, 'sleep', 'default')], 'sh', new Set())).toEqual([11]);
    expect(missedSigint([m(11, 'sh', 'caught')], [m(11, 'sleep', 'default')], 'sh', new Set())).toEqual([11]);
    expect(missedSigint([m(11, 'sh', 'pending')], [m(11, 'sleep', 'default')], 'sh', new Set())).toEqual([11]);
    // A shell image at the default or ignoring SIGINT was not holding it off: dead of it, or (an `&` command) never taking it.
    for (const standing of ['default', 'ignored'] as const) expect(missedSigint([m(11, 'sh', standing)], [m(11, 'sleep', 'default')], 'sh', new Set())).toEqual([]);
    // The shell exec'ing the command itself (`exec cmd`, or dash's lone command): the group leader is the one in the window.
    expect(missedSigint([m(10, 'sh', 'caught')], [m(10, 'node', 'default')], 'sh', new Set())).toEqual([10]);
  });

  it('spares a member the reading found already running the command, whatever it did with the signal — a one-shot handler included', () => {
    // `process.once('SIGINT')`: caught before, at the default after its handler ran — received, and shutting down.
    expect(missedSigint([m(11, 'node', 'caught')], [m(11, 'node', 'default')], 'sh', new Set())).toEqual([]);
    // At the default before and after: had it received the signal it would be gone; had it not, it was not in the window.
    expect(missedSigint([m(11, 'sleep', 'default')], [m(11, 'sleep', 'default')], 'sh', new Set())).toEqual([]);
  });

  it('spares a shell still the shell, a command now catching, ignoring, blocking or holding SIGINT, a dead one, one already sent it again, and one started after the signal', () => {
    const before = [m(11, 'sh', 'caught')];
    expect(missedSigint(before, [m(11, 'sh', 'caught')], 'sh', new Set())).toEqual([]);
    for (const standing of ['caught', 'ignored', 'blocked', 'pending'] as const) expect(missedSigint(before, [m(11, 'sleep', standing)], 'sh', new Set())).toEqual([]);
    expect(missedSigint(before, [m(11, 'sleep', 'default', 'Z')], 'sh', new Set())).toEqual([]);
    expect(missedSigint(before, [m(11, 'sleep', 'default', 'X')], 'sh', new Set())).toEqual([]);
    expect(missedSigint(before, [m(11, 'sleep', 'default')], 'sh', new Set([11]))).toEqual([]);
    expect(missedSigint(before, [m(12, 'cleanup', 'default')], 'sh', new Set())).toEqual([]);
    // A member the shell was not: the reading's other names are not the window.
    expect(missedSigint([m(11, 'make', 'caught')], [m(11, 'cc', 'default')], 'sh', new Set())).toEqual([]);
  });

  it('names the shell as the kernel does: the file\'s base name, cut to 15 characters', () => {
    expect(shellComm('/bin/sh')).toBe('sh');
    expect(shellComm('/usr/local/bin/a-very-long-shell-name')).toBe('a-very-long-she');
  });
});

// Not applicable where `/bin/sh` is not `dash` (macOS's is `bash`, which blocks signals across its fork) or off Linux.
const dash = process.platform === 'linux' && (() => { try { return realpathSync('/bin/sh').endsWith('dash'); } catch { return false; } })();

describe.skipIf(!dash)('OQ-135 through the manager, against the host\'s own dash and /proc (Linux)', () => {
  const clocks = nodeClocks();
  const warnings: string[] = [];
  let manager: BackgroundManager | null = null;
  afterEach(async () => { await manager?.dispose(); manager = null; warnings.length = 0; });
  const make = () => (manager = new BackgroundManager({ backend: { kind: 'posix', file: '/bin/sh' }, cwd: '/tmp', env: { PATH: process.env['PATH'] ?? '' }, monotonic: clocks.monotonic, wall: clocks.wall, timers: clocks.timers, maxSessions: 100, warn: (w) => warnings.push(w) }));
  const read = (p: string): string => { try { return readFileSync(p, 'utf8').trim(); } catch { return ''; } };
  /** Resolves once the session's process has exited, or false after `ms`. */
  const ended = (s: BackgroundSession, ms: number) => Promise.race([s.whenExited().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), ms))]);

  it('REQ-TOOLS-128 / R-044: a SIGINT that lands while dash is starting the command still stops the session', async () => {
    const m = make();
    let hit = false;
    // About 1 aimed attempt in 37 lands in the window (10, 11 and 10 of about 385 measured on 2026-09-30, with the
    // reading taken before the signal), so 400 leave a miss about 2 in 100 000; a miss costs a few ms, a hit ~250 ms.
    for (let attempt = 0; attempt < 400 && !hit; attempt++) {
      const r = m.start('sleep 30', 60);
      if (!r.ok) throw new Error(r.error);
      // The shell's pid, which leads the session's group (the session keeps its process private).
      const pid = (r.session as unknown as { readonly child: { readonly pid: number } }).child.pid;
      // Aim the signal into the window: wait, busily, for dash's child to appear, and send while it has not yet exec'd.
      const by = (clocks.monotonic.now() as number) + 2_000;
      let aimed = false;
      while ((clocks.monotonic.now() as number) < by) {
        const kid = read(`/proc/${pid}/task/${pid}/children`).split(' ')[0] ?? '';
        if (kid === '') continue;
        aimed = ['sh', 'dash'].includes(read(`/proc/${kid}/comm`));
        break;
      }
      const before = warnings.length;
      expect(r.session.signal('SIGINT')).toBe(true);
      // The session stops — the repaired delivery's checks run at 250 ms and 1.5 s — however the signal landed.
      expect(await ended(r.session, 4_000)).toBe(true);
      expect(r.session.status).toBe('killed');
      hit = aimed && warnings.length > before;
    }
    // At least one attempt landed in the window, so the case measured the repair and not only the ordinary delivery.
    expect(hit).toBe(true);
    expect(warnings.some((w) => /never received it \(the shell's vfork window, OQ-135\); SIGINT sent to it once more$/.test(w))).toBe(true);
  }, 120_000);

  it('a command that catches SIGINT and takes its time to stop is sent it once, and finishes its shutdown', async () => {
    const m = make();
    const node = process.execPath;
    const script = "let n=0;process.on('SIGINT',()=>{n++;if(n===1)setTimeout(()=>{console.log('clean exit after '+n);process.exit(0)},2000)});console.log('up');setInterval(()=>{},1000)";
    const r = m.start(`'${node}' -e "${script}"`, 60);
    if (!r.ok) throw new Error(r.error);
    for (let i = 0; i < 400 && !r.session.readAll().includes('up'); i++) await new Promise((res) => setTimeout(res, 25));
    r.session.signal('SIGINT');
    expect(await ended(r.session, 6_000)).toBe(true);
    expect(r.session.readAll()).toContain('clean exit after 1');
    expect(warnings).toEqual([]);
  }, 20_000);

  // The verifier's case: `process.once` restores the default as its handler runs, so the process stands at the default
  // afterwards as the command in the window does. Signalled an instant after it started, the first reading sent it a
  // second SIGINT and cut its shutdown off. Both shapes: the shell exec'ing the command, and the shell forking it.
  for (const prefix of ['exec ', ''] as const) {
    it(`a command that restores the default after its first SIGINT, signalled the instant it is up, is not sent a second (${prefix === '' ? 'forked' : 'exec'})`, async () => {
      const m = make();
      const node = process.execPath;
      const script = "process.once('SIGINT',()=>{setTimeout(()=>{console.log('clean exit');process.exit(0)},2000)});console.log('up');setInterval(()=>{},1000)";
      const r = m.start(`${prefix}'${node}' -e "${script}"`, 60);
      if (!r.ok) throw new Error(r.error);
      for (let i = 0; i < 2_000 && !r.session.readAll().includes('up'); i++) await new Promise((res) => setTimeout(res, 2));
      r.session.signal('SIGINT');
      expect(await ended(r.session, 6_000)).toBe(true);
      expect(r.session.readAll()).toContain('clean exit');
      expect(warnings).toEqual([]);
    }, 20_000);
  }

  it('a command that restores the default after its first SIGINT is not sent a second while it shuts down', async () => {
    const m = make();
    const node = process.execPath;
    const script = "process.once('SIGINT',()=>{setTimeout(()=>{console.log('clean exit');process.exit(0)},2000)});console.log('up');setInterval(()=>{},1000)";
    const r = m.start(`'${node}' -e "${script}"`, 60);
    if (!r.ok) throw new Error(r.error);
    for (let i = 0; i < 400 && !r.session.readAll().includes('up'); i++) await new Promise((res) => setTimeout(res, 25));
    // Signalled well after it started; the case below signals it the instant it is up.
    await new Promise((res) => setTimeout(res, 1_200));
    r.session.signal('SIGINT');
    expect(await ended(r.session, 6_000)).toBe(true);
    expect(r.session.readAll()).toContain('clean exit');
    expect(warnings).toEqual([]);
  }, 20_000);
});
