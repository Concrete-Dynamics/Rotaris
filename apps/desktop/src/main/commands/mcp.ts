import { millis } from '@rotaris/kernel';
import { refusal, type CommandContext, type CommandHandlers } from './context.js';

/**
 * MCP AND CONFINEMENT — the servers a workspace declares, the probe, the session override and the stored
 * secrets (ADR-0033/0034), beside the confinement verdict (ADR-0022). The run host answers all of them: it
 * holds the pipeline, and it is the process that executes commands.
 */
export function mcpCommands(
  ctx: Pick<CommandContext, 'runHost'>,
): Pick<CommandHandlers, 'mcp.list' | 'mcp.probe' | 'mcp.setEnabled' | 'mcp.secrets' | 'confinement.status' | 'mcp.setup'> {
  const { runHost } = ctx;
  return {
    // ADR-0034 (Part S): the MCP category is answered by the run host, the one holder of the pipeline, the probe and the session override.
    'mcp.list': async (_req, { w }) => {
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace first' };
      const r = await runHost.request({ kind: 'mcp.list', workspaceId: w.workspaceId }, millis(10_000));
      return r.kind === 'mcp.list' ? { ok: true, value: r.listing } : refusal(r, 'The MCP servers could not be listed');
    },
    'mcp.probe': async (req, { w }) => {
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace first' };
      const r = await runHost.request({ kind: 'mcp.probe', workspaceId: w.workspaceId, ...(req.name === undefined ? {} : { name: req.name }) }, millis(req.name === undefined ? 120_000 : 12_000));
      return r.kind === 'mcp.probe' ? { ok: true, value: r.results } : refusal(r, 'The MCP server could not be probed');
    },
    'mcp.setEnabled': async (req) => {
      const r = await runHost.request({ kind: 'mcp.setEnabled', name: req.name, enabled: req.enabled }, millis(10_000));
      return r.kind === 'ack' ? { ok: true } : refusal(r, 'The session toggle could not be applied');
    },
    'mcp.secrets': async (req, { w }) => {
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace first' };
      const r = await runHost.request({ kind: 'mcp.secrets', workspaceId: w.workspaceId, ...(req.server === undefined ? {} : { server: req.server }) }, millis(10_000));
      return r.kind === 'mcp.secrets' ? { ok: true, value: r.view } : refusal(r, 'The stored secrets could not be read');
    },
    /**
     * ADR-0022 (Part AR): main relays; the run host owns the verdict because it is the process that
     * executes commands (REQ-SANDBOX-067, REQ-SANDBOX-094). No workspace is required — whether this
     * HOST can confine anything is a property of the machine, and REQ-SANDBOX-130's disclosure is
     * owed on the settings surface before any workspace question is settled. The bound is the
     * probe's own 5.0 s (REQ-SANDBOX-069) plus the round trip.
     */
    'confinement.status': async (req) => {
      const r = await runHost.request({ kind: 'confinement.status', ...(req.recheck === undefined ? {} : { recheck: req.recheck }) }, millis(10_000));
      return r.kind === 'confinement.status' ? { ok: true, value: r.verdict } : refusal(r, 'The confinement availability could not be read');
    },
    // ADR-0035 (Part T) / REQ-MCP-099/112: the code-intelligence project setup runs in the run host; main relays the action and the status.
    'mcp.setup': async (req, { w }) => {
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace first' };
      const r = await runHost.request({ kind: 'mcp.setup', workspaceId: w.workspaceId, action: req.action }, millis(15_000));
      return r.kind === 'mcp.setup' ? { ok: true, value: r.status } : refusal(r, 'The code-intelligence setup could not be started');
    },
  };
}
