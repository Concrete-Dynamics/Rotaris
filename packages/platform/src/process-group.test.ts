import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { linuxProcessTable, parseStat, sigintStanding, type GroupMember } from './process-group.js';

/**
 * OQ-135 (REQ-TOOLS-110, REQ-TOOLS-128): the facts a background session reads to tell whether a SIGINT reached each
 * member of its group. The masks are `/proc/<pid>/status`'s; SIGINT is bit 1, SIGKILL bit 8.
 */
describe('OQ-135: the process table a SIGINT is checked against', () => {
  const status = (m: Partial<Record<'SigPnd' | 'ShdPnd' | 'SigBlk' | 'SigIgn' | 'SigCgt', string>>): string =>
    ['SigPnd', 'ShdPnd', 'SigBlk', 'SigIgn', 'SigCgt'].map((k) => `${k}:\t${m[k as keyof typeof m] ?? '0000000000000000'}`).join('\n');

  it('reads SIGINT\'s standing from the masks, a pending delivery first', () => {
    expect(sigintStanding(status({}))).toBe('default');
    // `dash` under -c, as the diagnosis read it: SIGINT and SIGCHLD caught.
    expect(sigintStanding(status({ SigCgt: '0000000000010002' }))).toBe('caught');
    expect(sigintStanding(status({ SigIgn: '0000000000000002' }))).toBe('ignored');
    expect(sigintStanding(status({ SigBlk: '0000000000000002', SigCgt: '0000000000000002' }))).toBe('blocked');
    expect(sigintStanding(status({ ShdPnd: '0000000000000002', SigBlk: '0000000000000002' }))).toBe('pending');
    // A fatal SIGINT at the default is turned into a pending SIGKILL while the process dies.
    expect(sigintStanding(status({ SigPnd: '0000000000000100' }))).toBe('pending');
    // Another signal's bits say nothing about SIGINT.
    expect(sigintStanding(status({ SigCgt: '0000000000004000', SigIgn: '0000000000001000' }))).toBe('default');
  });

  it('parses stat\'s command name, holding spaces and parentheses, and the fields after it', () => {
    const fields = ['S', '1', '4242', '4242', '0', '-1', '4194560', ...Array.from({ length: 12 }, () => '0'), '987654'];
    expect(parseStat(`4243 (a (b) c) ${fields.join(' ')} 0 0`)).toEqual({ comm: 'a (b) c', state: 'S', ppid: 1, pgrp: 4242 });
    expect(parseStat('garbage')).toBeNull();
  });

  it('reads a group from a /proc tree: its members only, with their name, state and standing', () => {
    const root = mkdtempSync(join(tmpdir(), 'rotaris-proc-'));
    try {
      const proc = (pid: number, ppid: number, comm: string, pgrp: number, st: string, cmdline?: string) => {
        mkdirSync(join(root, String(pid)));
        writeFileSync(join(root, String(pid), 'stat'), `${pid} (${comm}) S ${ppid} ${pgrp} ${pgrp} 0 -1 0 ${Array.from({ length: 12 }, () => '0').join(' ')} 5000 0`);
        writeFileSync(join(root, String(pid), 'status'), st);
        if (cmdline !== undefined) writeFileSync(join(root, String(pid), 'cmdline'), cmdline);
      };
      proc(10, 1, 'sh', 10, status({ SigCgt: '0000000000010002' }), '/bin/sh\0-c\0sleep 30\0');
      // No arguments to read: the member is still read, its arguments unknown.
      proc(11, 10, 'sleep', 10, status({}));
      proc(12, 1, 'sh', 99, status({}), 'sh\0');
      mkdirSync(join(root, 'self'));
      const table = linuxProcessTable(root, 'linux')!;
      expect([...table.group(10)].sort((a, b) => a.pid - b.pid)).toEqual([
        { pid: 10, ppid: 1, comm: 'sh', state: 'S', sigint: 'caught', cmdline: '/bin/sh\0-c\0sleep 30\0' },
        { pid: 11, ppid: 10, comm: 'sleep', state: 'S', sigint: 'default', cmdline: null },
      ]);
      expect(table.group(77)).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('reads the group a leader leads by walking its descendants, and the whole table where the kernel keeps no children file', () => {
    const root = mkdtempSync(join(tmpdir(), 'rotaris-proc-'));
    try {
      const proc = (pid: number, comm: string, pgrp: number, children: string | null) => {
        mkdirSync(join(root, String(pid), 'task', String(pid)), { recursive: true });
        writeFileSync(join(root, String(pid), 'stat'), `${pid} (${comm}) S 1 ${pgrp} ${pgrp} 0 -1 0 ${Array.from({ length: 12 }, () => '0').join(' ')} 5000 0`);
        writeFileSync(join(root, String(pid), 'status'), status({}));
        if (children !== null) writeFileSync(join(root, String(pid), 'task', String(pid), 'children'), children);
      };
      // 10 leads; 11 is its child and 12 its grandchild; 13 left the group with its child 14; 15 is in the group but
      // no descendant (reparented), which only the whole table finds.
      proc(10, 'sh', 10, '11 13 ');
      proc(11, 'sh', 10, '12 ');
      proc(12, 'sleep', 10, '');
      proc(13, 'setsid', 13, '14 ');
      proc(14, 'x', 13, '');
      proc(15, 'orphan', 10, '');
      const table = linuxProcessTable(root, 'linux')!;
      expect(table.tree(10).map((m) => m.pid)).toEqual([10, 11, 12]);
      expect(table.tree(99)).toEqual([]);
      rmSync(join(root, '10', 'task'), { recursive: true });
      expect(table.tree(10).map((m) => m.pid).sort((a, b) => a - b)).toEqual([10, 11, 12, 15]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('is Linux\'s alone: every other platform has none', () => {
    expect(linuxProcessTable('/proc', 'darwin')).toBeNull();
    expect(linuxProcessTable('/proc', 'win32')).toBeNull();
  });

  // Not applicable where `/bin/sh` is not `dash`: `bash` execs a lone command, so the group has one member.
  const dash = process.platform === 'linux' && (() => { try { return realpathSync('/bin/sh').endsWith('dash'); } catch { return false; } })();
  describe.skipIf(!dash)('against the host\'s own /proc (Linux, `/bin/sh` being `dash`)', () => {
    let child: ChildProcess | null = null;
    afterEach(() => { if (child?.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } } child = null; });

    it('a `dash -c` group reads its shell catching SIGINT under the shell\'s name, and its command at the default under its own', async () => {
      child = spawn('/bin/sh', ['-c', 'sleep 30'], { detached: true, stdio: 'ignore' });
      const table = linuxProcessTable()!;
      const pid = child.pid!;
      let members = table.group(pid);
      for (let i = 0; i < 200 && !members.some((m) => m.comm === 'sleep'); i++) { await new Promise((r) => setTimeout(r, 10)); members = table.group(pid); }
      const shell = members.find((m) => m.pid === pid)!;
      const command = members.find((m) => m.pid !== pid)!;
      expect(members).toHaveLength(2);
      expect(shell).toMatchObject({ comm: 'sh', sigint: 'caught', cmdline: '/bin/sh\0-c\0sleep 30\0' });
      // Acceptance finding A8, round 3: the command's own parent and arguments, which an `exec` gives it.
      expect(command).toMatchObject({ ppid: pid, comm: 'sleep', sigint: 'default', cmdline: 'sleep\x0030\0' });
      // The walk from the leader reads the same two: the same processes with the same parent, name, SIGINT standing and
      // arguments. Not the same state letter: the walk is a second read of `/proc`, and as the scheduler runs a process it
      // can read `R` or `D` in one and `S` in the other, both rightly (the repair of
      // the-process-group-test-compares-two-proc-reads-including-each-process-state.md).
      const lasting = ({ state: _state, ...rest }: GroupMember) => rest;
      const byPid = (a: GroupMember, b: GroupMember) => a.pid - b.pid;
      expect([...table.tree(pid)].sort(byPid).map(lasting)).toEqual([...members].sort(byPid).map(lasting));
    });
  });
});
