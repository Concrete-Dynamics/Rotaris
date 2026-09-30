import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { linuxProcessTable, parseStat, sigintStanding } from './process-group.js';

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

  it('parses stat past a command name holding spaces and parentheses', () => {
    const fields = ['S', '1', '4242', '4242', '0', '-1', '4194560', ...Array.from({ length: 12 }, () => '0'), '987654'];
    expect(parseStat(`4243 (a (b) c) ${fields.join(' ')} 0 0`)).toEqual({ state: 'S', pgrp: 4242, startTicks: 987654 });
    expect(parseStat('garbage')).toBeNull();
  });

  it('reads a group from a /proc tree: its members only, with their state, start and standing', () => {
    const root = mkdtempSync(join(tmpdir(), 'rotaris-proc-'));
    try {
      const proc = (pid: number, pgrp: number, start: number, st: string) => {
        mkdirSync(join(root, String(pid)));
        writeFileSync(join(root, String(pid), 'stat'), `${pid} (sh) S 1 ${pgrp} ${pgrp} 0 -1 0 ${Array.from({ length: 12 }, () => '0').join(' ')} ${start} 0`);
        writeFileSync(join(root, String(pid), 'status'), st);
      };
      writeFileSync(join(root, 'uptime'), '1234.56 999.00\n');
      proc(10, 10, 5000, status({ SigCgt: '0000000000010002' }));
      proc(11, 10, 123455, status({}));
      proc(12, 99, 1, status({}));
      mkdirSync(join(root, 'self'));
      const table = linuxProcessTable(root, 'linux')!;
      expect(table.nowTicks()).toBe(123456);
      expect([...table.group(10)].sort((a, b) => a.pid - b.pid)).toEqual([
        { pid: 10, state: 'S', startTicks: 5000, sigint: 'caught' },
        { pid: 11, state: 'S', startTicks: 123455, sigint: 'default' },
      ]);
      expect(table.group(77)).toEqual([]);
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

    it('a `dash -c` group reads its shell catching SIGINT and its command at the default, both started before now', async () => {
      child = spawn('/bin/sh', ['-c', 'sleep 30'], { detached: true, stdio: 'ignore' });
      const table = linuxProcessTable()!;
      const pid = child.pid!;
      let members = table.group(pid);
      for (let i = 0; i < 200 && members.length < 2; i++) { await new Promise((r) => setTimeout(r, 10)); members = table.group(pid); }
      const now = table.nowTicks()!;
      const shell = members.find((m) => m.pid === pid)!;
      const command = members.find((m) => m.pid !== pid)!;
      expect(members).toHaveLength(2);
      expect(shell.sigint).toBe('caught');
      expect(command.sigint).toBe('default');
      for (const m of members) expect(m.startTicks).toBeLessThanOrEqual(now);
    });
  });
});
