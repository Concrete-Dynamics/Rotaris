import { describe, expect, it } from 'vitest';
import { FakeClock, millis } from '@rotaris/kernel';
import { CONTRACT_SCHEMA_VERSION, type RunHostRequest } from '@rotaris/contracts';
import { ProcessLink, type MessagePortLike } from '@rotaris/shell';
import { handOffOpenedWorkspace, type WorkspaceOpenedRequest } from './workspace-handoff.js';

// docs/defects/fixed/a-workspace-opened-timeout-is-an-unhandled-main-rejection.md: `compression-proof`'s `automatic` launch
// logged "UNHANDLED rejection in main: Error: no reply to workspace.opened within 5000 ms" and never reached its measurement.
// These run the hand-off over main's own `ProcessLink` against a run host that answers late or never; vitest fails a file
// in which a rejection goes unhandled, so a hand-off that let the timeout escape is red here as well as by its result.

const REQUEST: WorkspaceOpenedRequest = { kind: 'workspace.opened', workspaceId: 'v1-ws', storeFile: 'C:/store/workspace.db', workspaceRoot: 'C:/ws' };

/** A run-host side that records each request and answers only when told to. */
function runHostPort(): { port: MessagePortLike; requests: { id: number; kind: string }[]; answer: (id: number, reply: unknown) => void } {
  let deliver: ((message: unknown) => void) | undefined;
  const requests: { id: number; kind: string }[] = [];
  return {
    port: {
      postMessage: (m) => { const e = m as { id: number; request: RunHostRequest }; requests.push({ id: e.id, kind: e.request.kind }); },
      onMessage: (f) => { deliver = f; return () => { deliver = undefined; }; },
    },
    requests,
    answer: (id, reply) => deliver?.({ v: CONTRACT_SCHEMA_VERSION, id, reply }),
  };
}

describe('the hand-off of an opened workspace to the run host (W-18, ADR-0002 consequence 11)', () => {
  it('a reply that never comes within the bound is a warning and an unacknowledged hand-off, never a rejection', async () => {
    const clock = new FakeClock();
    const host = runHostPort();
    const link = new ProcessLink<RunHostRequest>(host.port, clock);
    const lines: { message: string; level: string }[] = [];
    const handOff = handOffOpenedWorkspace({ request: (r, b) => link.request(r, b), log: (message, level) => lines.push({ message, level }) }, REQUEST, millis(5_000));
    expect(host.requests).toEqual([{ id: 1, kind: 'workspace.opened' }]);
    clock.advance(5_000);
    await expect(handOff).resolves.toEqual({ reply: null, acknowledged: false });
    expect(lines).toEqual([{
      level: 'warn',
      message: 'workspace C:/ws → v1-ws: the run host did not acknowledge workspace.opened (no reply to workspace.opened within 5000 ms); '
        + 'the window keeps the workspace, and its open slot (initialization, the board, the hook review, the configuration) is not scheduled (OQ-386)',
    }]);
    // A reply that arrives after the bound finds no pending request and changes nothing.
    host.answer(1, { kind: 'workspace.ack', workspaceId: 'v1-ws' });
    expect(lines).toHaveLength(1);
    link.close();
  });

  it('a link closed before the reply is the same unacknowledged hand-off', async () => {
    const clock = new FakeClock();
    const host = runHostPort();
    const link = new ProcessLink<RunHostRequest>(host.port, clock);
    const lines: string[] = [];
    const handOff = handOffOpenedWorkspace({ request: (r, b) => link.request(r, b), log: (message) => lines.push(message) }, REQUEST, millis(5_000));
    link.close();
    await expect(handOff).resolves.toEqual({ reply: null, acknowledged: false });
    expect(lines[0]).toContain('the run host did not acknowledge workspace.opened (link closed)');
  });

  it('a reply within the bound is returned as it came, acknowledged only when it is workspace.ack', async () => {
    const clock = new FakeClock();
    const host = runHostPort();
    const link = new ProcessLink<RunHostRequest>(host.port, clock);
    const lines: string[] = [];
    const deps = { request: (r: WorkspaceOpenedRequest, b: ReturnType<typeof millis>) => link.request(r, b), log: (message: string) => { lines.push(message); } };
    const acked = handOffOpenedWorkspace(deps, REQUEST, millis(5_000));
    clock.advance(4_999);
    host.answer(1, { kind: 'workspace.ack', workspaceId: 'v1-ws' });
    await expect(acked).resolves.toEqual({ reply: { kind: 'workspace.ack', workspaceId: 'v1-ws' }, acknowledged: true });
    const refused = handOffOpenedWorkspace(deps, REQUEST, millis(5_000));
    host.answer(2, { kind: 'refused', code: 'workspace.refusing', headline: 'New runs are refused for this workspace while a restore is under way' });
    await expect(refused).resolves.toEqual({ reply: { kind: 'refused', code: 'workspace.refusing', headline: 'New runs are refused for this workspace while a restore is under way' }, acknowledged: false });
    expect(lines).toEqual([]);
    link.close();
  });
});
