import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, realpathSync } from 'node:fs';
import { nodeClocks, type GroupMember } from '@rotaris/platform';
import { BackgroundManager, missedSigint, SIGINT_RECHECK_BORN_WITHIN_TICKS, type BackgroundSession } from './background.js';

/**
 * OQ-135 (REQ-TOOLS-110, REQ-TOOLS-128; OQ-10 as ruled in R-044), acceptance finding A8: where `/bin/sh` is `dash`, a
 * SIGINT that reaches a command between `dash`'s `vfork` and its `exec` is discarded by the command, and the shell holds
 * its own copy until the command ends. "Sent SIGINT" was reported while the session ran on: 45 of 200 `sleep 30`
 * sessions signalled the instant they started were still running 3 s later under six CPU burners, measured through this
 * manager on the branch before the repair (`docs/defects/fixed/a-sigint-that-reaches-a-command-as-sh-starts-it-does-not-stop-the-session.md`).
 */
describe('OQ-135: which members of a still-running group never received the SIGINT', () => {
  const m = (pid: number, startTicks: number, sigint: GroupMember['sigint'], state = 'S'): GroupMember => ({ pid, state, startTicks, sigint });
  const sent = 100_000;

  it('the command dash was starting: at the default, alive, created an instant before the signal', () => {
    expect(missedSigint([m(10, 90_000, 'caught'), m(11, sent, 'default')], sent, new Set())).toEqual([11]);
  });

  it('spares a process that catches, ignores, blocks or already holds SIGINT, a dead one, and one already sent it again', () => {
    for (const standing of ['caught', 'ignored', 'blocked', 'pending'] as const) expect(missedSigint([m(11, sent, standing)], sent, new Set())).toEqual([]);
    expect(missedSigint([m(11, sent, 'default', 'Z'), m(12, sent, 'default', 'X')], sent, new Set())).toEqual([]);
    expect(missedSigint([m(11, sent, 'default')], sent, new Set([11]))).toEqual([]);
  });

  it('spares one that started long before the signal — a handler that restored the default after its first SIGINT — and one started after it', () => {
    expect(missedSigint([m(11, sent - SIGINT_RECHECK_BORN_WITHIN_TICKS - 1, 'default')], sent, new Set())).toEqual([]);
    expect(missedSigint([m(11, sent - SIGINT_RECHECK_BORN_WITHIN_TICKS, 'default')], sent, new Set())).toEqual([11]);
    expect(missedSigint([m(11, sent + 1, 'default')], sent, new Set())).toEqual([]);
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
    for (let attempt = 0; attempt < 40 && !hit; attempt++) {
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

  it('a command that restores the default after its first SIGINT is not sent a second while it shuts down', async () => {
    const m = make();
    const node = process.execPath;
    const script = "process.once('SIGINT',()=>{setTimeout(()=>{console.log('clean exit');process.exit(0)},2000)});console.log('up');setInterval(()=>{},1000)";
    const r = m.start(`'${node}' -e "${script}"`, 60);
    if (!r.ok) throw new Error(r.error);
    for (let i = 0; i < 400 && !r.session.readAll().includes('up'); i++) await new Promise((res) => setTimeout(res, 25));
    // Started more than the bound before the signal: past the instant the window can hold.
    await new Promise((res) => setTimeout(res, 1_200));
    r.session.signal('SIGINT');
    expect(await ended(r.session, 6_000)).toBe(true);
    expect(r.session.readAll()).toContain('clean exit');
    expect(warnings).toEqual([]);
  }, 20_000);
});
