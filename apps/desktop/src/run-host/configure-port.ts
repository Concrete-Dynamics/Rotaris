import { configKeySegments, type ProcessReply, type ServiceAsk } from '@rotaris/contracts';
import { isPlainMap, readSavedConfiguration, renderFatal, statingFileOf } from '@rotaris/config';
import { millis, type Millis } from '@rotaris/kernel';
import type { ConfigurationPort, ConfigurationReading } from '@rotaris/agent-tools';

/** PD-CONFIG-014: how long the run host waits for main and the workspace service to write and load again. */
export const CONFIGURE_ASK_MS = 30_000;

export interface ConfigurationPortDeps {
  readonly globalDir: string;
  /** The BASE workspace (REQ-WORKSPACE-050): its `.rotaris/` holds the configuration, never a worktree's. */
  readonly workspaceRoot: string;
  readonly ask: (request: ServiceAsk, boundMs: Millis) => Promise<ProcessReply>;
  /** PD-CONFIG-006's reload of the run host's cached resolution, after a write that changed the tool servers. */
  readonly reload: (workspaceRoot: string) => void;
  readonly log: (message: string, level?: 'info' | 'warn') => void;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

function valueAt(doc: unknown, segments: readonly string[]): unknown {
  let at: unknown = doc;
  for (const s of segments) {
    if (!isPlainMap(at)) return undefined;
    at = at[s];
  }
  return at;
}

/**
 * PD-CONFIG-014: the `configure` tool's port. `read` answers from the SAVED configuration (`readSavedConfiguration`, which
 * reads again only when a file it read has changed), so it sees a write made a moment ago; `write` never touches a file
 * here — the run host never writes configuration (the state-ownership view) — it asks main, which relays to the workspace
 * service, the one writer, and announces the reloaded snapshot.
 */
export function configurationPort(deps: ConfigurationPortDeps): ConfigurationPort {
  return {
    read(key) {
      const segments = configKeySegments(key);
      if (segments === null) return { error: `${key} is not a key` };
      const saved = readSavedConfiguration({ globalDir: deps.globalDir, workspaceRoot: deps.workspaceRoot, ...(deps.env ? { env: deps.env } : {}) });
      if (!saved.ok) return { error: renderFatal(saved.error) };
      // The file that states the key itself, not only its section: the workspace scope wins (REQ-CONFIG-031), and within a
      // scope `models.yml` overlays the `models:` of `agents.yaml` (REQ-CONFIG-004).
      const stating = statingFileOf(key, saved.value.files, saved.value.raw);
      let found: { scope: 'workspace' | 'global'; file: string } | null = null;
      for (const scope of ['workspace', 'global'] as const) {
        const raw = saved.value.raw[scope];
        if (segments[0] === 'models' && valueAt(raw.models, segments) !== undefined) { found = { scope, file: saved.value.files[scope].models }; break; }
        if (valueAt(raw.agents, segments) !== undefined) { found = { scope, file: stating?.scope === scope ? stating.file : saved.value.files[scope].agents }; break; }
      }
      const reading: ConfigurationReading = { value: valueAt(saved.value.merged, segments), scope: found?.scope ?? 'default', file: found?.file ?? null };
      return reading;
    },
    async write(key, scope, value) {
      const reply = await deps.ask({ kind: 'config.agentWrite', workspaceRoot: deps.workspaceRoot, scope, key, ...(value === undefined ? {} : { value }) }, millis(CONFIGURE_ASK_MS))
        .catch((cause: Error): ProcessReply => ({ kind: 'refused', code: 'ask.failed', headline: cause.message }));
      if (reply.kind !== 'config.agentWritten') {
        const why = reply.kind === 'refused' ? `${reply.headline}${reply.detail === undefined ? '' : ` — ${reply.detail}`}` : `main answered ${reply.kind}`;
        deps.log(`configure: ${key} (${scope}) was not written: ${why}`, 'warn');
        return { ok: false, error: why };
      }
      deps.log(`configure: ${key} written in the ${scope} scope (${reply.file})`);
      // PD-CONFIG-006: the cached resolution holds the tool servers the process read before; a write there drops it.
      if (key === 'mcp_servers' || key.startsWith('mcp_servers.')) deps.reload(deps.workspaceRoot);
      return { ok: true, file: reply.file, stated: reply.stated, before: reply.before };
    },
  };
}
