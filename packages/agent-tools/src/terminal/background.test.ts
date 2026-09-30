import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { FakeClock } from '@rotaris/kernel';
import { nodeClocks, type GroupMember, type ProcessTable } from '@rotaris/platform';
import { BackgroundManager, missedSigint, shellComm, type BackgroundSession } from './background.js';

/**
 * OQ-135 (REQ-TOOLS-110, REQ-TOOLS-128; OQ-10 as ruled in R-044), acceptance finding A8: where `/bin/sh` is `dash`, a
 * SIGINT that reaches a command between `dash`'s `vfork` and its `exec` is discarded by the command, and the shell holds
 * its own copy until the command ends. "Sent SIGINT" was reported while the session ran on: 45 of 200 `sleep 30`
 * sessions signalled the instant they started were still running 3 s later under six CPU burners, measured through this
 * manager on the branch before the repair (`docs/defects/fixed/a-sigint-that-reaches-a-command-as-sh-starts-it-does-not-stop-the-session.md`).
 */
describe('OQ-135: which members of a still-running group never received the SIGINT', () => {
  const m = (pid: number, ppid: number, comm: string, sigint: GroupMember['sigint'], cmdline: string | null = null, state = 'S'): GroupMember => ({ pid, ppid, comm, state, sigint, cmdline });
  const none = new Set<number>();

  it('the command dash was starting: the shell holding SIGINT off before the signal, now another image at the default', () => {
    // As the reading of an aimed signal found them: the shell that vforked (10) and its child in the window (11), both
    // blocking signals across the vfork; then the child exec'd `sleep` and stands at the default.
    expect(missedSigint([m(10, 1, 'sh', 'blocked'), m(11, 10, 'sh', 'blocked')], [m(10, 1, 'sh', 'caught'), m(11, 10, 'sleep', 'default')], 'sh', none)).toEqual([11]);
    expect(missedSigint([m(11, 10, 'sh', 'caught')], [m(11, 10, 'sleep', 'default')], 'sh', none)).toEqual([11]);
    expect(missedSigint([m(11, 10, 'sh', 'pending')], [m(11, 10, 'sleep', 'default')], 'sh', none)).toEqual([11]);
    // The shell exec'ing the command itself (`exec cmd`, or dash's lone command): the group leader is the one in the window.
    expect(missedSigint([m(10, 1, 'sh', 'caught')], [m(10, 1, 'node', 'default')], 'sh', none)).toEqual([10]);
  });

  it('acceptance finding A8, round 3: the command that replaced the shell is named whatever it now does with SIGINT — Node, Python and a shell catch it as they start', () => {
    // Node's own handler, installed as it starts: the survivors read `sh`(caught) → `MainThread`(caught).
    expect(missedSigint([m(10, 1, 'sh', 'caught'), m(11, 10, 'sh', 'blocked')], [m(10, 1, 'sh', 'caught'), m(11, 10, 'MainThread', 'caught')], 'sh', none)).toEqual([11]);
    for (const standing of ['caught', 'ignored', 'blocked', 'pending', 'default'] as const) expect(missedSigint([m(11, 10, 'sh', 'caught')], [m(11, 10, 'python3', standing)], 'sh', none)).toEqual([11]);
    // A shell at the default in the reading that is alive after the signal caught it: it installed its handler in between.
    expect(missedSigint([m(10, 1, 'sh', 'default')], [m(10, 1, 'MainThread', 'caught')], 'sh', none)).toEqual([10]);
    // A shell ignoring SIGINT (an `&` command) was not holding it off: it, and what it runs, never take it.
    expect(missedSigint([m(11, 10, 'sh', 'ignored')], [m(11, 10, 'sleep', 'default')], 'sh', none)).toEqual([]);
  });

  it('acceptance finding A8, round 3: a shell that exec\'d a shell keeps its name, and is told by its arguments — with what it started since', () => {
    // `sh -c 'sleep 30; echo x'` as the survivors read: `sh`(caught) → `sh`(caught) → `sleep`(default). The middle shell was
    // dash's child in the window; the `sleep` it started after the signal never received it either.
    const before = [m(10, 1, 'sh', 'blocked', 'sh\0-c\0sh -c \'sleep 30; echo x\'\0'), m(11, 10, 'sh', 'blocked', 'sh\0-c\0sh -c \'sleep 30; echo x\'\0')];
    const now = [m(10, 1, 'sh', 'caught', 'sh\0-c\0sh -c \'sleep 30; echo x\'\0'), m(11, 10, 'sh', 'caught', 'sh\0-c\0sleep 30; echo x\0'), m(12, 11, 'sleep', 'default', 'sleep\x0030\0'), m(13, 12, 'helper', 'default', 'helper\0')];
    expect(missedSigint(before, now, 'sh', none)).toEqual([11, 12, 13]);
    // Unchanged arguments are the same image; arguments that cannot be read, or read empty, say nothing either way.
    expect(missedSigint(before, [now[0]!, m(11, 10, 'sh', 'caught', before[1]!.cmdline)], 'sh', none)).toEqual([]);
    for (const unread of [null, ''] as const) {
      expect(missedSigint(before, [now[0]!, m(11, 10, 'sh', 'caught', unread)], 'sh', none)).toEqual([]);
      expect(missedSigint([m(11, 10, 'sh', 'blocked', unread)], [m(11, 10, 'sh', 'caught', 'sh\0x.sh\0')], 'sh', none)).toEqual([]);
    }
  });

  it('acceptance finding A8, round 3: a shell that had started nothing and took the signal as it started — what it started since is named, the shell is not', () => {
    // The reading found dash at the default, installing its handler; it caught the signal, went on, and started `node`.
    expect(missedSigint([m(10, 1, 'sh', 'default')], [m(10, 1, 'sh', 'caught'), m(11, 10, 'MainThread', 'caught'), m(12, 11, 'worker', 'caught')], 'sh', none)).toEqual([11, 12]);
    expect(missedSigint([m(10, 1, 'sh', 'caught')], [m(10, 1, 'sh', 'caught'), m(11, 10, 'sleep', 'default')], 'sh', none)).toEqual([11]);
    // A shell that had started its command when the signal landed: the command received it, and what the shell starts
    // afterwards (the next command, a trap's clean-up) is not named.
    expect(missedSigint([m(10, 1, 'sh', 'caught'), m(11, 10, 'node', 'caught')], [m(10, 1, 'sh', 'caught'), m(11, 10, 'node', 'default'), m(12, 10, 'cleanup', 'default')], 'sh', none)).toEqual([]);
  });

  it('spares a member the reading found already running the command, whatever it did with the signal — a one-shot handler included', () => {
    // `process.once('SIGINT')`: caught before, at the default after its handler ran — received, and shutting down.
    expect(missedSigint([m(11, 10, 'node', 'caught')], [m(11, 10, 'node', 'default')], 'sh', none)).toEqual([]);
    // At the default before and after: had it received the signal it would be gone; had it not, it was not in the window.
    expect(missedSigint([m(11, 10, 'sleep', 'default')], [m(11, 10, 'sleep', 'default')], 'sh', none)).toEqual([]);
    // What such a command starts on receiving the signal — its clean-up — is not named either.
    expect(missedSigint([m(10, 1, 'sh', 'caught'), m(11, 10, 'node', 'caught')], [m(10, 1, 'sh', 'caught'), m(11, 10, 'node', 'default'), m(12, 11, 'cleanup', 'default')], 'sh', none)).toEqual([]);
    // A member the shell was not: the reading's other names are not the window.
    expect(missedSigint([m(11, 10, 'make', 'caught')], [m(11, 10, 'cc', 'default')], 'sh', none)).toEqual([]);
  });

  it('spares a dead member, one already sent it again and what that one started since, and one no reading holds', () => {
    const before = [m(10, 1, 'sh', 'caught'), m(11, 10, 'sh', 'caught')];
    expect(missedSigint(before, [m(10, 1, 'sh', 'caught'), m(11, 10, 'sleep', 'default', null, 'Z')], 'sh', none)).toEqual([]);
    expect(missedSigint(before, [m(10, 1, 'sh', 'caught'), m(11, 10, 'sleep', 'default', null, 'X')], 'sh', none)).toEqual([]);
    // At the second check: 11 was sent it at the first, and 12 is what it started since — its clean-up, perhaps.
    expect(missedSigint(before, [m(10, 1, 'sh', 'caught'), m(11, 10, 'node', 'default'), m(12, 11, 'cleanup', 'default')], 'sh', new Set([11]))).toEqual([]);
    expect(missedSigint(before, [m(10, 1, 'sh', 'caught'), m(12, 10, 'cleanup', 'default')], 'sh', none)).toEqual([]);
  });

  it('names the shell as the kernel does: the file\'s base name, cut to 15 characters', () => {
    expect(shellComm('/bin/sh')).toBe('sh');
    expect(shellComm('/usr/local/bin/a-very-long-shell-name')).toBe('a-very-long-she');
  });
});

