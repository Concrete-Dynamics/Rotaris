import type { BrowserWindow } from 'electron';
import { CHANNEL, CONTRACT_SCHEMA_VERSION, type CommandOutcome, type CommandRequest, type ConfigSnapshot } from '@rotaris/contracts';
import { canonicalPath, samePath } from '@rotaris/platform';
import { millis } from '@rotaris/kernel';
import { announceConfig, configFamily, type ConfigFamilyView } from '../config-broadcast.js';
import { refusal, type CommandAt, type CommandContext, type CommandHandlers } from './context.js';

/**
 * `config:changed` for one workspace's reloaded snapshot, to each main window and its family (`configFamily`: its persona and
 * terminal windows) as its own workspace reads (`announceConfig`): the holders of `root` take `snapshot`, every other family
 * its own workspace's snapshot read again from its service.
 */
export function configAnnouncer(
  mainWindows: { ordered(): readonly (ConfigFamilyView<BrowserWindow> & { readonly workspace: string })[] },
  services: CommandContext['services'],
): (root: string, snapshot: ConfigSnapshot) => Promise<void> {
  const readOwn = async (workspace: string): Promise<ConfigSnapshot | null> => {
    const own = canonicalPath(workspace);
    const svc = services.get(own);
    if (!svc) return null;
    const r = await svc.link.request({ kind: 'config.read', workspaceRoot: own }, millis(10_000));
    return r.kind === 'config.snapshot' ? r.snapshot : null;
  };
  return (root, snapshot) => announceConfig(root, snapshot, mainWindows.ordered().map((m) => ({
    workspace: m.workspace,
    send: (s) => { for (const win of configFamily(m)) if (!win.isDestroyed()) win.webContents.send(CHANNEL.configChanged, { v: CONTRACT_SCHEMA_VERSION, snapshot: s }); },
  })), { samePath, readOwn });
}

/**
 * CONFIGURATION — the layered read, one field written, and the live state a running session is subject to
 * (ADR-0036/0037, REQ-CONFIG-*). The file is the workspace service's; main asks for the resolved view and
 * never parses YAML of its own.
 */
export function configCommands(
  ctx: Pick<CommandContext, 'log' | 'mainWindows' | 'raiseNotice' | 'runHost' | 'services'>,
): Pick<CommandHandlers, 'config.read' | 'repository.read' | 'config.save' | 'config.setField' | 'config.liveState'> {
  const { log, mainWindows, raiseNotice, runHost, services } = ctx;
  const announce = configAnnouncer(mainWindows, services);
  const onConfigSave = async (req: Extract<CommandRequest, { kind: 'config.save' | 'config.setField' }>, { w }: CommandAt): Promise<CommandOutcome> => {
    // ADR-0037 Tier A: the service writes and loads again; every window repopulates from the reloaded snapshot (decision 4 of the plan for REQ-CONFIG-423)
    // — its own workspace's: the holders of this one take it, every other window its own read again (`announceConfig`).
    if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before changing its configuration' };
    const svc = services.get(canonicalPath(w.workspace));
    if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
    const root = canonicalPath(w.workspace);
    const runtimePatch = req.kind === 'config.save' ? req.save.runtime : req.patch['runtime'];
    const explicitCollectorEnable = runtimePatch !== null && typeof runtimePatch === 'object'
      && (runtimePatch as Record<string, unknown>)['improvement_collector_enabled'] === true;
    if (explicitCollectorEnable) {
      const current = await svc.link.request({ kind: 'config.read', workspaceRoot: root }, millis(10_000));
      if (current.kind === 'config.snapshot') {
        const slots = new Map<string, string | null>(current.snapshot.slots.map((slot) => [slot.slot, slot.value]));
        if (req.kind === 'config.save') for (const [slot, value] of Object.entries(req.save.slots ?? {})) slots.set(slot, value);
        if (!slots.get('improvement_collector_model') && !slots.get('medium_model')) {
          return { ok: false, code: 'config.improvement-model', headline: 'medium_model must be configured to enable the post-run improvement collector.' };
        }
      }
    }
    const r = await svc.link.request(req.kind === 'config.save' ? { kind: 'config.save', workspaceRoot: root, save: req.save } : { kind: 'config.setField', workspaceRoot: root, ...(req.scope ? { scope: req.scope } : {}), patch: req.patch }, millis(30_000));
    if (r.kind !== 'config.snapshot') { if (r.kind === 'refused') raiseNotice('error', r.headline, r.detail); return refusal(r, 'The configuration could not be written'); }
    void announce(root, r.snapshot);
    log(`configuration ${req.kind === 'config.save' ? 'saved' : 'field written'} for ${root}`);
    return { ok: true, value: r.snapshot };
  };
  return {
    'config.read': async (_req, { w, awaitWorkspace }) => {
      // Part Q's first execution: the renderer asks for the configuration as it mounts, before the argv workspace has opened; without
      // this wait the answer was `workspace.none`, the run header's model list stayed empty (REQ-MONITOR-144) and the wait header
      // had no "Change model" to offer. `repository.read` already waited; this read did not.
      await awaitWorkspace();
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before reading its configuration' };
      const svc = services.get(canonicalPath(w.workspace));
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      const r = await svc.link.request({ kind: 'config.read', workspaceRoot: canonicalPath(w.workspace) }, millis(10_000));
      return r.kind === 'config.snapshot' ? { ok: true, value: r.snapshot } : refusal(r, 'The configuration could not be read');
    },
    'repository.read': async (_req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before reading its repository' };
      const svc = services.get(canonicalPath(w.workspace));
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      // REQ-GIT-102: five reads at 15 s each is the bound; the request waits for all of them.
      const r = await svc.link.request({ kind: 'repository.read', workspaceRoot: canonicalPath(w.workspace) }, millis(80_000));
      if (r.kind !== 'repository.state') return refusal(r, 'The repository could not be read');
      // PD-MONITOR-002, live-run finding a71-9: the read's line is the workspace service's, which performed it; main relays
      // the answer and does not write the same fact a second time.
      return { ok: true, value: r.state };
    },
    'config.save': onConfigSave,
    'config.setField': onConfigSave,
    'config.liveState': async (req) => {
      // ADR-0037 Tier B: the settings store's current values reach the run host ahead of the next run start.
      const r = await runHost.request({ kind: 'config.liveState', state: req.state }, millis(5_000));
      return r.kind === 'ack' ? { ok: true } : refusal(r, 'The live settings could not be handed over');
    },
  };
}
