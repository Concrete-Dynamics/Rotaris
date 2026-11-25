import type { CommandOutcome, InboundExposure, ProcessReply } from '@rotaris/contracts';
import { refusal, type CommandHandlers } from './context.js';

/**
 * THE INBOUND SURFACE'S SETTINGS COMMANDS (ADR-0067; REQ-MCP-120). `inbound.status` re-reads the exposure (a surface that
 * mounts while it is on) and `inbound.setEnabled` turns it on for THIS session or off again. The switch sits in the
 * register of the per-server enable toggle of the MCP category (REQ-MCP-120) and adds NO configuration key: main holds
 * the exposure, forks the listener, and shows the port and the token while it is on.
 *
 * The token is carried back ONLY on the enabling press (`REQ-MCP-121`: shown once) — `inbound.status` never returns it,
 * so a later read cannot leak it, and nothing here logs it.
 */
export interface InboundControl {
  /** The exposure as a surface reads it; `includeToken` only for the enabling press. */
  readonly state: (includeToken: boolean) => InboundExposure;
  /** REQ-MCP-120: turn the surface on for this session — fork the listener, enable it, answer the port it chose. */
  readonly enable: () => Promise<CommandOutcome>;
  /** REQ-MCP-120/121: turn it off — disable the listener (the token dies with it) and end the exposure. */
  readonly disable: () => Promise<CommandOutcome>;
}

export function inboundCommands(control: InboundControl): Pick<CommandHandlers, 'inbound.status' | 'inbound.setEnabled'> {
  return {
    'inbound.status': () => ({ ok: true, value: control.state(false) }),
    'inbound.setEnabled': async (req) => (req.enabled ? control.enable() : control.disable()),
  };
}

/** A listener reply that is not the one asked for becomes a refusal the renderer can show (ADR-0019: nothing throws). */
export function inboundRefusal(r: ProcessReply, headline: string): CommandOutcome {
  return refusal(r, headline);
}
