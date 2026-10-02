import { useMemo } from 'react';
import type { BlockerPayload, BoardAction, BoardProjection, ColumnToken, DeliveryQueue, LaunchPreview, Reachability, RendererBridge, ReqId, RequirementDetail, RequirementsChanged, ReviewPayload } from '@rotaris/contracts';
import { commandById, detectPlatform } from '../commands/registry.js';
import { RequirementsView, type ActOutcome, type BoardPreferenceKey, type BoardPreferences, type DispatchOutcome, type HostResult, type LocationPreviewOutcome, type QueueChange, type RequirementsHost, type SourceWriteOutcome } from './RequirementsView.js';

/**
 * Part AK2 — the board's host over the renderer bridge (REQ-TRACE-368..373, 378, 381). The composition root mounts
 * `<RequirementsBoard bridge workspace onOpenSession />` in the view switch and supplies nothing else: every
 * engine-derived value reaches the board through the bridge's `requirements` command family and from no other
 * route (REQ-TRACE-378), the subscription is channel 10 (REQ-TRACE-334), the display preferences go through
 * `prefs.get` / `prefs.set` under the keys REQ-TRACE-301 splits, and the clock is the renderer's wall clock,
 * handed in rather than read inside the view (REQ-TRACE-250/380).
 *
 * Nothing here loads the engine, parses a store or spawns a process (REQ-TRACE-377): the host is a thin
 * translation from the bridge's outcomes to the view's `HostResult`, and a bridge refusal becomes a stated reason.
 * The fold key is the ONE placeholder `contracts` registers (`workspaces/{workspace}/requirementColumnFolds`); main
 * resolves it to the open workspace, so this window can neither read nor write another workspace's folds
 * (REQ-TRACE-312, REQ-TRACE-497).
 */
export interface RequirementsBoardProps {
  readonly bridge: Pick<RendererBridge, 'command' | 'onRequirementsChanged'>;
  readonly workspace: string;
  /** REQ-TRACE-266/269: the application's session opener; absent, the board offers no session control (REQ-TRACE-372). */
  readonly onOpenSession?: ((sessionId: string) => void) | undefined;
}

const FOLDS_KEY: BoardPreferenceKey = 'workspaces/{workspace}/requirementColumnFolds';

