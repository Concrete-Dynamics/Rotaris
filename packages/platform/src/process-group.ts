import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * OQ-135 (REQ-TOOLS-110, REQ-TOOLS-128): what the Linux process table says about the members of one process group — the
 * facts a background session reads to tell whether a SIGINT it sent reached each of them.
 *
 * Linux only, from `/proc`: `stat` gives a process's name, its state and its group, and `status` gives its signal masks.
 * The name is the one `exec` gave it, so a process that replaces its image changes it. There is no such table on macOS or
 * Windows, and
 * neither needs one: macOS's `/bin/sh` is `bash`, which blocks signals across its fork, and on Windows every signal
 * terminates the session's tree (OQ-10).
 */

/** How a process stands towards SIGINT, read from `/proc/<pid>/status`, the first that holds winning. */
export type SigintStanding = 'pending' | 'blocked' | 'ignored' | 'caught' | 'default';

export interface GroupMember {
  readonly pid: number;
  /** `/proc/<pid>/stat`'s command name: the file name its last `exec` ran, at most 15 characters. */
  readonly comm: string;
  /** `/proc/<pid>/stat`'s state letter: `Z` a zombie, `X` dead. */
  readonly state: string;
  readonly sigint: SigintStanding;
}

export interface ProcessTable {
  /** The live members of process group `pgid`, read from every entry of the table; empty when none can be read. */
  readonly group: (pgid: number) => readonly GroupMember[];
  /**
   * The group `leader` leads, as far as it descends from the leader: the leader and, through each member's
   * `task/<pid>/children`, its children and theirs that are still in the group. A few reads, where `group` reads the
   * whole table — so it can be taken the instant before a signal is sent without pushing the signal later than the
   * window it is read for (OQ-135). Only each process's main thread's children are listed, which is every child a
   * shell has. Where the kernel keeps no `children` file it is `group(leader)`.
   */
  readonly tree: (leader: number) => readonly GroupMember[];
}

/** The kernel's bound on a command name (TASK_COMM_LEN less its terminator): a longer file name is cut to this. */
export const COMM_MAX_CHARS = 15;

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

/** `/proc/<pid>/stat`: the command name between the first `(` and the last `)` — it may itself hold both — then the fields. */
export function parseStat(stat: string): { readonly comm: string; readonly state: string; readonly pgrp: number } | null {
  const open = stat.indexOf('(');
  const close = stat.lastIndexOf(')');
  if (open < 0 || close < open) return null;
  // Fields 3 onward; `state` is field 3 and `pgrp` field 5 (proc(5)).
  const f = stat.slice(close + 2).split(' ');
  const pgrp = Number(f[2]);
  if (f[0] === undefined || f[0] === '' || !Number.isInteger(pgrp)) return null;
  return { comm: stat.slice(open + 1, close), state: f[0], pgrp };
}

/** The Linux process table under `procRoot`; null on any other platform. */
export function linuxProcessTable(procRoot = '/proc', platform: NodeJS.Platform = process.platform): ProcessTable | null {
  if (platform !== 'linux') return null;
  const read = (...p: string[]): string | null => { try { return readFileSync(join(procRoot, ...p), 'utf8'); } catch { return null; } };
  const member = (pid: number, pgid: number): GroupMember | null => {
    const stat = read(String(pid), 'stat');
    const parsed = stat === null ? null : parseStat(stat);
    if (!parsed || parsed.pgrp !== pgid) return null;
    const status = read(String(pid), 'status');
    return status === null ? null : { pid, comm: parsed.comm, state: parsed.state, sigint: sigintStanding(status) };
  };
  const group = (pgid: number): GroupMember[] => {
    let entries: string[];
    try { entries = readdirSync(procRoot); } catch { return []; }
    const out: GroupMember[] = [];
    for (const e of entries) {
      if (!/^\d+$/.test(e)) continue;
      const m = member(Number(e), pgid);
      if (m) out.push(m);
    }
    return out;
  };
  return {
    group,
    tree: (leader) => {
      if (read(String(leader), 'stat') !== null && read(String(leader), 'task', String(leader), 'children') === null) return group(leader);
      const out: GroupMember[] = [];
      const seen = new Set<number>();
      const queue = [leader];
      while (queue.length > 0) {
        const pid = queue.shift()!;
        if (seen.has(pid)) continue;
        seen.add(pid);
        const m = member(pid, leader);
        if (!m) continue;
        out.push(m);
        for (const c of (read(String(pid), 'task', String(pid), 'children') ?? '').split(' ')) if (/^\d+$/.test(c)) queue.push(Number(c));
      }
      return out;
    },
  };
}
