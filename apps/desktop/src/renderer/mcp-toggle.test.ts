import { describe, expect, it } from 'vitest';
import type { CommandOutcome, CommandRequest } from '@rotaris/contracts';
import { mcpTogglePlan, pressMcpToggle } from './mcp-toggle.js';

/**
 * PD-CONFIG-006 at the press: which command a switch sends. The row on screen decides — an AVAILABLE row whose
 * configured value is `false` turned ON is the durable write through `config.setField` (REQ-CONFIG-441), followed
 * by the override-clearing session command; every other press is the session toggle of REQ-MCP-094.
 */
const row = (over: Partial<{ name: string; enabled: boolean; overridden: boolean; available: boolean }> = {}) =>
  ({ name: 'browser', enabled: false, overridden: false, available: true, ...over });

describe('the press a configured-off MCP row sends (PD-CONFIG-006)', () => {
  it('an available, configured-off row turned ON writes the field and clears any session override', () => {
    const plan = mcpTogglePlan(row(), true);
    expect(plan.durable).toEqual({ kind: 'config.setField', patch: { mcp_servers: { browser: { enabled: true } } } });
    expect(plan.session).toEqual({ kind: 'mcp.setEnabled', name: 'browser', enabled: true });
  });

  it('every other press keeps the session toggle', () => {
    expect(mcpTogglePlan(row({ enabled: true }), false).durable).toBeNull(); // the on → off press
    expect(mcpTogglePlan(row({ enabled: true }), true).durable).toBeNull();
    expect(mcpTogglePlan(row({ available: false }), true).durable).toBeNull(); // REQ-CONFIG-349: never pressable
    expect(mcpTogglePlan(row(), false).durable).toBeNull();
  });

  it('the press runs write → override clear → re-read, and a refused write stops there with its words', async () => {
    const sent: CommandRequest[] = [];
    let reads = 0;
    const okCommand = async (req: CommandRequest): Promise<CommandOutcome> => { sent.push(req); return { ok: true, value: {} }; };
    const written = await pressMcpToggle({ command: okCommand, read: async () => { reads += 1; } }, row(), true);
    expect(written.ok).toBe(true);
    expect(sent.map((s) => s.kind)).toEqual(['config.setField', 'mcp.setEnabled']);
    expect(reads).toBe(1);

    sent.length = 0;
    reads = 0;
    const refused = await pressMcpToggle({
      command: async (req) => { sent.push(req); return { ok: false, code: 'config.write', headline: 'The configuration could not be written', detail: 'agents.yaml: read-only' }; },
      read: async () => { reads += 1; },
    }, row(), true);
    expect(refused).toEqual({ ok: false, message: 'agents.yaml: read-only' });
    expect(sent.map((s) => s.kind)).toEqual(['config.setField']);
    expect(reads).toBe(0);
  });

  it('a session press stays one command and one re-read', async () => {
    const sent: CommandRequest[] = [];
    let reads = 0;
    const r = await pressMcpToggle({ command: async (req) => { sent.push(req); return { ok: true, value: {} }; }, read: async () => { reads += 1; } }, row({ enabled: true }), false);
    expect(r).toEqual({ ok: true, message: 'browser disabled for this session.' });
    expect(sent.map((s) => s.kind)).toEqual(['mcp.setEnabled']);
    expect(reads).toBe(1);
  });
});
