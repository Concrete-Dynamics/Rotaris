import type { CommandOutcome, CommandRequest } from '@rotaris/contracts';

/**
 * THE MCP ROW'S TOGGLE — which command a press on a configured server's switch issues (PD-CONFIG-006, with
 * REQ-MCP-091/094/115 and REQ-CONFIG-441).
 *
 * Until 2026-11-08 one command was sent for every press (`mcp.setEnabled`), and the run host's one writer is a
 * disable-only set — on a row whose entry is configured `enabled: false` the `true` direction removed nothing, so the
 * press changed nothing at all. PD-CONFIG-006 rules that case a durable write: an **available** row whose configured
 * value is `false` persists `mcp_servers.<name>.enabled: true` through the scoped per-field write path, in one press,
 * followed by the run host's reload (main fires `mcp.reload` itself, after its own write succeeded, and the listing is
 * read again). Every other press keeps the session toggle of REQ-MCP-094. It lives here, not in the composition root,
 * so the decision — which of the two controls a press is — is testable without a window.
 */
export interface McpToggleRow {
  readonly name: string;
  readonly enabled: boolean;
  readonly overridden: boolean;
  readonly available: boolean;
}

/** What one press sends: the durable write when the rules call for it, and always the session command that follows. */
export interface McpTogglePlan {
  /** The `config.setField` write for a configured-off, available row turned on; `null` keeps the press session-scoped. */
  readonly durable: CommandRequest | null;
  /** The session command: the press itself, or the override-clearing `enabled: true` after a durable write. */
  readonly session: CommandRequest;
}

/** PD-CONFIG-006: an ON press on an available, configured-off row is durable; every other press is REQ-MCP-094's. */
export function mcpTogglePlan(row: McpToggleRow, enabled: boolean): McpTogglePlan {
  const durable = enabled && row.available && !row.enabled;
  if (durable) {
    return {
      durable: { kind: 'config.setField', patch: { mcp_servers: { [row.name]: { enabled: true } } } },
      // PD-CONFIG-006: the durable write clears any session override the name holds, so the two controls of
      // REQ-MCP-115 never disagree about a row the user just switched on. A reload alone never clears one.
      session: { kind: 'mcp.setEnabled', name: row.name, enabled: true },
    };
  }
  return { durable: null, session: { kind: 'mcp.setEnabled', name: row.name, enabled } };
}

/**
 * The press, in the order it happens: the durable write first (a failure stops there — the row stays off and the
 * refusal is shown), then the override-clearing session command, then the re-read that repopulates the listing.
 * `useMcp`'s `onToggle` is this function and nothing else.
 */
export async function pressMcpToggle(
  deps: { readonly command: (req: CommandRequest) => Promise<CommandOutcome>; readonly read: () => Promise<void> },
  row: McpToggleRow,
  enabled: boolean,
): Promise<{ ok: boolean; message: string }> {
  /** ADR-0019: `bridge.command` rejects when main's handler throws or the channel is gone, and the caller is a click handler. */
  async function command(req: CommandRequest): Promise<CommandOutcome> {
    try { return await deps.command(req); }
    catch (cause) { return { ok: false, code: 'command.unreachable', headline: 'The application did not answer', detail: cause instanceof Error ? cause.message : String(cause) }; }
  }
  const plan = mcpTogglePlan(row, enabled);
  if (plan.durable !== null) {
    const w = await command(plan.durable);
    if (!w.ok) return { ok: false, message: w.detail ?? w.headline };
    await command(plan.session);
    await deps.read();
    return { ok: true, message: `${row.name} enabled — written to the configuration file.` };
  }
  const r = await command(plan.session);
  await deps.read();
  return r.ok
    ? { ok: true, message: enabled ? `${row.name} enabled for this session.` : `${row.name} disabled for this session.` }
    : { ok: false, message: r.detail ?? r.headline };
}
