import { millis } from '@rotaris/kernel';
import { canonicalPath } from '@rotaris/platform';
import type { CommandOutcome, CommandRequest } from '@rotaris/contracts';
import { refusal, type CommandAt, type CommandContext, type CommandHandlers } from './context.js';

/**
 * MCP AND CONFINEMENT — the servers a workspace declares, the probe, the session override and the stored
 * secrets (ADR-0033/0034), beside the confinement verdict (ADR-0022). The run host answers the reads: it
 * holds the pipeline, and it is the process that executes commands. The two secret WRITES (REQ-MCP-110/111)
 * are the one exception: the workspace service is the only writer of configuration files
 * (`docs/architecture/views/05-state-ownership.md`), so main relays the store there and then asks the run
 * host to drop its cached resolution through the EXISTING `mcp.reload` seam PD-CONFIG-006 built — never a
 * second one; a stored secret changes what the next resolution reads, exactly as an `enabled` write does.
 */
export function mcpCommands(
  ctx: Pick<CommandContext, 'log' | 'raiseNotice' | 'runHost' | 'services'>,
): Pick<CommandHandlers, 'mcp.list' | 'mcp.probe' | 'mcp.setEnabled' | 'mcp.secrets' | 'mcp.setSecret' | 'mcp.unsetSecret' | 'confinement.status' | 'mcp.setup'> {
  const { log, raiseNotice, runHost, services } = ctx;
  /**
   * REQ-MCP-110's write, and REQ-MCP-111's controlled half: one secret stored (or replaced) and one deleted,
   * each relayed to the workspace service in the scope the surface named (`workspace` when none, REQ-CONFIG-463).
   * The answer is the service's masked confirmation alone — server, key, scope, the one mask (REQ-MCP-081) —
   * so no value crosses back to the renderer (W-01) and none is logged; a refusal raises the notice REQ-MCP-084/110
   * require, its detail naming the file and the requirement unmet. After a SUCCESSFUL write the run host drops its
   * cached resolution of this workspace (`mcp.reload`), so the category's listing and probe reflect the store
   * without a restart — the same call `config.setField` makes after an `mcp_servers` write, and the same reason:
   * a failed reload leaves no stale entry behind, so the write itself is still reported as the success it was.
   */
  const secretWrite = (kind: 'mcp.setSecret' | 'mcp.unsetSecret') =>
    async (req: Extract<CommandRequest, { kind: 'mcp.setSecret' | 'mcp.unsetSecret' }>, { w }: CommandAt): Promise<CommandOutcome> => {
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before storing a secret' };
      const root = canonicalPath(w.workspace);
      const svc = services.get(root);
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      const written = req.kind === 'mcp.setSecret'
        ? await svc.link.request({ kind: 'mcp.setSecret', workspaceRoot: root, server: req.server, key: req.key, value: req.value, ...(req.scope ? { scope: req.scope } : {}) }, millis(30_000))
        : await svc.link.request({ kind: 'mcp.unsetSecret', workspaceRoot: root, server: req.server, key: req.key, ...(req.scope ? { scope: req.scope } : {}) }, millis(30_000));
      if (written.kind === 'refused') raiseNotice('error', written.headline, written.detail);
      if (written.kind !== 'mcp.secretWritten') return refusal(written, kind === 'mcp.setSecret' ? 'The secret could not be stored' : 'The secret could not be deleted');
      // PD-CONFIG-006, the one reload seam, reused. Only a write that CHANGED the store can make the cached
      // resolution stale: a set always writes, and a delete that found nothing wrote nothing (REQ-CONFIG-217), so it
      // asks for no reload — the same "a refusal to reload leaves no stale entry behind" reading main's config
      // facet states, mirrored for the no-op that needs no reload at all.
      if (kind === 'mcp.setSecret' || written.removed) {
        const reload = await runHost.request({ kind: 'mcp.reload', workspaceId: w.workspaceId }, millis(30_000));
        if (reload.kind !== 'ack') log(`the run host could not reload ${root} after a stored secret was written: ${reload.kind === 'refused' ? `${reload.headline}${reload.detail === undefined ? '' : ` — ${reload.detail}`}` : reload.kind}`, 'warn');
      }
      log(`stored secret ${kind === 'mcp.setSecret' ? 'written' : 'deleted'} for ${root}: '${req.server}' in the ${req.scope ?? 'workspace'} scope (REQ-MCP-110)`);
      return { ok: true, value: written };
    };
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
    'mcp.setSecret': secretWrite('mcp.setSecret'),
    'mcp.unsetSecret': secretWrite('mcp.unsetSecret'),
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
