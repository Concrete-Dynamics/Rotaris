/**
 * PD-CONFIG-006 / REQ-CONFIG-417's destination 1, narrowed: a settings press that persists `enabled: true` for an
 * available server changes the workspace's `agents.yaml`, and the run host's one cache of that workspace's resolved
 * configuration (`configured`, written by `configure` at every run start and read by `configuredFor`) still holds
 * the value the process resolved before the write. This drops that one entry and configures the workspace again, so
 * the next `mcp.list` — and the next run — reads the file. The run host never writes the file; main calls this after
 * a successful `config.setField` of `mcp_servers` (`mcp.reload`).
 *
 * The order matters: the entry is dropped BEFORE the re-configure, so a failed re-configure leaves the cache empty
 * rather than stale — the next read configures again (and fails the same way) instead of serving a resolution taken
 * before the edit that broke it.
 *
 * Generic over the cached value so the host's `Map<string, ConfiguredRun>` and a test's minimal stand-in both fit.
 */
export function reloadWorkspaceConfiguration<T>(
  configured: Map<string, T>,
  configure: (workspaceRoot: string) => { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly reason: string } },
  workspaceRoot: string,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  configured.delete(workspaceRoot);
  const r = configure(workspaceRoot);
  return r.ok ? { ok: true } : { ok: false, reason: r.error.reason };
}