export function createRequirementsHost({ bridge, workspace, onOpenSession }: RequirementsBoardProps): RequirementsHost {
  const send = async <T,>(command: Record<string, unknown> & { readonly name: string }): Promise<HostResult<T>> => {
    const r = await bridge.command({ kind: 'requirements', command: { ...command, workspace } } as never);
    if (!r.ok) return { ok: false, reason: r.detail ? `${r.headline}: ${r.detail}` : r.headline };
    return { ok: true, value: r.value as T };
  };
  // Part R2 — main's run coordinator answers `requirements.runs` directly; a refusal becomes the same stated reason.
  const runs = async <T,>(command: Record<string, unknown>): Promise<HostResult<T>> => {
    const r = await bridge.command({ kind: 'requirements.runs', ...command } as never);
    if (!r.ok) return { ok: false, reason: r.detail ? `${r.headline}: ${r.detail}` : r.headline };
    return { ok: true, value: r.value as T };
  };
  const readString = async (key: BoardPreferenceKey): Promise<string> => {
    const r = await bridge.command({ kind: 'prefs.get', key } as never);
    const v = r.ok ? (r.value as { value?: unknown }).value : undefined;
    return typeof v === 'string' ? v : typeof v === 'boolean' ? (v ? 'true' : 'false') : '';
  };
  return {
    workspace,
    readBoard: () => send<BoardProjection>({ name: 'requirements.board' }),
    async readDetail(id: ReqId) {
      const r = await send<RequirementDetail | { readonly error: string }>({ name: 'requirements.detail', id });
      if (!r.ok) return r;
      if ('error' in r.value) return { ok: false, reason: r.value.error };
      return { ok: true, value: r.value };
    },
    refresh: () => send<{ readonly generation: number }>({ name: 'requirements.refresh' }),
    reachable: (id: ReqId, from: ColumnToken, to: ColumnToken) => send<Reachability>({ name: 'requirements.reachable', id, from, to }),
    act: (id: ReqId, action: BoardAction, target: ColumnToken | undefined, payload: Readonly<Record<string, string>> | undefined) =>
      send<ActOutcome>({ name: 'requirements.act', id, action, ...(target === undefined ? {} : { target }), ...(payload === undefined ? {} : { payload }) }),
    // Part R2 — Part AP's panes and its run coordinator, over the same bridge. The service's family travels in the
    // `requirements` envelope (main stamps the actor and replaces the workspace); the launch preview, the dispatch
    // and the permanent suppression are MAIN's own `requirements.runs` command, because main owns the two elevation
    // preferences and the session start (spec 08 §Runs Started from the Board, REQ-TRACE-472).
    readReview: (id: ReqId) => send<ReviewPayload>({ name: 'requirements.review', id }),
    readBlocker: (id: ReqId) => send<BlockerPayload>({ name: 'requirements.blocker', id }),
    setQueue: (change: QueueChange) => send<DeliveryQueue>({ name: 'requirements.queue.set', ...change }),
    writeSource: (request: { readonly id?: ReqId; readonly document: string }) =>
      send<SourceWriteOutcome>({ name: 'requirements.source.write', ...(request.id === undefined ? {} : { id: request.id }), document: request.document }),
    previewLocation: (epic: ReqId | undefined) => send<LocationPreviewOutcome>({ name: 'requirements.source.previewLocation', ...(epic === undefined ? {} : { epic }) }),
    launchPreview: (id: ReqId, action: BoardAction) => runs<LaunchPreview>({ op: 'preview', id, action }),
    dispatchRuns: () => runs<DispatchOutcome>({ op: 'dispatch' }),
    acceptDisclosure: () => runs<unknown>({ op: 'accept' }),
    suppressDisclosure: () => runs<unknown>({ op: 'suppress', suppressed: true }),
    onChanged: (listener: (change: RequirementsChanged) => void) => bridge.onRequirementsChanged((p) => listener(p as RequirementsChanged)),
    async readPreferences(): Promise<BoardPreferences> {
      const [text, epic, source, lifecycle, health, priority, sort, axis, blocked, folds] = await Promise.all([
        readString('requirements/filter/text'), readString('requirements/filter/epic'), readString('requirements/filter/source'), readString('requirements/filter/lifecycle'), readString('requirements/filter/health'), readString('requirements/filter/priority'),
        readString('requirements/sort'), readString('requirements/axis'), readString('requirements/blocked_column'), readString(FOLDS_KEY),
      ]);
      // REQ-TRACE-301's table: the blocked column reads true for anything but the string `false`, case-insensitively.
      return { filter: { text, epic, source, lifecycle, health, priority }, sort, axis, blockedColumn: blocked.trim().toLowerCase() !== 'false', folds };
    },
    writePreference(key: BoardPreferenceKey, value: string) {
      void bridge.command({ kind: 'prefs.set', key, value } as never);
    },
    now: () => new Date().toISOString(),
    localOffsetMinutes: -new Date().getTimezoneOffset(),
    chord: commandById('requirements.move')?.shortcut ?? 'Ctrl+M',
    platform: detectPlatform(),
    openSession: onOpenSession,
  };
}

/** The one line the composition root writes: the board over the bridge, one host per window and workspace (REQ-TRACE-368). */
export function RequirementsBoard({ bridge, workspace, onOpenSession }: RequirementsBoardProps) {
  const host = useMemo(() => createRequirementsHost({ bridge, workspace, onOpenSession }), [bridge, workspace, onOpenSession]);
  return <RequirementsView host={host} />;
}