// The checks a SIGINT arms, through the session's own seams — its process table and its signal primitive — so each
// reading is the one the case names and no delivery depends on where a signal lands. Not applicable on Windows, where
// every signal terminates the session's tree (OQ-10) and nothing is read.
describe.skipIf(process.platform === 'win32')('OQ-135: the checks a SIGINT arms, against a scripted process table', () => {
  const m = (pid: number, ppid: number, comm: string, sigint: GroupMember['sigint'], cmdline: string | null = null): GroupMember => ({ pid, ppid, comm, state: 'S', sigint, cmdline });
  let manager: BackgroundManager | null = null;
  afterEach(async () => { await manager?.dispose(); manager = null; });
  /** A session of a real `sleep` whose group the scripted `reading` stands for; the signals it is sent are recorded. */
  const session = (reading: (leader: number, n: number) => GroupMember[]) => {
    const clock = new FakeClock();
    const kills: (readonly [number, string])[] = [];
    const warnings: string[] = [];
    let reads = 0;
    const table: ProcessTable = { group: () => [], tree: (leader) => reading(leader, reads++) };
    manager = new BackgroundManager({ backend: { kind: 'posix', file: '/bin/sh' }, cwd: tmpdir(), env: { PATH: process.env['PATH'] ?? '' }, monotonic: clock, wall: clock, timers: clock, warn: (w) => warnings.push(w), processes: table, kill: (p, sig) => { kills.push([p, sig]); } });
    const r = manager.start('sleep 30', 60);
    if (!r.ok) throw new Error(r.error);
    const pid = (r.session as unknown as { readonly child: { readonly pid: number } }).child.pid;
    return { s: r.session, pid, clock, kills, warnings, reads: () => reads };
  };

  it('acceptance finding A8, round 3: the command that replaced the shell after the signal is sent it at the check, with what it started, once', () => {
    // Before: dash and its child in the window, both blocking. At each check: the child is Node, catching SIGINT as Node
    // does, with a worker; at the second, also a clean-up the command started on receiving the re-sent signal.
    const t = session((leader, n) => n === 0
      ? [m(leader, 1, 'sh', 'blocked'), m(900_001, leader, 'sh', 'blocked')]
      : [m(leader, 1, 'sh', 'caught'), m(900_001, leader, 'MainThread', 'caught'), m(900_002, 900_001, 'worker', 'caught'), ...(n > 1 ? [m(900_003, 900_001, 'cleanup', 'default')] : [])]);
    expect(t.s.signal('SIGINT')).toBe(true);
    expect(t.kills).toEqual([[-t.pid, 'SIGINT']]);
    expect(t.reads()).toBe(1);
    t.clock.advance(250);
    expect(t.kills).toEqual([[-t.pid, 'SIGINT'], [900_001, 'SIGINT'], [900_002, 'SIGINT']]);
    expect(t.warnings).toHaveLength(2);
    expect(t.warnings[0]).toMatch(/process 900001 was the shell starting its command as SIGINT was sent and never received it \(the shell's vfork window, OQ-135\); SIGINT sent to it once more$/);
    expect(t.warnings[1]).toMatch(/process 900002 was started after SIGINT was sent, by a command that never received it \(the shell's vfork window, OQ-135\); SIGINT sent to it$/);
    t.clock.advance(1_250);
    expect(t.reads()).toBe(3);
    expect(t.kills).toHaveLength(3);
  });

  it('a group whose command was running when the signal landed is read, and sent nothing more — nor is the clean-up it starts', () => {
    const t = session((leader, n) => [m(leader, 1, 'sh', 'caught'), m(900_001, leader, 'MainThread', 'caught'), ...(n > 0 ? [m(900_002, 900_001, 'cleanup', 'default')] : [])]);
    t.s.signal('SIGINT');
    t.clock.advance(1_500);
    expect(t.reads()).toBe(3);
    expect(t.kills).toEqual([[-t.pid, 'SIGINT']]);
    expect(t.warnings).toEqual([]);
  });

  it('only SIGINT is read: the other signals go to the group once, and no check is armed', () => {
    const t = session((leader) => [m(leader, 1, 'sh', 'caught'), m(900_001, leader, 'sh', 'blocked')]);
    for (const sig of ['SIGTERM', 'SIGHUP'] as const) t.s.signal(sig);
    t.clock.advance(1_500);
    expect(t.reads()).toBe(0);
    expect(t.kills).toEqual([[-t.pid, 'SIGTERM'], [-t.pid, 'SIGHUP']]);
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

  // The command as the user runs it: a plain one (the diagnosis's `sleep`), one that installs its own SIGINT handler as it
  // starts (Node), and a shell exec'ing a shell, whose name stays `sh` (acceptance finding A8, round 3: 27 of 150 Node and
  // 39 of 200 `sh -c` sessions ran on under the predicate that asked for SIGINT's default under another name).
  const commands: readonly (readonly [string, string])[] = [
    ['sleep', 'sleep 30'],
    ['Node, which catches SIGINT as it starts', `'${process.execPath}' -e "setInterval(()=>{},1000)"`],
    ['a shell exec\'ing a shell', "sh -c 'sleep 30; echo x'"],
  ];
  for (const [label, command] of commands) {
    it(`REQ-TOOLS-128 / R-044: a SIGINT that lands while dash is starting the command still stops the session (${label})`, async () => {
      const m = make();
      let hit = false;
      // About 1 aimed `sleep` attempt in 37 lands in the window (10, 11 and 10 of about 385 measured on 2026-09-30, with
      // the reading taken before the signal), so 400 leave a miss about 2 in 100 000; a miss costs a few ms, a hit ~250 ms.
      for (let attempt = 0; attempt < 400 && !hit; attempt++) {
        const r = m.start(command, 60);
        if (!r.ok) throw new Error(r.error);
        // The shell's pid, which leads the session's group (the session keeps its process private).
        const pid = (r.session as unknown as { readonly child: { readonly pid: number } }).child.pid;
        // Aim the signal into the window: wait, busily, for dash's child to appear, and send while it has not yet exec'd.
        const by = (clocks.monotonic.now() as number) + 2_000;
        while ((clocks.monotonic.now() as number) < by) if ((read(`/proc/${pid}/task/${pid}/children`).split(' ')[0] ?? '') !== '') break;
        const before = warnings.length;
        expect(r.session.signal('SIGINT')).toBe(true);
        // The session stops — the repaired delivery's checks run at 250 ms and 1.5 s — however the signal landed.
        expect(await ended(r.session, 4_000)).toBe(true);
        expect(r.session.status).toBe('killed');
        // A check sent the signal again: it landed where the shell took it, and the session stopped all the same.
        hit = warnings.length > before;
      }
      // At least one attempt landed in the window, so the case measured the repair and not only the ordinary delivery.
      expect(hit).toBe(true);
      expect(warnings.some((w) => /never received it \(the shell's vfork window, OQ-135\); SIGINT sent to it( once more)?$/.test(w))).toBe(true);
    }, 120_000);
  }

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
