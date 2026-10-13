import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { millis, type MachineId } from '@rotaris/kernel';
import { nodeClocks } from './clock.js';
import type * as Document from './document.js';

/**
 * ADR-0055: "the endpoint is listening before the record is written, not after" (REQ-STARTUP-161, REQ-STARTUP-164).
 * `exclusiveCreate` is wrapped so the test stands where a second launch stands: at the very moment the record is
 * written, it looks for the endpoint the record names and connects to it. Until fin34 the record came first and the
 * connection was refused (`docs/defects/fixed/the-instance-record-is-written-before-its-endpoint-listens.md`).
 */
type Watcher = (target: string, content: string) => void;
let atRecordWrite: Watcher | undefined;
vi.mock('./document.js', async (importOriginal) => {
  const original = await importOriginal<typeof Document>();
  return {
    ...original,
    exclusiveCreate: (target: string, content: string) => {
      atRecordWrite?.(target, content);
      return original.exclusiveCreate(target, content);
    },
  };
});
const { claimInstance } = await import('./instance.js');

const clocks = nodeClocks();
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-order-')); });
afterEach(() => { atRecordWrite = undefined; rmSync(dir, { recursive: true, force: true }); });

const deps = (pid: number) => ({
  recordFile: join(dir, 'instance.json'), endpointDir: dir, socketDir: dir, machineId: 'machine-test' as MachineId, pid,
  wall: clocks.wall, timers: clocks.timers, handOverIntervalMs: millis(2_000), onHandOver: () => undefined,
});

describe('the claim\'s order — ADR-0055, REQ-STARTUP-161, REQ-STARTUP-164', () => {
  it.skipIf(process.platform === 'win32')('the endpoint the record names is already accepting when the record is written', async () => {
    const seen: { endpoint: string; existed: boolean; connected: Promise<boolean> }[] = [];
    atRecordWrite = (_target, content) => {
      const endpoint = (JSON.parse(content) as { endpoint: string }).endpoint;
      // What a second launch reading the record at this instant does: connect to the address it names.
      const connected = new Promise<boolean>((resolve) => {
        const sock = connect(endpoint);
        sock.once('connect', () => { sock.destroy(); resolve(true); });
        sock.once('error', () => resolve(false));
      });
      seen.push({ endpoint, existed: existsSync(endpoint), connected });
    };
    const claim = await claimInstance(deps(process.pid));
    expect(claim.outcome).toBe('instance');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.existed).toBe(true);
    expect(await seen[0]?.connected).toBe(true);
    if (claim.outcome === 'instance') await claim.close();
  });

  it.skipIf(process.platform === 'win32')('a launch that loses the claim closes the endpoint it opened first: no socket of its own is left', async () => {
    const first = await claimInstance(deps(process.ppid));
    if (first.outcome !== 'instance') throw new Error(first.outcome);
    const second = await claimInstance(deps(process.pid), { workspace: '/w' });
    expect(second.outcome).toBe('handed-over');
    const sockets = readdirSync(dir).filter((f) => f.endsWith('.sock'));
    expect(sockets).toEqual([first.record.endpoint.slice(dir.length + 1)]);
    await first.close();
    expect(readdirSync(dir).filter((f) => f.endsWith('.sock'))).toEqual([]);
  });

  // OQ-248 (R-072, 2026-10-13): what an attempt creates to hold its endpoint is the record's, and a launch that is handed over
  // leaves nothing behind — on the temporary-directory fallback too, where the directory below the temporary one was shared
  // and never removed (docs/defects/fixed/a-handed-over-launch-can-leave-the-private-socket-directory-behind.md).
  it.skipIf(process.platform === 'win32')('on the temporary-directory fallback a handed-over launch leaves nothing behind, and the instance takes its own directory with it when it closes', async () => {
    const temp = join(dir, 'tmp');
    mkdirSync(temp);
    const deep = join(dir, 'a'.repeat(60), 'b'.repeat(60));
    mkdirSync(deep, { recursive: true });
    const fallback = (pid: number) => {
      // As production claims: no socket directory of its own, no runtime directory, a data directory too deep for a socket.
      const { socketDir: _named, ...rest } = deps(pid);
      return { ...rest, endpointDir: deep, tempDirs: [temp], env: {} };
    };
    const first = await claimInstance(fallback(process.ppid));
    if (first.outcome !== 'instance') throw new Error(first.outcome);
    const own = dirname(first.record.endpoint);
    expect(dirname(own)).toBe(temp);
    const second = await claimInstance(fallback(process.pid), { workspace: '/w' });
    expect(second.outcome).toBe('handed-over');
    // Only the instance's own directory, holding only its own socket.
    expect(readdirSync(temp)).toEqual([basename(own)]);
    expect(readdirSync(own)).toEqual([basename(first.record.endpoint)]);
    await first.close();
    expect(readdirSync(temp)).toEqual([]);
  });
});
