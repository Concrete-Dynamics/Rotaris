import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * OQ-135 (REQ-TOOLS-110, REQ-TOOLS-128): what the Linux process table says about the members of one process group — the
 * facts a background session reads to tell whether a SIGINT it sent reached each of them.
 *
 * Linux only, from `/proc`: `stat` gives a process's group, its state and its start time in clock ticks since boot, and
 * `status` gives its signal masks. `uptime` gives the same clock now. There is no such table on macOS or Windows, and
 * neither needs one: macOS's `/bin/sh` is `bash`, which blocks signals across its fork, and on Windows every signal
 * terminates the session's tree (OQ-10).
 */

/** How a process stands towards SIGINT, read from `/proc/<pid>/status`, the first that holds winning. */
export type SigintStanding = 'pending' | 'blocked' | 'ignored' | 'caught' | 'default';

export interface GroupMember {
  readonly pid: number;
  /** `/proc/<pid>/stat`'s state letter: `Z` a zombie, `X` dead. */
  readonly state: string;
  /** When the process was created (its `fork`, not its `exec`), in clock ticks since boot. */
  readonly startTicks: number;
  readonly sigint: SigintStanding;
}

export interface ProcessTable {
  /** Clock ticks since boot, now — the clock `startTicks` is read on; null when it cannot be read. */
  readonly nowTicks: () => number | null;
  /** The live members of process group `pgid`; empty when none can be read. */
  readonly group: (pgid: number) => readonly GroupMember[];
}

/**
 * `/proc`'s clock tick, USER_HZ. The kernel reports every `/proc` time in it and fixes it at 100 for user space on the
 * architectures this product builds for, whatever the kernel's own HZ.
 */
export const PROC_TICKS_PER_SECOND = 100;

/** Signal `n` is bit `n − 1` of a mask: SIGINT (2) and SIGKILL (9). Both sit in the mask's low 32 bits. */
const SIGINT_BIT = 1 << 1;
const SIGKILL_BIT = 1 << 8;

/** The low 32 bits of one of `status`'s hexadecimal signal masks — all that SIGINT and SIGKILL need. */
function mask(status: string, field: string): number {
  const m = new RegExp(`^${field}:\\s*([0-9a-fA-F]+)`, 'm').exec(status);
  return m ? parseInt(m[1]!.slice(-8), 16) : 0;
}

/** The standing `status` gives SIGINT. A pending SIGINT or SIGKILL is a delivery the process has yet to act on. */
export function sigintStanding(status: string): SigintStanding {
  const pending = mask(status, 'SigPnd') | mask(status, 'ShdPnd');
  if ((pending & (SIGINT_BIT | SIGKILL_BIT)) !== 0) return 'pending';
  if ((mask(status, 'SigBlk') & SIGINT_BIT) !== 0) return 'blocked';
  if ((mask(status, 'SigIgn') & SIGINT_BIT) !== 0) return 'ignored';
  if ((mask(status, 'SigCgt') & SIGINT_BIT) !== 0) return 'caught';
  return 'default';
}

/** `/proc/<pid>/stat` after the command name, which may itself hold spaces and parentheses. */
export function parseStat(stat: string): { readonly state: string; readonly pgrp: number; readonly startTicks: number } | null {
  const close = stat.lastIndexOf(')');
  if (close < 0) return null;
  // Fields 3 onward; `state` is field 3, `pgrp` field 5 and `starttime` field 22 (proc(5)).
  const f = stat.slice(close + 2).split(' ');
  const pgrp = Number(f[2]);
  const startTicks = Number(f[19]);
  if (f[0] === undefined || !Number.isInteger(pgrp) || !Number.isFinite(startTicks)) return null;
  return { state: f[0], pgrp, startTicks };
}

/** The Linux process table under `procRoot`; null on any other platform. */
export function linuxProcessTable(procRoot = '/proc', platform: NodeJS.Platform = process.platform): ProcessTable | null {
  if (platform !== 'linux') return null;
  const read = (...p: string[]): string | null => { try { return readFileSync(join(procRoot, ...p), 'utf8'); } catch { return null; } };
  return {
    nowTicks: () => {
      const up = Number((read('uptime') ?? '').split(' ')[0]);
      return Number.isFinite(up) && up > 0 ? Math.floor(up * PROC_TICKS_PER_SECOND) : null;
    },
    group: (pgid) => {
      let entries: string[];
      try { entries = readdirSync(procRoot); } catch { return []; }
      const out: GroupMember[] = [];
      for (const e of entries) {
        if (!/^\d+$/.test(e)) continue;
        const stat = read(e, 'stat');
        const parsed = stat === null ? null : parseStat(stat);
        if (!parsed || parsed.pgrp !== pgid) continue;
        const status = read(e, 'status');
        if (status === null) continue;
        out.push({ pid: Number(e), state: parsed.state, startTicks: parsed.startTicks, sigint: sigintStanding(status) });
      }
      return out;
    },
  };
}
