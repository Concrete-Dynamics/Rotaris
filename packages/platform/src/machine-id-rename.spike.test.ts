import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { dataLayout, resolveUserDirs } from './dirs.js';
import { isLockForeign, isLockLive } from './liveness.js';
import { readOrMintMachineId } from './machine-id.js';

/**
 * IC-4, second half — the rename experiment, on THIS machine, in two phases
 * around a real rename and reboot the owner performs:
 *
 *   ROTARIS_IC4_PHASE=prepare pnpm vitest run packages/platform/src/machine-id-rename.spike.test.ts
 *   … rename the Windows computer, reboot …
 *   ROTARIS_IC4_PHASE=verify  pnpm vitest run packages/platform/src/machine-id-rename.spike.test.ts
 *
 * `prepare` records the product's machine identifier (`host`, REQ-SESSION-046)
 * and the operating-system hostname, and writes twenty lock records naming
 * `host` into a scratch file. `verify` reads `host` again and asserts it is
 * byte-identical while the hostname differs, that not one of the twenty rows
 * reads as foreign under the product's own predicate, and that none reads as
 * live (their pids are gone with the reboot). What would count as failing:
 * `host` moving for any reason a rename can cause, or a row becoming foreign.
 * Skipped without the phase variable. The result goes into
 * docs/architecture/spikes/machine-identifier-rename.md.
 */
const phase = process.env['ROTARIS_IC4_PHASE'];
const dirs = resolveUserDirs();
const layout = dataLayout(dirs);
const stateDir = join(dirs.data, 'ic4');
const stateFile = join(stateDir, 'state.json');

interface State { host: string; hostname: string; pid: number; locks: { session_id: string; pid: number; host: string; acquired_at: string }[]; preparedAt: string }

describe.skipIf(phase !== 'prepare')('IC-4 prepare — record host and hostname; seed lock rows naming host', () => {
  it('writes the state file', () => {
    const host = readOrMintMachineId(layout.machineId);
    mkdirSync(stateDir, { recursive: true });
    const locks = Array.from({ length: 20 }, (_, i) => ({ session_id: `S-${i}`, pid: process.pid, host, acquired_at: new Date().toISOString() }));
    const state: State = { host, hostname: hostname(), pid: process.pid, locks, preparedAt: new Date().toISOString() };
    writeFileSync(stateFile, JSON.stringify(state, null, 1));
    console.log(`[ic4] prepared: host=${host} hostname=${hostname()} pid=${process.pid} → ${stateFile}`);
    expect(existsSync(stateFile)).toBe(true);
  });
});

describe.skipIf(phase !== 'verify')('IC-4 verify — after the rename and reboot', () => {
  it('host is byte-identical, the hostname changed, no row is foreign, none is live', () => {
    const state = JSON.parse(readFileSync(stateFile, 'utf8')) as State;
    const host = readOrMintMachineId(layout.machineId);
    const foreign = state.locks.filter((l) => isLockForeign(l, host));
    const live = state.locks.filter((l) => !isLockForeign(l, host) && isLockLive(l, host));
    console.log(`[ic4] before: host=${state.host} hostname=${state.hostname}; after: host=${host} hostname=${hostname()}; foreign=${foreign.length} live=${live.length}`);
    expect(host).toBe(state.host);
    expect(hostname()).not.toBe(state.hostname);
    expect(foreign).toEqual([]);
    expect(live).toEqual([]);
  });
});
