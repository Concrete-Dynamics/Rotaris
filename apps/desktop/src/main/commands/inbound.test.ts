import { describe, expect, it } from 'vitest';
import type { CommandOutcome, InboundExposure } from '@rotaris/contracts';
import { inboundCommands, type InboundControl } from './inbound.js';

/**
 * REQ-MCP-120/121: the inbound surface's settings commands. `inbound.status` re-reads the exposure and NEVER carries the
 * token (REQ-MCP-121: shown once); `inbound.setEnabled` enables or disables, and only the enabling press's answer carries
 * the token.
 */
function control(over: Partial<InboundControl> = {}): { readonly c: InboundControl; readonly calls: string[] } {
  const calls: string[] = [];
  const c: InboundControl = {
    state: (includeToken): InboundExposure => (includeToken ? { enabled: true, port: 51234, token: 'tok-1' } : { enabled: true, port: 51234 }),
    enable: async (): Promise<CommandOutcome> => { calls.push('enable'); return { ok: true, value: { enabled: true, port: 51234, token: 'tok-1' } }; },
    disable: async (): Promise<CommandOutcome> => { calls.push('disable'); return { ok: true, value: { enabled: false, port: null } }; },
    ...over,
  };
  return { c, calls };
}

describe('REQ-MCP-120/121: the inbound surface’s settings commands', () => {
  it('a status read never carries the token', async () => {
    const { c } = control();
    const out = await inboundCommands(c)['inbound.status']({ kind: 'inbound.status' }, {} as never);
    expect(out).toEqual({ ok: true, value: { enabled: true, port: 51234 } });
    expect(JSON.stringify(out)).not.toContain('tok-1');
  });

  it('enabling carries the token once, and disabling carries none', async () => {
    const { c, calls } = control();
    const handlers = inboundCommands(c);
    const on = await handlers['inbound.setEnabled']({ kind: 'inbound.setEnabled', enabled: true }, {} as never);
    expect(on).toEqual({ ok: true, value: { enabled: true, port: 51234, token: 'tok-1' } });
    const off = await handlers['inbound.setEnabled']({ kind: 'inbound.setEnabled', enabled: false }, {} as never);
    expect(off).toEqual({ ok: true, value: { enabled: false, port: null } });
    expect(calls).toEqual(['enable', 'disable']);
  });

  it('a refused enable is reported to the renderer as a refusal', async () => {
    const { c } = control({ enable: async () => ({ ok: false, code: 'inbound.bindFailed', headline: 'The inbound surface could not be bound to loopback' }) });
    const out = await inboundCommands(c)['inbound.setEnabled']({ kind: 'inbound.setEnabled', enabled: true }, {} as never);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.code).toBe('inbound.bindFailed');
  });
});
